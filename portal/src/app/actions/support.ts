"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { nextId } from "@/lib/ids";
import { notifyUsers, notifyVendor } from "@/lib/notify";
import { PRIORITY_SLA_HOURS, TICKET_STATUSES, type Priority } from "@/lib/constants";
import { flattenErrors, ticketSchema } from "@/lib/schemas";
import { saveUpload, UploadError } from "@/lib/storage";
import { run, VENDOR } from "@/server/action";
import { DomainError, NotFound } from "@/server/errors";

async function attach(form: FormData, orgId: string, userId: string) {
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return null;
  try {
    return (await saveUpload({ file, kind: "document", attachmentKind: "TICKET", orgId, userId })).id;
  } catch (e) {
    if (e instanceof UploadError) throw new DomainError(e.message, { file: e.message });
    throw e;
  }
}

export async function createTicketAction(form: FormData) {
  return run(VENDOR, async (u) => {
    const p = ticketSchema.safeParse({ topic: form.get("topic"), priority: form.get("priority"), supportType: form.get("supportType"), description: form.get("description") });
    if (!p.success) throw new DomainError("Please fix the highlighted fields", flattenErrors(p.error));
    const attachmentId = await attach(form, u.orgId, u.id);
    const t = await db.$transaction(async (tx) => {
      const t = await tx.supportTicket.create({
        data: { number: await nextId(tx, "TKT"), orgId: u.orgId, ...p.data, createdById: u.id, slaDueAt: new Date(Date.now() + PRIORITY_SLA_HOURS[p.data.priority as Priority] * 3600_000) },
      });
      await tx.ticketMessage.create({ data: { ticketId: t.id, authorId: u.id, body: p.data.description, attachmentId } });
      await audit(tx, u, { entityType: "TICKET", entityId: t.id, action: "TICKET_CREATED", note: `${t.number}: ${t.topic}` });
      const admins = await tx.user.findMany({ where: { role: "PLATFORM_ADMIN", active: true }, select: { id: true } });
      await notifyUsers(tx, admins.map((a) => a.id), { type: "TICKET", title: `New ${p.data.priority.toLowerCase()} ticket ${t.number}`, body: t.topic, link: `/support/${t.id}` });
      return t;
    });
    revalidatePath("/support");
    return { id: t.id, number: t.number };
  });
}

async function loadTicket(id: string, u: { orgId: string; role: string }) {
  const t = await db.supportTicket.findFirst({ where: { id, ...(u.role === "PLATFORM_ADMIN" ? {} : { orgId: u.orgId }) } });
  if (!t) throw new NotFound("Ticket");
  return t;
}

export async function replyTicketAction(id: string, form: FormData) {
  return run([...VENDOR, "PLATFORM_ADMIN"], async (u) => {
    const t = await loadTicket(id, u);
    const body = String(form.get("body") ?? "").trim();
    if (!body) throw new DomainError("Write a message", { body: "Required" });
    const attachmentId = await attach(form, t.orgId, u.id);
    await db.$transaction(async (tx) => {
      await tx.ticketMessage.create({ data: { ticketId: id, authorId: u.id, body: body.slice(0, 5000), attachmentId } });
      const staff = u.role === "PLATFORM_ADMIN";
      const status = staff ? (t.status === "OPEN" ? "IN_PROGRESS" : t.status) : t.status === "WAITING_ON_CUSTOMER" || t.status === "RESOLVED" ? "OPEN" : t.status;
      await tx.supportTicket.update({ where: { id }, data: { status } });
      await audit(tx, u, { entityType: "TICKET", entityId: id, action: "TICKET_REPLY", fromStatus: t.status !== status ? t.status : null, toStatus: t.status !== status ? status : null });
      if (staff) await notifyVendor(tx, t.orgId, { type: "TICKET", title: `Support replied on ${t.number}`, body: body.slice(0, 120), link: `/support/${id}` });
      else {
        const admins = await tx.user.findMany({ where: { role: "PLATFORM_ADMIN", active: true }, select: { id: true } });
        await notifyUsers(tx, admins.map((a) => a.id), { type: "TICKET", title: `Customer replied on ${t.number}`, link: `/support/${id}` });
      }
    });
    revalidatePath(`/support/${id}`);
  });
}

export async function ticketStatusAction(id: string, status: string) {
  return run([...VENDOR, "PLATFORM_ADMIN"], async (u) => {
    if (!(TICKET_STATUSES as readonly string[]).includes(status)) throw new DomainError("Unknown status");
    const t = await loadTicket(id, u);
    // Vendors may only close or reopen; platform staff drive the rest of the workflow.
    if (u.role !== "PLATFORM_ADMIN" && !["CLOSED", "OPEN"].includes(status)) throw new DomainError("Not allowed");
    await db.$transaction(async (tx) => {
      await tx.supportTicket.update({ where: { id }, data: { status } });
      await audit(tx, u, { entityType: "TICKET", entityId: id, action: "TICKET_STATUS", fromStatus: t.status, toStatus: status });
    });
    revalidatePath(`/support/${id}`);
  });
}
