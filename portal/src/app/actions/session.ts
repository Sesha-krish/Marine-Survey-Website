"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { clientIp, createSession, destroySession, homeFor, rateLimit, verifyPassword, type SessionUser } from "@/lib/auth";
import { verifyTotp } from "@/lib/totp";
import type { Role } from "@/lib/constants";

export type LoginState = { error?: string; needTotp?: boolean; email?: string };

export async function loginAction(_: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const code = String(form.get("code") ?? "").trim();
  const next = String(form.get("next") ?? "");
  const ip = clientIp(await headers());

  if (!rateLimit(`login:${ip}:${email}`, 8, 10 * 60_000)) return { error: "Too many attempts. Please wait 10 minutes and try again.", email };
  if (!email || !password) return { error: "Enter your email and password.", email };

  const user = await db.user.findUnique({ where: { email } });
  // Same message for unknown user / wrong password (no account enumeration).
  if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) return { error: "Email or password is incorrect.", email };

  if (user.totpEnabled && user.totpSecret) {
    if (!code) return { needTotp: true, email };
    if (!verifyTotp(user.totpSecret, code)) return { needTotp: true, email, error: "That code didn't match. Use the current 6-digit code from your authenticator app." };
  }

  await createSession(user.id);
  await db.auditLog.create({ data: { orgId: user.orgId, actorId: user.id, actorName: `${user.firstName} ${user.lastName ?? ""}`.trim(), entityType: "USER", entityId: user.id, action: "LOGIN", ip } });
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : homeFor(user.role as Role);
  redirect(safeNext);
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

export type { SessionUser };
