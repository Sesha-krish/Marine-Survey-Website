// Smoke test: mints a session for a demo user and GETs pages, reporting status + any error markers.
// Usage: node scripts/smoke.mjs <email> <path> [<path>...]
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const db = new PrismaClient();
const [email, ...paths] = process.argv.slice(2);
const u = await db.user.findUniqueOrThrow({ where: { email } });
const s = await db.session.create({ data: { userId: u.id, expiresAt: new Date(Date.now() + 3600e3) } });
const token = await new SignJWT({ sid: s.id }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(env.SESSION_SECRET));
for (const p of paths) {
  const t = Date.now();
  const r = await fetch(`${process.env.BASE ?? "http://localhost:3100"}${p}`, { headers: { cookie: `msp_session=${token}` }, redirect: "manual" });
  const body = await r.text();
  const err = body.match(/(Unhandled Runtime Error|Application error|"digest":"\d+|NEXT_HTTP_ERROR|Internal Server Error)/)?.[0];
  console.log(r.status, `${Date.now() - t}ms`, p, r.headers.get("location") ?? "", err ? `!! ${err}` : "");
}
await db.$disconnect();
