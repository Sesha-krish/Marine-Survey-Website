"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { emailField, flattenErrors, phoneField } from "@/lib/schemas";
import { saveUpload, UploadError } from "@/lib/storage";
import { run } from "@/server/action";
import { DomainError, NotFound } from "@/server/errors";

const orgSchema = z.object({
  name: z.string().trim().min(2, "Company name is required").max(200),
  gstin: z.string().trim().toUpperCase().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, "GSTIN format is 22AAAAA0000A1Z5").optional().or(z.literal("").transform(() => undefined)),
  email: emailField("Billing email"),
  phone: phoneField("Phone"),
  address: z.string().trim().min(1, "Address is required").max(300),
  city: z.string().trim().min(1, "City is required").max(80),
  state: z.string().trim().min(1, "State is required").max(80),
});

export async function saveOrgAction(raw: unknown) {
  return run(["VENDOR_ADMIN"], async (u) => {
    const p = orgSchema.safeParse(raw);
    if (!p.success) throw new DomainError("Please fix the highlighted fields", flattenErrors(p.error));
    await db.$transaction(async (tx) => {
      await tx.organization.update({ where: { id: u.orgId }, data: { ...p.data, gstin: p.data.gstin ?? null } });
      await audit(tx, u, { entityType: "ORGANIZATION", entityId: u.orgId, action: "USER_UPDATED", note: "Company details updated" });
    });
    revalidatePath("/settings");
  });
}

/** Tenant-level letterhead with version history; the browser crops to 3811×780 before upload. */
export async function uploadLetterheadAction(form: FormData) {
  return run(["VENDOR_ADMIN"], async (u) => {
    const file = form.get("file");
    if (!(file instanceof File) || !file.size) throw new DomainError("Choose an image");
    let attachmentId: string;
    try {
      attachmentId = (await saveUpload({ file, kind: "letterhead", attachmentKind: "LETTERHEAD", orgId: u.orgId, userId: u.id })).id;
    } catch (e) {
      if (e instanceof UploadError) throw new DomainError(e.message);
      throw e;
    }
    await db.$transaction(async (tx) => {
      const last = await tx.letterhead.findFirst({ where: { orgId: u.orgId }, orderBy: { version: "desc" } });
      await tx.letterhead.updateMany({ where: { orgId: u.orgId }, data: { active: false } });
      const lh = await tx.letterhead.create({ data: { orgId: u.orgId, attachmentId, version: (last?.version ?? 0) + 1, active: true, createdById: u.id } });
      await audit(tx, u, { entityType: "LETTERHEAD", entityId: lh.id, action: "LETTERHEAD_UPLOADED", note: `Version ${lh.version} (now default)` });
    });
    revalidatePath("/settings");
  });
}

export async function activateLetterheadAction(id: string) {
  return run(["VENDOR_ADMIN"], async (u) => {
    await db.$transaction(async (tx) => {
      const lh = await tx.letterhead.findFirst({ where: { id, orgId: u.orgId } });
      if (!lh) throw new NotFound("Letterhead");
      await tx.letterhead.updateMany({ where: { orgId: u.orgId }, data: { active: false } });
      await tx.letterhead.update({ where: { id }, data: { active: true } });
      await audit(tx, u, { entityType: "LETTERHEAD", entityId: id, action: "LETTERHEAD_ACTIVATED", note: `Reverted to version ${lh.version}` });
    });
    revalidatePath("/settings");
  });
}
