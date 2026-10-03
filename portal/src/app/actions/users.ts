"use server";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { flattenErrors, userSchema } from "@/lib/schemas";
import { generateSecret, otpauthUrl, verifyTotp } from "@/lib/totp";
import { run } from "@/server/action";
import { DomainError, NotFound } from "@/server/errors";
import { ROLES } from "@/lib/constants";

const tempPassword = () => `Msp-${randomBytes(4).toString("hex")}!`;

/** Vendor admins invite users; the one-time password is shown once (email delivery not configured). */
export async function saveUserAction(id: string | null, raw: unknown) {
  return run(["VENDOR_ADMIN"], async (u) => {
    const p = userSchema.safeParse(raw);
    if (!p.success) throw new DomainError("Please fix the highlighted fields", flattenErrors(p.error));
    const v = p.data;
    let pw: string | null = null;
    const saved = await db.$transaction(async (tx) => {
      const dup = await tx.user.findUnique({ where: { email: v.email } });
      if (dup && dup.id !== id) throw new DomainError("This email already has a login", { email: "Already used" });
      if (id) {
        const before = await tx.user.findFirst({ where: { id, orgId: u.orgId } });
        if (!before) throw new NotFound("User");
        if (before.id === u.id && v.role !== "VENDOR_ADMIN") throw new DomainError("You can't remove your own admin role");
        const x = await tx.user.update({ where: { id }, data: v });
        await audit(tx, u, { entityType: "USER", entityId: id, action: "USER_UPDATED", note: `${v.firstName} ${v.lastName ?? ""} · ${v.role}` });
        return x;
      }
      pw = tempPassword();
      const x = await tx.user.create({ data: { ...v, orgId: u.orgId, passwordHash: await hashPassword(pw) } });
      if (v.role === "SURVEYOR") {
        // A surveyor login always has a surveyor profile, so assignments can reach them.
        const existing = await tx.surveyor.findFirst({ where: { orgId: u.orgId, email: v.email, userId: null } });
        if (existing) await tx.surveyor.update({ where: { id: existing.id }, data: { userId: x.id } });
        else await tx.surveyor.create({ data: { orgId: u.orgId, userId: x.id, kind: "IN_HOUSE", name: `${v.firstName} ${v.lastName ?? ""}`.trim(), email: v.email, phone: v.phone } });
      }
      await audit(tx, u, { entityType: "USER", entityId: x.id, action: "USER_CREATED", note: `${v.firstName} ${v.lastName ?? ""} · ${v.role}` });
      return x;
    });
    revalidatePath("/users");
    return { id: saved.id, tempPassword: pw as string | null };
  });
}

export async function setUserActiveAction(id: string, active: boolean) {
  return run(["VENDOR_ADMIN"], async (u) => {
    if (id === u.id) throw new DomainError("You can't deactivate yourself");
    await db.$transaction(async (tx) => {
      const x = await tx.user.findFirst({ where: { id, orgId: u.orgId } });
      if (!x) throw new NotFound("User");
      await tx.user.update({ where: { id }, data: { active } });
      if (!active) await tx.session.updateMany({ where: { userId: id }, data: { revoked: true } });
      await audit(tx, u, { entityType: "USER", entityId: id, action: active ? "USER_UPDATED" : "USER_DEACTIVATED", note: x.email });
    });
    revalidatePath("/users");
  });
}

export async function resetPasswordAction(id: string) {
  return run(["VENDOR_ADMIN"], async (u) => {
    const x = await db.user.findFirst({ where: { id, orgId: u.orgId } });
    if (!x) throw new NotFound("User");
    const pw = tempPassword();
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { passwordHash: await hashPassword(pw) } });
      await tx.session.updateMany({ where: { userId: id }, data: { revoked: true } });
      await audit(tx, u, { entityType: "USER", entityId: id, action: "USER_UPDATED", note: "Password reset by admin" });
    });
    return pw;
  });
}

// ───────────── Self-service (any role) ─────────────

export async function changePasswordAction(current: string, next: string) {
  return run([...ROLES], async (u) => {
    const x = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    if (!(await verifyPassword(current, x.passwordHash))) throw new DomainError("Current password is incorrect", { current: "Incorrect" });
    if (next.length < 10 || !/[A-Za-z]/.test(next) || !/\d/.test(next)) throw new DomainError("Use at least 10 characters with letters and numbers", { next: "Too weak" });
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(next) } });
      // Sign out every other session
      await tx.session.updateMany({ where: { userId: u.id, id: { not: u.sessionId } }, data: { revoked: true } });
      await audit(tx, u, { entityType: "USER", entityId: u.id, action: "USER_UPDATED", note: "Password changed" });
    });
  });
}

export async function beginTotpAction() {
  return run([...ROLES], async (u) => {
    const secret = generateSecret();
    await db.user.update({ where: { id: u.id }, data: { totpSecret: secret, totpEnabled: false } });
    return { secret, url: otpauthUrl(secret, u.email) };
  });
}

export async function confirmTotpAction(code: string) {
  return run([...ROLES], async (u) => {
    const x = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    if (!x.totpSecret || !verifyTotp(x.totpSecret, code)) throw new DomainError("That code didn't match — check your phone's clock and try the current code", { code: "Invalid code" });
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: u.id }, data: { totpEnabled: true } });
      await audit(tx, u, { entityType: "USER", entityId: u.id, action: "USER_UPDATED", note: "Two-factor authentication enabled" });
    });
  });
}

export async function disableTotpAction(password: string) {
  return run([...ROLES], async (u) => {
    const x = await db.user.findUniqueOrThrow({ where: { id: u.id } });
    if (!(await verifyPassword(password, x.passwordHash))) throw new DomainError("Password is incorrect", { password: "Incorrect" });
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: u.id }, data: { totpEnabled: false, totpSecret: null } });
      await audit(tx, u, { entityType: "USER", entityId: u.id, action: "USER_UPDATED", note: "Two-factor authentication disabled" });
    });
  });
}

export async function revokeSessionsAction() {
  return run([...ROLES], async (u) => {
    await db.session.updateMany({ where: { userId: u.id, id: { not: u.sessionId } }, data: { revoked: true } });
  });
}
