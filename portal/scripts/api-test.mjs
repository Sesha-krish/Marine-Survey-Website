// Exercises the surveyor sync + photo endpoints with a minted session. Usage: node scripts/api-test.mjs
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const BASE = process.env.BASE ?? "http://localhost:3100";
const db = new PrismaClient();
const u = await db.user.findUniqueOrThrow({ where: { email: process.env.EMAIL ?? "indie@msp.demo" }, include: { surveyor: true } });
const s = await db.session.create({ data: { userId: u.id, expiresAt: new Date(Date.now() + 3600e3) } });
const cookie = `msp_session=${await new SignJWT({ sid: s.id }).setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(env.SESSION_SECRET))}`;
const a = await db.assignment.findFirst({ where: { surveyorId: u.surveyor.id, status: "IN_PROGRESS" }, include: { jobOrder: { include: { survey: true } } } });
if (!a) { console.log("no in-progress assignment for this surveyor"); process.exit(0); }
const sv = a.jobOrder.survey;
console.log("survey", sv.number, "rev", sv.revision);
let r = await fetch(`${BASE}/api/surveys/${sv.id}/sync`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ answers: { remarks: "API test remark" }, changedKeys: ["remarks"], baseRevision: sv.revision }) });
console.log("sync", r.status, JSON.stringify(await r.json()).slice(0, 120));
// stale revision → field-level merge
r = await fetch(`${BASE}/api/surveys/${sv.id}/sync`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ answers: { trailerNo: "TN01XX0001" }, changedKeys: ["trailerNo"], baseRevision: 0 }) });
const d = await r.json(); console.log("stale sync", r.status, "conflict:", d.conflict, "kept remark:", d.answers?.remarks);
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC", "base64");
const fd = new FormData(); fd.set("file", new File([png], "x.png", { type: "image/png" })); fd.set("slot", "front_side"); fd.set("takenAt", new Date().toISOString()); fd.set("lat", "13.1"); fd.set("lng", "80.29");
r = await fetch(`${BASE}/api/surveys/${sv.id}/photos`, { method: "POST", headers: { cookie }, body: fd });
const pj = await r.json(); console.log("photo", r.status, pj.slot);
r = await fetch(`${BASE}${pj.url}`); console.log("signed file", r.status, r.headers.get("content-type"));
r = await fetch(`${BASE}${pj.url.replace(/sig=[^&]+/, "sig=bad")}`); console.log("tampered sig", r.status);
const bad = new FormData(); bad.set("file", new File([Buffer.from("hi")], "x.exe", { type: "application/x-msdownload" })); bad.set("slot", "front_side");
r = await fetch(`${BASE}/api/surveys/${sv.id}/photos`, { method: "POST", headers: { cookie }, body: bad }); console.log("bad mime", r.status, (await r.json()).error);
// another surveyor's survey must be refused
const other = await db.survey.findFirst({ where: { status: "IN_PROGRESS", jobOrder: { assignments: { none: { surveyorId: u.surveyor.id } } } } });
if (other) { r = await fetch(`${BASE}/api/surveys/${other.id}/sync`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ answers: { remarks: "x" }, baseRevision: 0 }) }); console.log("other's survey", r.status); }
await db.$disconnect();
