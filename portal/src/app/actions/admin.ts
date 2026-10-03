"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { run } from "@/server/action";
import { DomainError, NotFound } from "@/server/errors";
import { validateTemplate } from "@/lib/templates/check";

const A = ["PLATFORM_ADMIN"] as const;

export async function setTypeCostAction(typeId: string, creditCost: number, active: boolean) {
  return run([...A], async (u) => {
    if (!Number.isInteger(creditCost) || creditCost < 0 || creditCost > 100) throw new DomainError("Credit cost must be 0–100");
    await db.$transaction(async (tx) => {
      const t = await tx.surveyType.update({ where: { id: typeId }, data: { creditCost, active } });
      await audit(tx, u, { entityType: "SURVEY_TYPE", entityId: typeId, action: "TAXONOMY_UPDATED", note: `${t.name}: ${creditCost} credit(s), ${active ? "active" : "inactive"}` });
    });
    revalidatePath("/admin/taxonomy");
  });
}

/** New survey type. It stays hidden from RFQ forms until a template is published for it (no empty leaves). */
export async function addTypeAction(subCategoryId: string, name: string, code: string, scope: string[]) {
  return run([...A], async (u) => {
    const c = code.trim().toUpperCase();
    if (!/^[A-Z]{2,6}$/.test(c)) throw new DomainError("Code must be 2–6 letters", { code: "2–6 letters" });
    if (!name.trim()) throw new DomainError("Name is required", { name: "Required" });
    if (await db.surveyType.findUnique({ where: { code: c } })) throw new DomainError("Code already used", { code: "Already used" });
    const items = scope.map((s) => s.trim()).filter(Boolean);
    if (!items.length) throw new DomainError("Add at least one scope item", { scope: "Required" });
    await db.$transaction(async (tx) => {
      const t = await tx.surveyType.create({ data: { subCategoryId, name: name.trim(), code: c, scopeItems: { create: items.map((text, i) => ({ text, sortOrder: i })) } } });
      await audit(tx, u, { entityType: "SURVEY_TYPE", entityId: t.id, action: "TAXONOMY_UPDATED", note: `Added ${t.name} (${c}) — publish a template to make it orderable` });
    });
    revalidatePath("/admin/taxonomy");
  });
}

export async function saveScopeAction(typeId: string, scope: string[]) {
  return run([...A], async (u) => {
    const items = scope.map((s) => s.trim()).filter(Boolean);
    if (!items.length) throw new DomainError("A survey type needs at least one scope item");
    await db.$transaction(async (tx) => {
      await tx.scopeItem.deleteMany({ where: { surveyTypeId: typeId } });
      await tx.scopeItem.createMany({ data: items.map((text, i) => ({ surveyTypeId: typeId, text, sortOrder: i })) });
      await audit(tx, u, { entityType: "SURVEY_TYPE", entityId: typeId, action: "TAXONOMY_UPDATED", note: `Scope checklist updated (${items.length} items)` });
    });
    revalidatePath("/admin/taxonomy");
  });
}

export async function setOverrideAction(orgId: string, typeId: string, creditCost: number | null) {
  return run([...A], async (u) => {
    await db.$transaction(async (tx) => {
      if (creditCost === null) await tx.rateOverride.deleteMany({ where: { orgId, surveyTypeId: typeId } });
      else {
        if (!Number.isInteger(creditCost) || creditCost < 0) throw new DomainError("Invalid credit cost");
        await tx.rateOverride.upsert({ where: { orgId_surveyTypeId: { orgId, surveyTypeId: typeId } }, create: { orgId, surveyTypeId: typeId, creditCost }, update: { creditCost } });
      }
      await audit(tx, u, { entityType: "ORGANIZATION", entityId: orgId, action: "TAXONOMY_UPDATED", note: `Rate override ${creditCost === null ? "removed" : `set to ${creditCost}`}` });
    });
    revalidatePath(`/admin/tenants/${orgId}`);
  });
}

export async function adjustCreditsAction(orgId: string, delta: number, note: string) {
  return run([...A], async (u) => {
    if (!Number.isInteger(delta) || delta === 0) throw new DomainError("Enter a non-zero whole number");
    if (!note.trim()) throw new DomainError("A note is required for manual adjustments");
    const { postCredits } = await import("@/server/credits");
    await db.$transaction(async (tx) => {
      await postCredits(tx, orgId, delta, "ADJUSTMENT", { type: "ADMIN", actor: u });
      await audit(tx, u, { entityType: "ORGANIZATION", entityId: orgId, action: "CREDITS_PURCHASED", note: `Manual adjustment ${delta > 0 ? "+" : ""}${delta}: ${note}` });
    });
    revalidatePath(`/admin/tenants/${orgId}`);
  });
}

/** Publish a new template VERSION. Existing surveys stay bound to the version they started with. */
export async function publishTemplateAction(typeId: string, json: string) {
  return run([...A], async (u) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch (e) {
      throw new DomainError(`Not valid JSON: ${(e as Error).message}`);
    }
    const problems = validateTemplate(parsed);
    if (problems.length) throw new DomainError(`Template has ${problems.length} problem(s): ${problems.slice(0, 5).join("; ")}`);
    const type = await db.surveyType.findUnique({ where: { id: typeId } });
    if (!type) throw new NotFound("Survey type");
    const last = await db.surveyTemplate.findFirst({ where: { surveyTypeId: typeId }, orderBy: { version: "desc" } });
    const version = (last?.version ?? 0) + 1;
    const schema = { ...(parsed as object), code: type.code, version };
    await db.$transaction(async (tx) => {
      const t = await tx.surveyTemplate.create({ data: { surveyTypeId: typeId, version, name: (parsed as { name: string }).name, schema: JSON.stringify(schema), published: true } });
      await audit(tx, u, { entityType: "TEMPLATE", entityId: t.id, action: "TEMPLATE_PUBLISHED", note: `${type.name} v${version}` });
    });
    revalidatePath("/admin/templates");
    return version;
  });
}

export async function setTenantActiveAction(orgId: string, active: boolean) {
  return run([...A], async (u) => {
    await db.$transaction(async (tx) => {
      await tx.user.updateMany({ where: { orgId }, data: { active } });
      if (!active) await tx.session.updateMany({ where: { user: { orgId } }, data: { revoked: true } });
      await audit(tx, u, { entityType: "ORGANIZATION", entityId: orgId, action: active ? "USER_UPDATED" : "USER_DEACTIVATED", note: active ? "Tenant reactivated" : "Tenant suspended — all users signed out" });
    });
    revalidatePath("/admin/tenants");
  });
}
