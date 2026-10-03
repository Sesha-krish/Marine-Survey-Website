"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { saveUpload, UploadError } from "@/lib/storage";
import { ATTACHMENT_KINDS } from "@/lib/constants";
import { run, VENDOR } from "@/server/action";
import { DomainError, NotFound } from "@/server/errors";
import { acceptRfq, closeRfq, createRfq, saveBulkVerdicts } from "@/server/workflow";
import { creditCost } from "@/server/credits";
import { purchasePackage } from "@/server/billing";
import { notifyVendor } from "@/lib/notify";

export async function acceptRfqAction(rfqId: string, containers: Record<string, string[]>) {
  return run(VENDOR, async (u) => {
    const n = await acceptRfq(u, rfqId, containers);
    revalidatePath(`/rfqs/${rfqId}`);
    return n;
  });
}

export async function closeRfqAction(rfqId: string, kind: "DECLINED" | "CANCELLED", reason: string) {
  return run(VENDOR, async (u) => {
    await closeRfq(u, rfqId, kind, reason);
    revalidatePath(`/rfqs/${rfqId}`);
  });
}

/** Bulk accept / decline / cancel from the RFQ list. Each RFQ is its own transaction; failures are reported per RFQ. */
export async function bulkRfqAction(ids: string[], op: "ACCEPT" | "DECLINED" | "CANCELLED", reason = "") {
  return run(VENDOR, async (u) => {
    const done: string[] = [];
    const failed: string[] = [];
    for (const id of ids.slice(0, 100)) {
      try {
        if (op === "ACCEPT") await acceptRfq(u, id);
        else await closeRfq(u, id, op, reason);
        done.push(id);
      } catch (e) {
        const r = await db.rfq.findFirst({ where: { id, orgId: u.orgId }, select: { number: true } });
        failed.push(`${r?.number ?? id}: ${e instanceof Error ? e.message : "failed"}`);
      }
    }
    revalidatePath("/rfqs");
    return { done: done.length, failed };
  });
}

export async function saveBulkSurveyAction(rfqId: string, rows: { jobId: string; containerNumber: string; verdict: "" | "FIT" | "UNFIT" }[]) {
  return run(VENDOR, async (u) => {
    const n = await saveBulkVerdicts(u, rfqId, rows);
    revalidatePath(`/rfqs/${rfqId}`);
    return n;
  });
}

// ───────────── Wizard: server-side drafts (resumable from any device) ─────────────

export async function saveDraftAction(draftId: string | null, step: number, data: unknown) {
  return run(VENDOR, async (u) => {
    const json = JSON.stringify(data);
    if (json.length > 200_000) throw new DomainError("Draft is too large");
    if (draftId) {
      const d = await db.rfqDraft.findFirst({ where: { id: draftId, orgId: u.orgId, userId: u.id } });
      if (d) {
        await db.rfqDraft.update({ where: { id: d.id }, data: { step, data: json } });
        return { id: d.id, savedAt: new Date().toISOString() };
      }
    }
    const d = await db.rfqDraft.create({ data: { orgId: u.orgId, userId: u.id, step, data: json } });
    return { id: d.id, savedAt: new Date().toISOString() };
  });
}

export async function deleteDraftAction(draftId: string) {
  return run(VENDOR, async (u) => {
    await db.rfqDraft.deleteMany({ where: { id: draftId, orgId: u.orgId, userId: u.id } });
    revalidatePath("/rfqs/new");
  });
}

export async function uploadRfqFileAction(form: FormData) {
  return run(VENDOR, async (u) => {
    const file = form.get("file");
    const kind = String(form.get("kind") ?? "OTHER");
    if (!(file instanceof File) || !file.size) throw new DomainError("Choose a file");
    if (!(ATTACHMENT_KINDS as readonly string[]).includes(kind)) throw new DomainError("Unknown document type");
    const rfqId = form.get("rfqId") ? String(form.get("rfqId")) : undefined;
    if (rfqId && !(await db.rfq.findFirst({ where: { id: rfqId, orgId: u.orgId } }))) throw new NotFound("RFQ");
    try {
      const a = await saveUpload({ file, kind: "document", attachmentKind: kind, orgId: u.orgId, userId: u.id, rfqId });
      if (rfqId) {
        await db.$transaction((tx) => audit(tx, u, { entityType: "RFQ", entityId: rfqId, rfqId, action: "RFQ_ATTACHMENT_ADDED", note: `${a.fileName} (${kind.toLowerCase().replace(/_/g, " ")})` }));
        revalidatePath(`/rfqs/${rfqId}`);
      }
      return { id: a.id, fileName: a.fileName, size: a.size, kind: a.kind };
    } catch (e) {
      if (e instanceof UploadError) throw new DomainError(e.message);
      throw e;
    }
  });
}

export async function creditPreviewAction(surveyTypeIds: string[]) {
  return run(VENDOR, async (u) => {
    const [cost, org] = await Promise.all([creditCost(db, u.orgId, surveyTypeIds), db.organization.findUniqueOrThrow({ where: { id: u.orgId }, select: { creditBalance: true } })]);
    return { cost, balance: org.creditBalance };
  });
}

export async function searchAgentsAction(q: string) {
  return run(VENDOR, async (u) =>
    db.agent.findMany({
      where: { orgId: u.orgId, ...(q.trim() ? { companyName: { contains: q.trim() } } : {}) },
      include: { contacts: true },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  );
}

export async function submitRfqAction(draftId: string | null, payload: unknown) {
  return run(VENDOR, async (u) => {
    const p = payload as { details?: { surveyDate?: string } };
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
    if (p?.details?.surveyDate && p.details.surveyDate < today) throw new DomainError("Date of survey can't be in the past", { "details.surveyDate": "Choose today or a later date" });
    const rfq = await createRfq(u, payload, draftId ?? undefined);
    // Low balance: auto-renew if configured, otherwise warn the vendor team once per crossing.
    const org = await db.organization.findUniqueOrThrow({ where: { id: u.orgId } });
    if (org.creditBalance <= org.lowCreditAlert) {
      if (org.autoRenew && org.autoRenewPkgId) await purchasePackage(u, org.autoRenewPkgId).catch((e) => console.error("[auto-renew]", e));
      else if (org.creditBalance + rfq.creditsCharged > org.lowCreditAlert)
        await db.$transaction((tx) => notifyVendor(tx, u.orgId, { type: "LOW_CREDITS", title: `Low credit balance: ${org.creditBalance} left`, body: "Buy a package to keep submitting RFQs.", link: "/billing" }));
    }
    revalidatePath("/rfqs");
    revalidatePath("/dashboard");
    return { id: rfq.id, number: rfq.number };
  });
}
