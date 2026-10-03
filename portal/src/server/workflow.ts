import "server-only";
import { db, type Tx } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { nextId } from "@/lib/ids";
import { notifyUsers, notifyVendor } from "@/lib/notify";
import { ACTIVE_ASSIGNMENT_STATUSES } from "@/lib/constants";
import { flattenErrors, rfqSubmitSchema, type RfqSubmitInput } from "@/lib/schemas";
import { validateContainer } from "@/lib/iso6346";
import { validateSurvey } from "@/lib/templates/validate";
import type { Answers, TemplateSchema } from "@/lib/templates/types";
import { creditCost, postCredits } from "./credits";
import { DomainError, NotFound } from "./errors";
import { generateSurveyReports } from "./reports";

export type Actor = Pick<SessionUser, "id" | "orgId" | "name" | "role" | "surveyorId">;

// ═════════════════════════════════ RFQ ═════════════════════════════════

/** Customer → Submit RFQ → RFQ created (NEW) → unique ID → visible in RFQ list. Charges credits. */
export async function createRfq(actor: Actor, raw: unknown, draftId?: string) {
  const parsed = rfqSubmitSchema.safeParse(raw);
  if (!parsed.success) throw new DomainError("Please fix the highlighted fields", flattenErrors(parsed.error));
  const v: RfqSubmitInput = parsed.data;

  return db.$transaction(async (tx) => {
    const customer = await tx.customer.findFirst({ where: { id: v.customerId, orgId: actor.orgId, active: true } });
    if (!customer) throw new DomainError("Customer not found — add the customer first", { customerId: "Select a customer" });

    const typeIds = v.survey.lines.map((l) => l.surveyTypeId);
    const types = await tx.surveyType.findMany({ where: { id: { in: typeIds }, active: true } });
    if (types.length !== new Set(typeIds).size) throw new DomainError("One of the selected survey types is no longer available");

    const number = await nextId(tx, "RFQ");

    // Agent master: reuse by id (same tenant) or upsert by company name.
    let agentId: string | undefined;
    if (v.agent.agentId) {
      const a = await tx.agent.findFirst({ where: { id: v.agent.agentId, orgId: actor.orgId } });
      agentId = a?.id;
    }
    if (!agentId) {
      const existing = await tx.agent.findFirst({ where: { orgId: actor.orgId, companyName: v.agent.companyName } });
      agentId = existing
        ? existing.id
        : (await tx.agent.create({ data: { orgId: actor.orgId, companyName: v.agent.companyName, email: v.agent.email, phone: v.agent.phone, address: v.agent.address } })).id;
    }
    for (const c of v.agent.contacts) {
      const has = await tx.agentContact.findFirst({ where: { agentId, name: c.name } });
      if (!has) await tx.agentContact.create({ data: { agentId, name: c.name, phone: c.phone || null, email: c.email || null } });
    }

    const rfq = await tx.rfq.create({
      data: {
        number,
        orgId: actor.orgId,
        customerId: customer.id,
        status: "NEW",
        requestSource: v.intake.requestSource,
        requestReceivedAt: new Date(v.intake.requestReceivedAt),
        contactPerson: v.intake.contactPerson,
        contactDetails: v.intake.contactDetails,
        initialNotes: v.intake.initialNotes,
        cargoName: v.survey.cargoName,
        cargoQuantity: v.survey.cargoQuantity,
        surveyArea: v.details.surveyArea,
        areaName: v.details.areaName,
        locationName: v.details.locationName,
        lat: v.details.lat ?? null,
        lng: v.details.lng ?? null,
        surveyDate: new Date(`${v.details.surveyDate}T00:00:00+05:30`),
        currency: v.details.currency,
        estimatedRate: v.details.estimatedRate,
        paymentTerms: v.details.paymentTerms,
        actingOnBehalfOf: v.details.actingOnBehalfOf,
        piClub: v.details.piClub,
        jointInspection: v.details.jointInspection,
        agentId,
        agentCompanyName: v.agent.companyName,
        agentEmail: v.agent.email,
        agentPhone: v.agent.phone,
        agentAddress: v.agent.address,
        createdById: actor.id,
        lines: {
          create: v.survey.lines.map((l) => ({ surveyTypeId: l.surveyTypeId, quantity: l.quantity, scope: JSON.stringify(l.scope), scopeOther: l.scopeOther })),
        },
        jointInspectors: { create: v.details.jointInspection ? v.details.jointInspectors : [] },
        agentContacts: { create: v.agent.contacts.map((c) => ({ name: c.name, phone: c.phone || null, email: c.email || null })) },
      },
    });

    // Attach files uploaded during the draft (only this tenant's own unlinked uploads).
    const fileIds = v.files.attachments.map((a) => a.id);
    if (fileIds.length) {
      for (const a of v.files.attachments) {
        await tx.attachment.updateMany({ where: { id: a.id, orgId: actor.orgId, rfqId: null }, data: { rfqId: rfq.id, kind: a.kind } });
      }
    }

    const cost = await creditCost(tx, actor.orgId, typeIds);
    await postCredits(tx, actor.orgId, -cost, "RFQ_CREATED", { type: "RFQ", id: rfq.id, actor });
    await tx.rfq.update({ where: { id: rfq.id }, data: { creditsCharged: cost } });

    await audit(tx, actor, {
      entityType: "RFQ", entityId: rfq.id, rfqId: rfq.id, action: "RFQ_CREATED", toStatus: "NEW",
      note: `Request via ${v.intake.requestSource.toLowerCase()}${v.intake.contactPerson ? ` from ${v.intake.contactPerson}` : ""}. ${cost} credit${cost === 1 ? "" : "s"} charged.`,
    });
    if (draftId) await tx.rfqDraft.deleteMany({ where: { id: draftId, orgId: actor.orgId } });
    return rfq;
  });
}

async function getRfq(tx: Tx, actor: Actor, rfqId: string) {
  const rfq = await tx.rfq.findFirst({ where: { id: rfqId, orgId: actor.orgId }, include: { lines: { include: { surveyType: true } } } });
  if (!rfq) throw new NotFound("RFQ");
  return rfq;
}

async function templateFor(tx: Tx, surveyTypeId: string) {
  const t = await tx.surveyTemplate.findFirst({ where: { surveyTypeId, published: true }, orderBy: { version: "desc" } });
  if (!t) throw new DomainError("No published survey template for this survey type — publish one under Admin → Templates");
  return t;
}

/**
 * Accept a NEW RFQ: generates one job order per unit of quantity on each line,
 * each with an empty Survey bound to the current template version.
 * `containers` optionally maps lineId → container numbers (validated ISO 6346).
 */
export async function acceptRfq(actor: Actor, rfqId: string, containers: Record<string, string[]> = {}) {
  return db.$transaction(async (tx) => {
    const rfq = await getRfq(tx, actor, rfqId);
    if (rfq.status !== "NEW") throw new DomainError(`Only NEW RFQs can be accepted (this one is ${rfq.status.toLowerCase()})`);
    const errors: Record<string, string> = {};
    let created = 0;
    for (const line of rfq.lines) {
      const tpl = await templateFor(tx, line.surveyTypeId);
      const nums = containers[line.id] ?? [];
      for (let i = 0; i < line.quantity; i++) {
        let containerNumber: string | null = null;
        const raw = nums[i]?.trim();
        if (raw) {
          const c = validateContainer(raw);
          if (!c.ok) {
            errors[`${line.id}.${i}`] = `${raw}: ${c.error}`;
            continue;
          }
          containerNumber = c.value;
        }
        const job = await tx.jobOrder.create({
          data: {
            number: await nextId(tx, "JOB"),
            orgId: actor.orgId,
            rfqId: rfq.id,
            rfqLineId: line.id,
            surveyTypeId: line.surveyTypeId,
            containerNumber,
            location: rfq.locationName,
            surveyDate: rfq.surveyDate,
          },
        });
        await tx.survey.create({ data: { number: await nextId(tx, "SVY"), jobOrderId: job.id, templateId: tpl.id } });
        await audit(tx, actor, { entityType: "JOB_ORDER", entityId: job.id, rfqId: rfq.id, action: "JOB_CREATED", toStatus: "NEW", note: `${job.number} · ${line.surveyType.name}` });
        created++;
      }
    }
    if (Object.keys(errors).length) throw new DomainError("Some container numbers are invalid", errors);
    await tx.rfq.update({ where: { id: rfq.id }, data: { status: "ACCEPTED" } });
    await audit(tx, actor, { entityType: "RFQ", entityId: rfq.id, rfqId: rfq.id, action: "RFQ_ACCEPTED", fromStatus: "NEW", toStatus: "ACCEPTED", note: `${created} job order${created === 1 ? "" : "s"} created` });
    return created;
  });
}

/** Vendor declines (business says no) or cancels. Credits are refunded when no survey work has started. */
export async function closeRfq(actor: Actor, rfqId: string, kind: "DECLINED" | "CANCELLED", reason: string) {
  if (!reason.trim()) throw new DomainError("Please give a reason", { reason: "Reason is required" });
  return db.$transaction(async (tx) => {
    const rfq = await getRfq(tx, actor, rfqId);
    if (["COMPLETED", "DECLINED", "CANCELLED"].includes(rfq.status)) throw new DomainError(`RFQ is already ${rfq.status.toLowerCase()}`);
    if (kind === "DECLINED" && rfq.status !== "NEW") throw new DomainError("Only NEW RFQs can be declined; cancel it instead");
    const jobs = await tx.jobOrder.findMany({ where: { rfqId }, include: { assignments: true } });
    if (jobs.some((j) => ["IN_PROGRESS", "SUBMITTED", "COMPLETED"].includes(j.status)))
      throw new DomainError("Survey work has already started on this RFQ — cancel the individual job orders that are not needed instead");
    for (const j of jobs) {
      await tx.assignment.updateMany({ where: { jobOrderId: j.id, status: { in: ACTIVE_ASSIGNMENT_STATUSES } }, data: { status: "CANCELLED", cancelledAt: new Date() } });
      const surveyorUsers = await tx.surveyor.findMany({ where: { id: { in: j.assignments.filter((a) => ACTIVE_ASSIGNMENT_STATUSES.includes(a.status as never)).map((a) => a.surveyorId) } }, select: { userId: true } });
      await notifyUsers(tx, surveyorUsers.map((s) => s.userId), { type: "ASSIGNMENT_CANCELLED", title: `Assignment cancelled: ${j.number}`, body: reason, link: "/s" });
      await tx.jobOrder.update({ where: { id: j.id }, data: { status: "CANCELLED" } });
    }
    await tx.rfq.update({ where: { id: rfqId }, data: { status: kind, declineReason: reason } });
    if (rfq.creditsCharged > 0) {
      await postCredits(tx, actor.orgId, rfq.creditsCharged, "RFQ_REFUND", { type: "RFQ", id: rfqId, actor });
      await audit(tx, actor, { entityType: "RFQ", entityId: rfqId, rfqId, action: "CREDITS_REFUNDED", note: `${rfq.creditsCharged} credit(s) returned` });
      await tx.rfq.update({ where: { id: rfqId }, data: { creditsCharged: 0 } });
    }
    await audit(tx, actor, { entityType: "RFQ", entityId: rfqId, rfqId, action: kind === "DECLINED" ? "RFQ_DECLINED" : "RFQ_CANCELLED", fromStatus: rfq.status, toStatus: kind, note: reason });
  });
}

/** RFQ status is derived from its job orders once accepted. */
export async function recomputeRfqStatus(tx: Tx, rfqId: string, actor: Pick<SessionUser, "id" | "orgId" | "name"> | null) {
  const rfq = await tx.rfq.findUniqueOrThrow({ where: { id: rfqId } });
  if (["NEW", "DECLINED", "CANCELLED"].includes(rfq.status)) return;
  const jobs = await tx.jobOrder.findMany({ where: { rfqId, status: { not: "CANCELLED" } }, select: { status: true } });
  let next = "ACCEPTED";
  if (jobs.length && jobs.every((j) => j.status === "COMPLETED")) next = "COMPLETED";
  else if (jobs.some((j) => ["IN_PROGRESS", "SUBMITTED", "COMPLETED"].includes(j.status))) next = "IN_PROGRESS";
  else if (jobs.length && jobs.every((j) => j.status === "ASSIGNED")) next = "ASSIGNED";
  else if (jobs.some((j) => j.status === "ASSIGNED")) next = "ASSIGNED";
  if (next !== rfq.status) {
    await tx.rfq.update({ where: { id: rfqId }, data: { status: next } });
    await audit(tx, actor, { entityType: "RFQ", entityId: rfqId, rfqId, action: "RFQ_STATUS", fromStatus: rfq.status, toStatus: next });
  }
}

// ═════════════════════════════════ Job orders ═════════════════════════════════

export async function updateJob(actor: Actor, jobId: string, data: { containerNumber?: string; surveyDate?: string; location?: string }) {
  return db.$transaction(async (tx) => {
    const job = await tx.jobOrder.findFirst({ where: { id: jobId, orgId: actor.orgId }, include: { assignments: { include: { surveyor: true } } } });
    if (!job) throw new NotFound("Job order");
    if (["COMPLETED", "CANCELLED"].includes(job.status)) throw new DomainError("Completed or cancelled jobs cannot be edited");
    const patch: { containerNumber?: string | null; surveyDate?: Date; location?: string } = {};
    if (data.containerNumber !== undefined) {
      if (data.containerNumber.trim() === "") patch.containerNumber = null;
      else {
        const c = validateContainer(data.containerNumber);
        if (!c.ok) throw new DomainError(c.error, { containerNumber: c.error });
        patch.containerNumber = c.value;
      }
    }
    if (data.surveyDate) patch.surveyDate = new Date(`${data.surveyDate}T00:00:00+05:30`);
    if (data.location?.trim()) patch.location = data.location.trim();
    await tx.jobOrder.update({ where: { id: jobId }, data: patch });
    await audit(tx, actor, { entityType: "JOB_ORDER", entityId: jobId, rfqId: job.rfqId, action: "JOB_UPDATED", data: { before: { containerNumber: job.containerNumber, surveyDate: job.surveyDate, location: job.location }, after: patch } });
    const active = job.assignments.filter((a) => ACTIVE_ASSIGNMENT_STATUSES.includes(a.status as never));
    if (active.length && (patch.surveyDate || patch.location)) {
      await notifyUsers(tx, active.map((a) => a.surveyor.userId), { type: "ASSIGNMENT_UPDATED", title: `Assignment updated: ${job.number}`, body: patch.surveyDate ? "The survey date has changed." : "The survey location has changed.", link: `/s/assignments/${active[0].id}` });
    }
  });
}

export async function cancelJob(actor: Actor, jobId: string, reason: string) {
  if (!reason.trim()) throw new DomainError("Please give a reason", { reason: "Reason is required" });
  return db.$transaction(async (tx) => {
    const job = await tx.jobOrder.findFirst({ where: { id: jobId, orgId: actor.orgId }, include: { assignments: { include: { surveyor: true } } } });
    if (!job) throw new NotFound("Job order");
    if (["COMPLETED", "CANCELLED"].includes(job.status)) throw new DomainError(`Job is already ${job.status.toLowerCase()}`);
    const active = job.assignments.filter((a) => ACTIVE_ASSIGNMENT_STATUSES.includes(a.status as never));
    await tx.assignment.updateMany({ where: { id: { in: active.map((a) => a.id) } }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    await notifyUsers(tx, active.map((a) => a.surveyor.userId), { type: "ASSIGNMENT_CANCELLED", title: `Assignment cancelled: ${job.number}`, body: reason, link: "/s" });
    await tx.jobOrder.update({ where: { id: jobId }, data: { status: "CANCELLED" } });
    await audit(tx, actor, { entityType: "JOB_ORDER", entityId: jobId, rfqId: job.rfqId, action: "JOB_CANCELLED", fromStatus: job.status, toStatus: "CANCELLED", note: reason });
    await recomputeRfqStatus(tx, job.rfqId, actor);
  });
}

/** Bulk Survey grid: container numbers + FIT/UNFIT for many jobs in one save. */
export async function saveBulkVerdicts(actor: Actor, rfqId: string, rows: { jobId: string; containerNumber: string; verdict: "" | "FIT" | "UNFIT" }[]) {
  const errors: Record<string, string> = {};
  const clean = rows.map((r) => {
    if (!r.containerNumber.trim()) return { ...r, containerNumber: null as string | null };
    const c = validateContainer(r.containerNumber);
    if (!c.ok) errors[r.jobId] = c.error;
    return { ...r, containerNumber: c.ok ? c.value : null };
  });
  if (Object.keys(errors).length) throw new DomainError("Fix the invalid container numbers", errors);
  return db.$transaction(async (tx) => {
    const jobs = await tx.jobOrder.findMany({ where: { rfqId, orgId: actor.orgId } });
    const byId = new Map(jobs.map((j) => [j.id, j]));
    let changed = 0;
    for (const r of clean) {
      const j = byId.get(r.jobId);
      if (!j || j.status === "CANCELLED") continue;
      const verdict = r.verdict || null;
      if (j.containerNumber === r.containerNumber && j.bulkVerdict === verdict) continue;
      await tx.jobOrder.update({ where: { id: j.id }, data: { containerNumber: r.containerNumber, bulkVerdict: verdict } });
      changed++;
    }
    if (changed) await audit(tx, actor, { entityType: "RFQ", entityId: rfqId, rfqId, action: "BULK_VERDICT", note: `${changed} job order${changed === 1 ? "" : "s"} updated` });
    return changed;
  });
}

// ═════════════════════════════════ Assignments ═════════════════════════════════

/**
 * Allocate one or more surveyors (in-house and/or independent, joint inspection = several)
 * to one or more jobs. Creates NEW assignments, keeps rejected history, notifies surveyors.
 */
export async function assignSurveyors(actor: Actor, jobIds: string[], surveyorIds: string[], opts: { fee?: number; instructions?: string } = {}) {
  if (!jobIds.length) throw new DomainError("Select at least one job order");
  if (!surveyorIds.length) throw new DomainError("Select at least one surveyor");
  return db.$transaction(async (tx) => {
    const surveyors = await tx.surveyor.findMany({
      where: { id: { in: surveyorIds }, active: true, OR: [{ orgId: actor.orgId }, { orgId: null, kind: "INDEPENDENT" }] },
    });
    if (surveyors.length !== surveyorIds.length) throw new DomainError("One or more selected surveyors are not available");
    // Preserve the order the vendor picked; first is lead.
    const ordered = surveyorIds.map((id) => surveyors.find((s) => s.id === id)!);
    const jobs = await tx.jobOrder.findMany({ where: { id: { in: jobIds }, orgId: actor.orgId }, include: { assignments: true, rfq: true } });
    if (jobs.length !== jobIds.length) throw new NotFound("Job order");
    const created: string[] = [];
    for (const job of jobs) {
      if (["COMPLETED", "CANCELLED", "SUBMITTED"].includes(job.status)) throw new DomainError(`${job.number} is ${job.status.toLowerCase()} and cannot be allocated`);
      if (["NEW", "DECLINED", "CANCELLED"].includes(job.rfq.status)) throw new DomainError(`Accept ${job.rfq.number} before allocating surveyors`);
      const active = job.assignments.filter((a) => ACTIVE_ASSIGNMENT_STATUSES.includes(a.status as never));
      const lastRejected = job.assignments.filter((a) => a.status === "REJECTED").sort((a, b) => +b.assignedAt - +a.assignedAt)[0];
      for (const [i, s] of ordered.entries()) {
        if (active.some((a) => a.surveyorId === s.id)) throw new DomainError(`${s.name} is already assigned to ${job.number}`);
        const asn = await tx.assignment.create({
          data: {
            number: await nextId(tx, "ASN"),
            jobOrderId: job.id,
            surveyorId: s.id,
            isLead: active.length === 0 && i === 0,
            fee: opts.fee,
            instructions: opts.instructions,
            assignedById: actor.id,
            previousId: lastRejected && i === 0 ? lastRejected.id : null,
          },
        });
        created.push(asn.id);
        await audit(tx, actor, {
          entityType: "ASSIGNMENT", entityId: asn.id, rfqId: job.rfqId, action: "ASSIGNMENT_CREATED", toStatus: "NEW",
          note: `${job.number} → ${s.name} (${s.kind === "IN_HOUSE" ? "in-house" : "independent"})${lastRejected && i === 0 ? " · reassignment" : ""}`,
        });
        await notifyUsers(tx, [s.userId], {
          type: "ASSIGNMENT_NEW",
          title: `New survey assignment: ${job.number}`,
          body: `${job.location} · ${new Date(job.surveyDate).toDateString()}`,
          link: `/s/assignments/${asn.id}`,
        });
      }
      if (job.status === "NEW") {
        await tx.jobOrder.update({ where: { id: job.id }, data: { status: "ASSIGNED" } });
        await audit(tx, actor, { entityType: "JOB_ORDER", entityId: job.id, rfqId: job.rfqId, action: "JOB_STATUS", fromStatus: "NEW", toStatus: "ASSIGNED" });
      }
    }
    for (const rfqId of new Set(jobs.map((j) => j.rfqId))) await recomputeRfqStatus(tx, rfqId, actor);
    return created;
  });
}

export async function cancelAssignment(actor: Actor, assignmentId: string, reason: string) {
  return db.$transaction(async (tx) => {
    const a = await tx.assignment.findFirst({ where: { id: assignmentId, jobOrder: { orgId: actor.orgId } }, include: { jobOrder: true, surveyor: true } });
    if (!a) throw new NotFound("Assignment");
    if (!["NEW", "ACCEPTED"].includes(a.status)) throw new DomainError("Only assignments that haven't started can be withdrawn");
    await tx.assignment.update({ where: { id: a.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    await audit(tx, actor, { entityType: "ASSIGNMENT", entityId: a.id, rfqId: a.jobOrder.rfqId, action: "ASSIGNMENT_CANCELLED", fromStatus: a.status, toStatus: "CANCELLED", note: reason || undefined });
    await notifyUsers(tx, [a.surveyor.userId], { type: "ASSIGNMENT_CANCELLED", title: `Assignment withdrawn: ${a.jobOrder.number}`, body: reason, link: "/s" });
    const stillActive = await tx.assignment.count({ where: { jobOrderId: a.jobOrderId, status: { in: ACTIVE_ASSIGNMENT_STATUSES } } });
    if (!stillActive && a.jobOrder.status === "ASSIGNED") {
      await tx.jobOrder.update({ where: { id: a.jobOrderId }, data: { status: "NEW" } });
      await audit(tx, actor, { entityType: "JOB_ORDER", entityId: a.jobOrderId, rfqId: a.jobOrder.rfqId, action: "JOB_STATUS", fromStatus: "ASSIGNED", toStatus: "NEW" });
    }
    await recomputeRfqStatus(tx, a.jobOrder.rfqId, actor);
  });
}

async function surveyorAssignment(tx: Tx, actor: Actor, assignmentId: string) {
  if (!actor.surveyorId) throw new DomainError("Your account is not linked to a surveyor profile");
  const a = await tx.assignment.findFirst({
    where: { id: assignmentId, surveyorId: actor.surveyorId },
    include: { jobOrder: { include: { rfq: true, survey: true } }, surveyor: true },
  });
  if (!a) throw new NotFound("Assignment");
  return a;
}

/** Surveyor: NEW → ACCEPTED, or NEW → REJECTED (reason). Rejection never rejects the RFQ. */
export async function respondToAssignment(actor: Actor, assignmentId: string, accept: boolean, reason?: string) {
  if (!accept && !reason?.trim()) throw new DomainError("Please tell the vendor why you're declining", { reason: "Reason is required" });
  return db.$transaction(async (tx) => {
    const a = await surveyorAssignment(tx, actor, assignmentId);
    if (a.status !== "NEW") throw new DomainError(`This assignment is already ${a.status.toLowerCase()}`);
    const job = a.jobOrder;
    if (accept) {
      await tx.assignment.update({ where: { id: a.id }, data: { status: "ACCEPTED", respondedAt: new Date() } });
      await audit(tx, actor, { entityType: "ASSIGNMENT", entityId: a.id, rfqId: job.rfqId, action: "ASSIGNMENT_ACCEPTED", fromStatus: "NEW", toStatus: "ACCEPTED", note: `${a.surveyor.name} · ${job.number}` });
      await notifyVendor(tx, job.orgId, { type: "ASSIGNMENT_ACCEPTED", title: `${a.surveyor.name} accepted ${job.number}`, link: `/jobs/${job.id}` });
    } else {
      await tx.assignment.update({ where: { id: a.id }, data: { status: "REJECTED", respondedAt: new Date(), rejectionReason: reason!.trim() } });
      await audit(tx, actor, { entityType: "ASSIGNMENT", entityId: a.id, rfqId: job.rfqId, action: "ASSIGNMENT_REJECTED", fromStatus: "NEW", toStatus: "REJECTED", note: `${a.surveyor.name}: “${reason!.trim()}”` });
      const stillActive = await tx.assignment.count({ where: { jobOrderId: job.id, status: { in: ACTIVE_ASSIGNMENT_STATUSES } } });
      if (!stillActive && job.status === "ASSIGNED") {
        await tx.jobOrder.update({ where: { id: job.id }, data: { status: "NEW" } });
        await audit(tx, actor, { entityType: "JOB_ORDER", entityId: job.id, rfqId: job.rfqId, action: "JOB_STATUS", fromStatus: "ASSIGNED", toStatus: "NEW", note: "Awaiting reassignment" });
      }
      await notifyVendor(tx, job.orgId, {
        type: "ASSIGNMENT_REJECTED",
        title: `${a.surveyor.name} rejected ${job.number} — reassign`,
        body: reason,
        link: `/jobs/${job.id}?allocate=1`,
      });
      await recomputeRfqStatus(tx, job.rfqId, actor);
    }
  });
}

/** Surveyor: ACCEPTED → IN_PROGRESS. Survey + job move to IN_PROGRESS. */
export async function startSurvey(actor: Actor, assignmentId: string) {
  return db.$transaction(async (tx) => {
    const a = await surveyorAssignment(tx, actor, assignmentId);
    if (a.status === "IN_PROGRESS") return a.jobOrder.survey!.id;
    if (a.status !== "ACCEPTED") throw new DomainError("Accept the assignment before starting the survey");
    const job = a.jobOrder;
    const survey = job.survey;
    if (!survey) throw new DomainError("Survey record missing for this job");
    const now = new Date();
    await tx.assignment.update({ where: { id: a.id }, data: { status: "IN_PROGRESS", startedAt: now } });
    if (survey.status === "NOT_STARTED") {
      await tx.survey.update({ where: { id: survey.id }, data: { status: "IN_PROGRESS", startedAt: now, surveyorId: a.surveyorId } });
    }
    if (["NEW", "ASSIGNED"].includes(job.status)) {
      await tx.jobOrder.update({ where: { id: job.id }, data: { status: "IN_PROGRESS" } });
      await audit(tx, actor, { entityType: "JOB_ORDER", entityId: job.id, rfqId: job.rfqId, action: "JOB_STATUS", fromStatus: job.status, toStatus: "IN_PROGRESS" });
    }
    await audit(tx, actor, { entityType: "SURVEY", entityId: survey.id, rfqId: job.rfqId, action: "SURVEY_STARTED", fromStatus: survey.status, toStatus: "IN_PROGRESS", note: `${a.surveyor.name} · ${job.number}` });
    await notifyVendor(tx, job.orgId, { type: "SURVEY_STARTED", title: `Survey started: ${job.number}`, body: a.surveyor.name, link: `/jobs/${job.id}` });
    await recomputeRfqStatus(tx, job.rfqId, actor);
    return survey.id;
  });
}

/** Load a survey the actor may edit (lead surveyor with an in-progress assignment). */
async function editableSurvey(tx: Tx, actor: Actor, surveyId: string) {
  if (!actor.surveyorId) throw new DomainError("Only the assigned surveyor can edit this survey");
  const s = await tx.survey.findFirst({
    where: { id: surveyId, jobOrder: { assignments: { some: { surveyorId: actor.surveyorId, status: "IN_PROGRESS" } } } },
    include: { template: true, photos: true, jobOrder: { include: { assignments: true } } },
  });
  if (!s) throw new NotFound("Survey");
  if (s.status !== "IN_PROGRESS") throw new DomainError(`Survey is ${s.status.toLowerCase().replace("_", " ")} and can no longer be edited`);
  return s;
}

/**
 * Autosave / offline sync. `baseRevision` is the revision the client last saw;
 * if the server moved on, field-level merge: client wins only for keys it changed.
 */
export async function saveSurveyProgress(
  actor: Actor,
  surveyId: string,
  input: { answers: Answers; changedKeys?: string[]; baseRevision: number; verdict?: string | null; verdictReason?: string | null; completionNotes?: string | null },
) {
  return db.$transaction(async (tx) => {
    const s = await editableSurvey(tx, actor, surveyId);
    const current = JSON.parse(s.answers) as Answers;
    let merged: Answers;
    let conflict = false;
    if (input.baseRevision === s.revision) merged = { ...current, ...input.answers };
    else {
      conflict = true;
      const keys = input.changedKeys ?? Object.keys(input.answers);
      merged = { ...current };
      for (const k of keys) merged[k] = input.answers[k];
    }
    const updated = await tx.survey.update({
      where: { id: s.id },
      data: {
        answers: JSON.stringify(merged),
        revision: { increment: 1 },
        ...(input.verdict !== undefined ? { verdict: input.verdict || null } : {}),
        ...(input.verdictReason !== undefined ? { verdictReason: input.verdictReason || null } : {}),
        ...(input.completionNotes !== undefined ? { completionNotes: input.completionNotes || null } : {}),
      },
    });
    return { revision: updated.revision, answers: merged, conflict };
  });
}

/** Surveyor: final submission. Validates every required field, photo and signature. */
export async function submitSurvey(actor: Actor, surveyId: string) {
  return db.$transaction(async (tx) => {
    const s = await editableSurvey(tx, actor, surveyId);
    const schema = JSON.parse(s.template.schema) as TemplateSchema;
    const answers = JSON.parse(s.answers) as Answers;
    const slots = new Set(s.photos.filter((p) => !p.slot.startsWith("sig:")).map((p) => p.slot));
    const sigs = new Set(s.photos.filter((p) => p.slot.startsWith("sig:")).map((p) => p.slot.slice(4)));
    const errors = validateSurvey(schema, answers, { final: true, photoSlots: slots, signatures: sigs, verdict: s.verdict, verdictReason: s.verdictReason });
    if (Object.keys(errors).length) throw new DomainError(`${Object.keys(errors).length} item(s) need attention before you can submit`, errors);
    const now = new Date();
    const job = s.jobOrder;
    await tx.survey.update({ where: { id: s.id }, data: { status: "SUBMITTED", submittedAt: now, surveyorId: actor.surveyorId } });
    await tx.assignment.updateMany({ where: { jobOrderId: job.id, status: "IN_PROGRESS" }, data: { status: "COMPLETED", completedAt: now } });
    // Supporting surveyors who never started are released.
    await tx.assignment.updateMany({ where: { jobOrderId: job.id, status: { in: ["NEW", "ACCEPTED"] } }, data: { status: "CANCELLED", cancelledAt: now } });
    const containerNo = typeof answers.containerNo === "string" ? validateContainer(answers.containerNo) : null;
    await tx.jobOrder.update({
      where: { id: job.id },
      data: { status: "SUBMITTED", ...(containerNo?.ok && !job.containerNumber ? { containerNumber: containerNo.value } : {}), ...(s.verdict ? { bulkVerdict: s.verdict } : {}) },
    });
    await audit(tx, actor, { entityType: "SURVEY", entityId: s.id, rfqId: job.rfqId, action: "SURVEY_SUBMITTED", fromStatus: "IN_PROGRESS", toStatus: "SUBMITTED", note: `${job.number}${s.verdict ? ` · ${s.verdict}` : ""}` });
    await audit(tx, actor, { entityType: "JOB_ORDER", entityId: job.id, rfqId: job.rfqId, action: "JOB_STATUS", fromStatus: job.status, toStatus: "SUBMITTED" });
    await generateSurveyReports(tx, actor, s.id, ["CERTIFICATE", "COMPLETION", "FORMAL"]);
    await notifyVendor(tx, job.orgId, { type: "SURVEY_SUBMITTED", title: `Survey submitted: ${job.number}`, body: "Review the data and the generated reports.", link: `/jobs/${job.id}` });
    await recomputeRfqStatus(tx, job.rfqId, actor);
  });
}

/** Vendor review of submitted data: approve (job COMPLETED) or return to the surveyor with notes. */
export async function reviewSurvey(actor: Actor, surveyId: string, approve: boolean, note?: string) {
  return db.$transaction(async (tx) => {
    const s = await tx.survey.findFirst({ where: { id: surveyId, jobOrder: { orgId: actor.orgId } }, include: { jobOrder: { include: { assignments: { include: { surveyor: true } } } } } });
    if (!s) throw new NotFound("Survey");
    if (s.status !== "SUBMITTED") throw new DomainError("Only submitted surveys can be reviewed");
    const job = s.jobOrder;
    if (approve) {
      await tx.survey.update({ where: { id: s.id }, data: { status: "COMPLETED", completedAt: new Date() } });
      await tx.jobOrder.update({ where: { id: job.id }, data: { status: "COMPLETED" } });
      await audit(tx, actor, { entityType: "SURVEY", entityId: s.id, rfqId: job.rfqId, action: "SURVEY_APPROVED", fromStatus: "SUBMITTED", toStatus: "COMPLETED", note: note || undefined });
      await audit(tx, actor, { entityType: "JOB_ORDER", entityId: job.id, rfqId: job.rfqId, action: "JOB_STATUS", fromStatus: "SUBMITTED", toStatus: "COMPLETED" });
    } else {
      if (!note?.trim()) throw new DomainError("Tell the surveyor what to fix", { note: "Required" });
      const lead = job.assignments.filter((a) => a.status === "COMPLETED").sort((a, b) => +(b.completedAt ?? 0) - +(a.completedAt ?? 0))[0];
      if (!lead) throw new DomainError("No completed assignment to return the survey to");
      await tx.survey.update({ where: { id: s.id }, data: { status: "IN_PROGRESS", submittedAt: null } });
      await tx.assignment.update({ where: { id: lead.id }, data: { status: "IN_PROGRESS", completedAt: null } });
      await tx.jobOrder.update({ where: { id: job.id }, data: { status: "IN_PROGRESS" } });
      await audit(tx, actor, { entityType: "SURVEY", entityId: s.id, rfqId: job.rfqId, action: "SURVEY_RETURNED", fromStatus: "SUBMITTED", toStatus: "IN_PROGRESS", note });
      await notifyUsers(tx, [lead.surveyor.userId], { type: "SURVEY_RETURNED", title: `Survey returned: ${job.number}`, body: note, link: `/s/surveys/${s.id}` });
    }
    await recomputeRfqStatus(tx, job.rfqId, actor);
  });
}
