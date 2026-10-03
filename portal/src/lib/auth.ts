import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { db } from "./db";
import type { Role } from "./constants";

const COOKIE = "msp_session";
const SESSION_DAYS = 7;
const secret = () => new TextEncoder().encode(process.env.SESSION_SECRET ?? "");

export type SessionUser = {
  id: string;
  orgId: string;
  orgName: string;
  orgKind: string;
  role: Role;
  email: string;
  name: string;
  surveyorId: string | null;
  sessionId: string;
};

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10);
}
export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export async function createSession(userId: string) {
  const h = await headers();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  const s = await db.session.create({
    data: { userId, expiresAt, userAgent: h.get("user-agent")?.slice(0, 200), ip: clientIp(h) },
  });
  const token = await new SignJWT({ sid: s.id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  await db.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, secret());
      await db.session.update({ where: { id: String(payload.sid) }, data: { revoked: true } });
    } catch {
      /* already invalid */
    }
  }
  jar.delete(COOKIE);
}

export const getSession = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const s = await db.session.findUnique({
      where: { id: String(payload.sid) },
      include: { user: { include: { org: true, surveyor: true } } },
    });
    if (!s || s.revoked || s.expiresAt < new Date() || !s.user.active) return null;
    const u = s.user;
    return {
      id: u.id,
      orgId: u.orgId,
      orgName: u.org.name,
      orgKind: u.org.kind,
      role: u.role as Role,
      email: u.email,
      name: [u.firstName, u.lastName].filter(Boolean).join(" "),
      surveyorId: u.surveyor?.id ?? null,
      sessionId: s.id,
    };
  } catch {
    return null;
  }
});

/** Server components / actions: require a signed-in user, optionally with one of `roles`. */
export async function requireUser(roles?: Role[]): Promise<SessionUser> {
  const u = await getSession();
  if (!u) redirect("/login");
  if (roles && !roles.includes(u.role)) redirect(homeFor(u.role));
  return u;
}

export function homeFor(role: Role) {
  switch (role) {
    case "SURVEYOR":
      return "/s";
    case "REQUESTER":
      return "/r";
    case "PLATFORM_ADMIN":
      return "/admin";
    default:
      return "/dashboard";
  }
}

export function clientIp(h: Headers) {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "local";
}

// ───── Simple in-memory rate limiter (swap for Redis in multi-instance deployments) ─────
const buckets = new Map<string, { count: number; reset: number }>();
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  b.count++;
  return b.count <= limit;
}
