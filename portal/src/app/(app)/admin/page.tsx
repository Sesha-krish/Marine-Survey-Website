import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardHeader, PageHeader } from "@/components/ui/misc";
import { fmtNumber } from "@/lib/format";

export const metadata = { title: "Platform Admin" };

export default async function AdminHome() {
  await requireUser(["PLATFORM_ADMIN"]);
  const [vendors, rfqs, jobs, reports, openTickets, breached, types, unpublished] = await Promise.all([
    db.organization.count({ where: { kind: "VENDOR" } }),
    db.rfq.count(),
    db.jobOrder.count(),
    db.report.count({ where: { status: { in: ["ISSUED", "REISSUED"] } } }),
    db.supportTicket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER"] } } }),
    db.supportTicket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] }, slaDueAt: { lt: new Date() } } }),
    db.surveyType.count({ where: { active: true } }),
    db.surveyType.count({ where: { active: true, templates: { none: { published: true } } } }),
  ]);
  const tiles = [
    { l: "Vendor tenants", n: vendors, h: "/admin/tenants" },
    { l: "RFQs (all tenants)", n: rfqs, h: "/admin/tenants" },
    { l: "Job orders", n: jobs, h: "/admin/tenants" },
    { l: "Reports issued", n: reports, h: "/admin/audit?q=REPORT_ISSUED" },
    { l: "Open tickets", n: openTickets, h: "/admin/support" },
    { l: "SLA breached", n: breached, h: "/admin/support?status=OPEN,IN_PROGRESS" },
    { l: "Active survey types", n: types, h: "/admin/taxonomy" },
    { l: "Types without a template", n: unpublished, h: "/admin/templates" },
  ];
  return (
    <>
      <PageHeader title="Platform Admin" description="Tenants, taxonomy, survey templates, support and the audit trail." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.l} href={t.h} className="rounded-xl border border-border bg-surface p-5 shadow-card hover:border-accent">
            <p className="text-[13px] text-muted">{t.l}</p>
            <p className={`mt-1 text-3xl font-semibold ${t.l.includes("breached") || t.l.includes("without") ? (t.n ? "text-danger" : "") : ""}`}>{fmtNumber(t.n)}</p>
          </Link>
        ))}
      </div>
      <Card className="mt-6">
        <CardHeader title="Feature flags" description="Environment-driven in this build (see HANDOFF.md)." />
        <ul className="divide-y divide-border text-sm">
          {[["Payment gateway", "Simulated (Razorpay/Stripe adapter not configured)"], ["Email delivery", "Not configured — links are shown in-app"], ["File storage", "Local private disk with signed URLs (S3 adapter pending)"], ["PDF", "Browser print-to-PDF (server-side PDF pending)"]].map(([k, v]) => (
            <li key={k} className="flex justify-between gap-4 px-5 py-3"><span className="font-medium">{k}</span><span className="text-muted">{v}</span></li>
          ))}
        </ul>
      </Card>
    </>
  );
}
