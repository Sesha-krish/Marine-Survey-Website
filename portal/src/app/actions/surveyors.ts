"use server";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth";
import { flattenErrors, kycSchema, surveyorRateSchema, surveyorSchema } from "@/lib/schemas";
import { saveUpload, UploadError } from "@/lib/storage";
import { run, VENDOR } from "@/server/action";
import { DomainError, NotFound } from "@/server/errors";

/** Vendors may edit their own surveyors (in-house + their own independents), never marketplace profiles. */
async function own(orgId: string, id: string) {
  const s = await db.surveyor.findFirst({ where: { id, orgId } });
  if (!s) throw new NotFound("Surveyor");
  return s;
}

function tempPassword() {
  return `Msp-${randomBytes(4).toString("hex")}!`;
}

export async function saveSurveyorAction(id: string | null, raw: unknown) {
  return run(VENDOR, async (u) => {
    const p = surveyorSchema.safeParse(raw);
    if (!p.success) throw new DomainError("Please fix the highlighted fields", flattenErrors(p.error));
    const { capabilities, createLogin, ...v } = p.data;
    const types = await db.surveyType.findMany({ where: { id: { in: capabilities } }, select: { id: true } });
    let password: string | null = null;
    const saved = await db.$transaction(async (tx) => {
      const dup = await tx.surveyor.findFirst({ where: { orgId: u.orgId, email: v.email, id: id ? { not: id } : undefined } });
      if (dup) throw new DomainError("A surveyor with this email already exists", { email: "Already used" });
      let s;
      if (id) {
        if (!(await tx.surveyor.findFirst({ where: { id, orgId: u.orgId } }))) throw new NotFound("Surveyor");
        s = await tx.surveyor.update({ where: { id }, data: v });
        await tx.surveyorCapability.deleteMany({ where: { surveyorId: id } });
      } else {
        s = await tx.surveyor.create({ data: { ...v, orgId: u.orgId } });
      }
      await tx.surveyorCapability.createMany({ data: types.map((t) => ({ surveyorId: s.id, surveyTypeId: t.id })) });
      if (createLogin && !s.userId) {
        const existing = await tx.user.findUnique({ where: { email: v.email } });
        if (existing) throw new DomainError("A login with this email already exists", { email: "Email already has a login" });
        password = tempPassword();
        const [first, ...rest] = v.name.split(" ");
        const user = await tx.user.create({ data: { orgId: u.orgId, email: v.email, phone: v.phone, passwordHash: await hashPassword(password), role: "SURVEYOR", firstName: first, lastName: rest.join(" ") || null } });
        await tx.surveyor.update({ where: { id: s.id }, data: { userId: user.id } });
        await audit(tx, u, { entityType: "USER", entityId: user.id, action: "USER_CREATED", note: `Surveyor login for ${v.name}` });
      }
      await audit(tx, u, { entityType: "SURVEYOR", entityId: s.id, action: id ? "SURVEYOR_UPDATED" : "SURVEYOR_CREATED", note: `${v.name} (${v.kind === "IN_HOUSE" ? "in-house" : "independent"})` });
      return s;
    });
    revalidatePath("/surveyors");
    return { id: saved.id, tempPassword: password as string | null };
  });
}

export async function setSurveyorActiveAction(id: string, active: boolean) {
  return run(VENDOR, async (u) => {
    const s = await own(u.orgId, id);
    await db.$transaction(async (tx) => {
      await tx.surveyor.update({ where: { id }, data: { active, availability: active ? "AVAILABLE" : "INACTIVE" } });
      if (s.userId) await tx.user.update({ where: { id: s.userId }, data: { active } });
      await audit(tx, u, { entityType: "SURVEYOR", entityId: id, action: "SURVEYOR_UPDATED", note: active ? "Reactivated" : "Deactivated" });
    });
    revalidatePath(`/surveyors/${id}`);
  });
}

export async function addRateAction(surveyorId: string, raw: unknown) {
  return run(VENDOR, async (u) => {
    await own(u.orgId, surveyorId);
    const p = surveyorRateSchema.safeParse(raw);
    if (!p.success) throw new DomainError("Please fix the highlighted fields", flattenErrors(p.error));
    await db.surveyorRate.create({ data: { surveyorId, surveyTypeId: p.data.surveyTypeId, location: p.data.location, amount: p.data.amount, effectiveFrom: new Date(`${p.data.effectiveFrom}T00:00:00+05:30`) } });
    revalidatePath(`/surveyors/${surveyorId}`);
  });
}

export async function deleteRateAction(surveyorId: string, rateId: string) {
  return run(VENDOR, async (u) => {
    await own(u.orgId, surveyorId);
    await db.surveyorRate.deleteMany({ where: { id: rateId, surveyorId } });
    revalidatePath(`/surveyors/${surveyorId}`);
  });
}

export async function addKycAction(surveyorId: string, form: FormData) {
  return run(VENDOR, async (u) => {
    await own(u.orgId, surveyorId);
    const p = kycSchema.safeParse({ docType: form.get("docType"), docNumber: form.get("docNumber"), expiresAt: form.get("expiresAt") || undefined });
    if (!p.success) throw new DomainError("Please fix the highlighted fields", flattenErrors(p.error));
    const file = form.get("file");
    let attachmentId: string | null = null;
    if (file instanceof File && file.size) {
      try {
        attachmentId = (await saveUpload({ file, kind: "document", attachmentKind: "KYC", orgId: u.orgId, userId: u.id })).id;
      } catch (e) {
        if (e instanceof UploadError) throw new DomainError(e.message, { file: e.message });
        throw e;
      }
    }
    await db.surveyorDocument.create({ data: { surveyorId, docType: p.data.docType, docNumber: p.data.docNumber, expiresAt: p.data.expiresAt ? new Date(p.data.expiresAt) : null, attachmentId } });
    revalidatePath(`/surveyors/${surveyorId}`);
  });
}

export async function reviewKycAction(surveyorId: string, docId: string, status: "VERIFIED" | "REJECTED") {
  return run(["VENDOR_ADMIN"], async (u) => {
    await own(u.orgId, surveyorId);
    await db.surveyorDocument.updateMany({ where: { id: docId, surveyorId }, data: { status, reviewerId: u.id, reviewedAt: new Date() } });
    revalidatePath(`/surveyors/${surveyorId}`);
  });
}
