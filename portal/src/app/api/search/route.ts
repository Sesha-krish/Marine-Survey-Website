import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { normalizeContainer } from "@/lib/iso6346";
import { customerName } from "@/lib/format";
import { humanize } from "@/lib/constants";

// Tenant-scoped global search for the ⌘K palette. orgId always comes from the session.
export async function GET(req: Request) {
  const u = await getSession();
  if (!u || !["VENDOR_ADMIN", "VENDOR_STAFF"].includes(u.role)) return NextResponse.json([], { status: u ? 200 : 401 });
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json([]);
  const orgId = u.orgId;
  const container = normalizeContainer(q);
  const [rfqs, jobs, customers, surveyors] = await Promise.all([
    db.rfq.findMany({
      where: { orgId, OR: [{ number: { contains: q.toUpperCase() } }, { legacyNumber: { contains: q.toUpperCase() } }, { customer: { organizationName: { contains: q } } }, { areaName: { contains: q } }] },
      include: { customer: true }, take: 5, orderBy: { createdAt: "desc" },
    }),
    db.jobOrder.findMany({
      where: { orgId, OR: [{ number: { contains: q.toUpperCase() } }, { containerNumber: { contains: container } }] },
      include: { surveyType: true }, take: 5, orderBy: { createdAt: "desc" },
    }),
    db.customer.findMany({ where: { orgId, OR: [{ organizationName: { contains: q } }, { firstName: { contains: q } }, { email: { contains: q.toLowerCase() } }] }, take: 4 }),
    db.surveyor.findMany({ where: { OR: [{ orgId }, { orgId: null }], name: { contains: q } }, take: 3 }),
  ]);
  return NextResponse.json([
    ...rfqs.map((r) => ({ type: "RFQ", label: r.number + (r.legacyNumber ? ` (${r.legacyNumber})` : ""), sub: `${customerName(r.customer)} · ${humanize(r.status)}`, href: `/rfqs/${r.id}` })),
    ...jobs.map((j) => ({ type: "Job", label: j.number, sub: `${j.surveyType.name}${j.containerNumber ? ` · ${j.containerNumber}` : ""} · ${humanize(j.status)}`, href: `/jobs/${j.id}` })),
    ...customers.map((c) => ({ type: "Customer", label: customerName(c), sub: c.email, href: `/customers?q=${encodeURIComponent(customerName(c))}` })),
    ...surveyors.map((s) => ({ type: "Surveyor", label: s.name, sub: s.kind === "IN_HOUSE" ? "In-house" : "Independent", href: `/surveyors/${s.id}` })),
  ]);
}
