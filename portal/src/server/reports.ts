import "server-only";
import { createHash } from "node:crypto";
import { db, type Tx } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { nextId } from "@/lib/ids";
import { customerName } from "@/lib/format";
import { signToken } from "@/lib/storage";
import { REPORT_STAGE_LABEL, type ReportStage } from "@/lib/constants";
import type { Answers, TemplateSchema } from "@/lib/templates/types";
import { allFields, validateField } from "@/lib/templates/validate";
import { notifyUsers } from "@/lib/notify";
import { DomainError, NotFound } from "./errors";

type ActorLite = Pick<SessionUser, "id" | "orgId" | "name">;

/**
 * Reports are generated artefacts. A version's snapshot freezes everything the document
 * shows, so later edits to master data never alter an issued report.
 */
export type ReportSnapshot = {
  generatedAt: string;
  stage: ReportStage;
  vendor: { name: string; gstin: string | null; address: string | null; email: string | null; phone: string | null };
  requester: string;
  rfqNumber: string;
  jobNumber: string;
  surveyNumber: string;
  surveyType: string;
  areaName: string;
  surveyArea: string;
  locationName: string;
  surveyDate: string;
  containerNumber: string | null;
  cargoName: string | null;
  surveyor: string | null;
  template: TemplateSchema;
  answers: Answers;
  verdict: string | null;
  verdictReason: string | null;
  completionNotes: string | null;
  photos: { slot: string; attachmentId: string; takenAt: string; lat: number | null; lng: number | null }[];
  letterheadAttachmentId: string | null;
  signedHash?: string;
  issuedBy?: string;
};

export async function buildSnapshot(tx: Tx, surveyId: string, stage: ReportStage): Promise<ReportSnapshot> {
  const s = await tx.survey.findUniqueOrThrow({
    where: { id: surveyId },
    include: {
      template: true,
      photos: { orderBy: { createdAt: "asc" } },
      jobOrder: { include: { rfq: { include: { customer: true, org: true } }, surveyType: true, assignments: { include: { surveyor: true } } } },
    },
  });
  const job = s.jobOrder;
  const rfq = job.rfq;
  const surveyor =
    job.assignments.find((a) => a.surveyorId === s.surveyorId)?.surveyor.name ??
    job.assignments.find((a) => ["IN_PROGRESS", "COMPLETED"].includes(a.status))?.surveyor.name ??
    null;
  const lh = await tx.letterhead.findFirst({ where: { orgId: rfq.orgId, active: true } });
  return {
    generatedAt: new Date().toISOString(),
    stage,
    vendor: { name: rfq.org.name, gstin: rfq.org.gstin, address: [rfq.org.address, rfq.org.city, rfq.org.state].filter(Boolean).join(", ") || null, email: rfq.org.email, phone: rfq.org.phone },
    requester: customerName(rfq.customer),
    rfqNumber: rfq.number,
    jobNumber: job.number,
    surveyNumber: s.number,
    surveyType: job.surveyType.name,
    areaName: rfq.areaName,
    surveyArea: rfq.surveyArea,
    locationName: job.location,
    surveyDate: job.surveyDate.toISOString(),
    containerNumber: job.containerNumber,
    cargoName: rfq.cargoName,
    surveyor,
    template: JSON.parse(s.template.schema),
    answers: JSON.parse(s.answers),
    verdict: s.verdict,
    verdictReason: s.verdictReason,
    completionNotes: s.completionNotes,
    photos: s.photos.map((p) => ({ slot: p.slot, attachmentId: p.attachmentId, takenAt: p.takenAt.toISOString(), lat: p.lat, lng: p.lng })),
    letterheadAttachmentId: lh?.attachmentId ?? null,
  };
}

/** Create (or re-version, if not yet issued) reports for the given stages. */
export async function generateSurveyReports(tx: Tx, actor: ActorLite | null, surveyId: string, stages: ReportStage[]) {
  const survey = await tx.survey.findUniqueOrThrow({ where: { id: surveyId }, include: { jobOrder: true } });
  for (const stage of stages) {
    const snapshot = await buildSnapshot(tx, surveyId, stage);
    const existing = await tx.report.findUnique({ where: { surveyId_stage: { surveyId, stage } } });
    if (!existing) {
      const r = await tx.report.create({
        data: {
          number: await nextId(tx, "RPT"),
          orgId: survey.jobOrder.orgId,
          surveyId,
          stage,
          status: "GENERATED",
          currentVersion: 1,
          versions: { create: { version: 1, snapshot: JSON.stringify(snapshot), createdById: actor?.id ?? "system", reason: "Generated from survey data" } },
        },
      });
      await audit(tx, actor, { entityType: "REPORT", entityId: r.id, rfqId: survey.jobOrder.rfqId, action: "REPORT_GENERATED", toStatus: "GENERATED", note: `${REPORT_STAGE_LABEL[stage]} ${r.number}` });
    } else if (!["ISSUED", "REISSUED"].includes(existing.status)) {
      const v = existing.currentVersion + 1;
      await tx.reportVersion.create({ data: { reportId: existing.id, version: v, snapshot: JSON.stringify(snapshot), createdById: actor?.id ?? "system", reason: "Regenerated from updated survey data" } });
      await tx.report.update({ where: { id: existing.id }, data: { currentVersion: v, status: "GENERATED" } });
      await audit(tx, actor, { entityType: "REPORT", entityId: existing.id, rfqId: survey.jobOrder.rfqId, action: "REPORT_GENERATED", fromStatus: existing.status, toStatus: "GENERATED", note: `${REPORT_STAGE_LABEL[stage]} v${v}` });
    }
  }
}

async function loadReport(tx: Tx, actor: ActorLite, reportId: string) {
  const r = await tx.report.findFirst({ where: { id: reportId, orgId: actor.orgId }, include: { survey: { include: { jobOrder: true } }, versions: { orderBy: { version: "desc" }, take: 1 } } });
  if (!r) throw new NotFound("Report");
  return r;
}

/** Vendor can generate a Preliminary Report from in-progress data at any time. */
export async function generatePreliminary(actor: ActorLite, surveyId: string) {
  return db.$transaction(async (tx) => {
    const s = await tx.survey.findFirst({ where: { id: surveyId, jobOrder: { orgId: actor.orgId } } });
    if (!s) throw new NotFound("Survey");
    if (s.status === "NOT_STARTED") throw new DomainError("The survey hasn't started yet — nothing to report");
    await generateSurveyReports(tx, actor, surveyId, ["PRELIMINARY"]);
  });
}

export async function sendForReview(actor: ActorLite, reportId: string) {
  return db.$transaction(async (tx) => {
    const r = await loadReport(tx, actor, reportId);
    if (!["GENERATED", "AMENDED"].includes(r.status)) throw new DomainError("Only generated or amended reports can be sent for review");
    await tx.report.update({ where: { id: r.id }, data: { status: "UNDER_REVIEW" } });
    await audit(tx, actor, { entityType: "REPORT", entityId: r.id, rfqId: r.survey.jobOrder.rfqId, action: "REPORT_REVIEW", fromStatus: r.status, toStatus: "UNDER_REVIEW" });
  });
}

/** Issue = lock. An issued version is immutable; later changes go through amendReport(). */
export async function issueReport(actor: ActorLite, reportId: string) {
  return db.$transaction(async (tx) => {
    const r = await loadReport(tx, actor, reportId);
    if (!["GENERATED", "UNDER_REVIEW", "AMENDED"].includes(r.status)) throw new DomainError(`Report is ${r.status.toLowerCase()} and cannot be issued`);
    if (r.stage === "SIGNED") throw new DomainError("Signed reports are produced automatically when the Formal Report is issued");
    if (["COMPLETION", "FORMAL", "CERTIFICATE"].includes(r.stage) && !["SUBMITTED", "COMPLETED"].includes(r.survey.status))
      throw new DomainError("The survey must be submitted before this report can be issued");
    const next = r.status === "AMENDED" ? "REISSUED" : "ISSUED";
    const latest = r.versions[0];
    await tx.reportVersion.update({ where: { id: latest.id }, data: { locked: true } });
    await tx.report.update({ where: { id: r.id }, data: { status: next, issuedAt: new Date() } });
    await audit(tx, actor, { entityType: "REPORT", entityId: r.id, rfqId: r.survey.jobOrder.rfqId, action: "REPORT_ISSUED", fromStatus: r.status, toStatus: next, note: `${REPORT_STAGE_LABEL[r.stage as ReportStage]} v${latest.version}` });

    if (r.stage === "FORMAL") {
      // Signed Report = the issued formal snapshot + a tamper-evident hash and issuer.
      const snap = JSON.parse(latest.snapshot) as ReportSnapshot;
      const signed: ReportSnapshot = { ...snap, stage: "SIGNED", issuedBy: actor.name, signedHash: createHash("sha256").update(latest.snapshot).digest("hex") };
      const existing = await tx.report.findUnique({ where: { surveyId_stage: { surveyId: r.surveyId, stage: "SIGNED" } } });
      if (!existing) {
        const sr = await tx.report.create({
          data: {
            number: await nextId(tx, "RPT"), orgId: r.orgId, surveyId: r.surveyId, stage: "SIGNED", status: "ISSUED", issuedAt: new Date(), currentVersion: 1,
            versions: { create: { version: 1, snapshot: JSON.stringify(signed), createdById: actor.id, locked: true, reason: `Signed from Formal Report v${latest.version}` } },
          },
        });
        await audit(tx, actor, { entityType: "REPORT", entityId: sr.id, rfqId: r.survey.jobOrder.rfqId, action: "REPORT_ISSUED", toStatus: "ISSUED", note: `Signed Report ${sr.number}` });
      } else {
        const v = existing.currentVersion + 1;
        await tx.reportVersion.create({ data: { reportId: existing.id, version: v, snapshot: JSON.stringify(signed), createdById: actor.id, locked: true, reason: `Re-signed from Formal Report v${latest.version}` } });
        await tx.report.update({ where: { id: existing.id }, data: { currentVersion: v, status: "REISSUED", issuedAt: new Date() } });
        await audit(tx, actor, { entityType: "REPORT", entityId: existing.id, rfqId: r.survey.jobOrder.rfqId, action: "REPORT_ISSUED", fromStatus: existing.status, toStatus: "REISSUED", note: `Signed Report v${v}` });
      }
    }
  });
}

/**
 * Tracked amendment: changes to structured values produce a NEW version.
 * Prior versions stay immutable; the document shows an "Amended on … by …" banner.
 */
export async function amendReport(
  actor: ActorLite,
  reportId: string,
  input: { changes: Answers; verdict?: string | null; verdictReason?: string | null; narrative?: string | null; reason: string },
) {
  if (!input.reason?.trim()) throw new DomainError("An amendment reason is required", { reason: "Required" });
  return db.$transaction(async (tx) => {
    const r = await loadReport(tx, actor, reportId);
    if (r.stage === "SIGNED") throw new DomainError("Amend the Formal Report; the signed copy is regenerated when it is re-issued");
    const latest = r.versions[0];
    const snap = JSON.parse(latest.snapshot) as ReportSnapshot;
    const fields = new Map(allFields(snap.template).map((f) => [f.id, f]));
    const errors: Record<string, string> = {};
    const diff: Record<string, { from: unknown; to: unknown }> = {};
    const answers = { ...snap.answers };
    for (const [k, v] of Object.entries(input.changes)) {
      const f = fields.get(k);
      if (!f) continue;
      const e = validateField(f, { ...answers, [k]: v }, true);
      if (e) errors[k] = e;
      if (JSON.stringify(answers[k]) !== JSON.stringify(v)) diff[k] = { from: answers[k], to: v };
      answers[k] = v;
    }
    if (input.verdict !== undefined && input.verdict !== snap.verdict) {
      if (input.verdict === "UNFIT" && !(input.verdictReason ?? snap.verdictReason)) errors.__verdictReason = "Reason required for UNFIT";
      diff.verdict = { from: snap.verdict, to: input.verdict };
    }
    if (Object.keys(errors).length) throw new DomainError("Some amended values are invalid", errors);
    if (!Object.keys(diff).length && (input.narrative ?? null) === (latest.narrative ?? null)) throw new DomainError("Nothing changed");
    const v = r.currentVersion + 1;
    const next: ReportSnapshot = {
      ...snap,
      answers,
      verdict: input.verdict !== undefined ? input.verdict : snap.verdict,
      verdictReason: input.verdictReason !== undefined ? input.verdictReason : snap.verdictReason,
      generatedAt: new Date().toISOString(),
    };
    await tx.reportVersion.create({ data: { reportId: r.id, version: v, snapshot: JSON.stringify(next), narrative: input.narrative ?? latest.narrative, reason: input.reason.trim(), createdById: actor.id } });
    const status = ["ISSUED", "REISSUED"].includes(r.status) ? "AMENDED" : r.status;
    await tx.report.update({ where: { id: r.id }, data: { currentVersion: v, status } });
    await audit(tx, actor, { entityType: "REPORT", entityId: r.id, rfqId: r.survey.jobOrder.rfqId, action: "REPORT_AMENDED", fromStatus: r.status, toStatus: status, note: `v${v}: ${input.reason.trim()}`, data: diff });
    return v;
  });
}

export async function setReportLetterhead(actor: ActorLite, reportId: string, letterheadId: string | null) {
  return db.$transaction(async (tx) => {
    const r = await loadReport(tx, actor, reportId);
    if (["ISSUED", "REISSUED"].includes(r.status)) throw new DomainError("Issued reports are locked — amend to change the letterhead");
    if (letterheadId) {
      const lh = await tx.letterhead.findFirst({ where: { id: letterheadId, orgId: actor.orgId } });
      if (!lh) throw new NotFound("Letterhead");
    }
    await tx.report.update({ where: { id: r.id }, data: { letterheadId } });
  });
}

/** Records the send and returns a public, expiring, signed link for the requester. */
export async function sendReport(actor: ActorLite, reportId: string, to: string, origin: string) {
  return db.$transaction(async (tx) => {
    const r = await loadReport(tx, actor, reportId);
    if (!["ISSUED", "REISSUED"].includes(r.status)) throw new DomainError("Issue the report before sending it — drafts can't be sent to the requester");
    if (!/^\S+@\S+\.\S+$/.test(to)) throw new DomainError("Enter a valid email", { to: "Invalid email" });
    const token = signToken(`${r.id}:${r.currentVersion}`, 30 * 86400);
    await tx.report.update({ where: { id: r.id }, data: { sentAt: new Date(), sentTo: to } });
    await audit(tx, actor, { entityType: "REPORT", entityId: r.id, rfqId: r.survey.jobOrder.rfqId, action: "REPORT_SENT", note: `To ${to} · v${r.currentVersion} · link valid 30 days` });
    // Requester portal users with this email get an in-app notification too.
    const requester = await tx.user.findUnique({ where: { email: to.toLowerCase() } });
    if (requester?.role === "REQUESTER") await notifyUsers(tx, [requester.id], { type: "REPORT_SENT", title: `Report issued: ${r.number}`, link: `/r` });
    return `${origin}/verify/${token}`;
  });
}
