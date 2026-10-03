import Link from "next/link";
import { AlertTriangle, ClipboardList, Coins, FileCheck2, FileText, HardHat, ReceiptIndianRupee, UserX } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardHeader, PageHeader } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { PerformanceChart, RfqStatusChart } from "@/components/app/charts";
import { Timeline } from "@/components/app/timeline";
import { fmtMoney, fmtNumber } from "@/lib/format";
import { refreshOverdue } from "@/server/billing";

export const metadata = { title: "Dashboard" };

function monthKey(d: Date) {
  return new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit", timeZone: "Asia/Kolkata" }).format(d);
}

export default async function Dashboard() {
  const u = await requireUser(["VENDOR_ADMIN", "VENDOR_STAFF"]);
  const orgId = u.orgId;
  await refreshOverdue(orgId);
  const since = new Date();
  since.setMonth(since.getMonth() - 5, 1);
  since.setHours(0, 0, 0, 0);
  const twoDaysAgo = new Date(Date.now() - 2 * 86400_000);

  const [rfqCount, openJobs, surveyorCount, issuedReports, org, rfqs6, jobs6, reports6, staleNew, unassigned, rejectedWaiting, submitted, draftReports, overdue, outstanding, activity] =
    await Promise.all([
      db.rfq.count({ where: { orgId } }),
      db.jobOrder.count({ where: { orgId, status: { in: ["NEW", "ASSIGNED", "IN_PROGRESS", "SUBMITTED"] } } }),
      db.surveyor.count({ where: { orgId, active: true } }),
      db.report.count({ where: { orgId, status: { in: ["ISSUED", "REISSUED"] } } }),
      db.organization.findUniqueOrThrow({ where: { id: orgId } }),
      db.rfq.findMany({ where: { orgId, createdAt: { gte: since } }, select: { createdAt: true, status: true } }),
      db.jobOrder.findMany({ where: { orgId, createdAt: { gte: since } }, select: { createdAt: true, status: true, updatedAt: true } }),
      db.report.findMany({ where: { orgId, issuedAt: { gte: since } }, select: { issuedAt: true } }),
      db.rfq.count({ where: { orgId, status: "NEW", createdAt: { lt: twoDaysAgo } } }),
      db.jobOrder.count({ where: { orgId, status: "NEW", rfq: { status: { notIn: ["NEW", "DECLINED", "CANCELLED"] } } } }),
      db.jobOrder.count({ where: { orgId, status: "NEW", assignments: { some: { status: "REJECTED" } } } }),
      db.survey.count({ where: { status: "SUBMITTED", jobOrder: { orgId } } }),
      db.report.count({ where: { orgId, status: { in: ["GENERATED", "UNDER_REVIEW", "AMENDED"] }, stage: { in: ["CERTIFICATE", "FORMAL"] } } }),
      db.invoice.count({ where: { orgId, status: "OVERDUE" } }),
      db.invoice.aggregate({ where: { orgId, status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] }, currency: "INR" }, _sum: { total: true, amountPaid: true } }),
      db.auditLog.findMany({ where: { orgId, action: { not: "LOGIN" } }, orderBy: { createdAt: "desc" }, take: 8 }),
    ]);

  const months: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i, 1);
    months.push(monthKey(d));
  }
  const bucket = (s: string) =>
    s === "NEW" ? "New" : s === "ACCEPTED" || s === "ASSIGNED" ? "Accepted" : s === "IN_PROGRESS" ? "In Progress" : s === "COMPLETED" ? "Completed" : "Declined/Cancelled";
  const statusData = months.map((m) => {
    const row: Record<string, string | number> = { month: m, New: 0, Accepted: 0, "In Progress": 0, Completed: 0, "Declined/Cancelled": 0 };
    for (const r of rfqs6) if (monthKey(r.createdAt) === m) row[bucket(r.status)] = (row[bucket(r.status)] as number) + 1;
    return row;
  });
  const perf = months.map((m) => ({
    month: m,
    Created: jobs6.filter((j) => monthKey(j.createdAt) === m).length,
    Completed: jobs6.filter((j) => j.status === "COMPLETED" && monthKey(j.updatedAt) === m).length,
    "Reports issued": reports6.filter((r) => r.issuedAt && monthKey(r.issuedAt) === m).length,
  }));

  const outstandingAmt = (outstanding._sum.total ?? 0) - (outstanding._sum.amountPaid ?? 0);
  const kpis = [
    { label: "RFQs", value: rfqCount, href: "/rfqs", icon: FileText },
    { label: "Open job orders", value: openJobs, href: "/jobs?status=NEW,ASSIGNED,IN_PROGRESS,SUBMITTED", icon: ClipboardList },
    { label: "Surveyors", value: surveyorCount, href: "/surveyors", icon: HardHat },
    { label: "Reports issued", value: issuedReports, href: "/reports?status=ISSUED,REISSUED", icon: FileCheck2 },
  ];

  const attention = [
    { n: rejectedWaiting, label: "jobs rejected by a surveyor — reassign", href: "/jobs?status=NEW&rejected=1", icon: UserX, tone: "text-danger" },
    { n: unassigned, label: "job orders waiting for a surveyor", href: "/jobs?status=NEW", icon: ClipboardList, tone: "text-warning" },
    { n: staleNew, label: "RFQs in New for more than 2 days", href: "/rfqs?status=NEW&sort=createdAt&dir=asc", icon: FileText, tone: "text-warning" },
    { n: submitted, label: "submitted surveys to review", href: "/jobs?status=SUBMITTED", icon: FileCheck2, tone: "text-accent-strong" },
    { n: draftReports, label: "certificates / formal reports not yet issued", href: "/reports?status=GENERATED,UNDER_REVIEW,AMENDED", icon: FileCheck2, tone: "text-accent-strong" },
    { n: overdue, label: "overdue invoices", href: "/invoices?status=OVERDUE", icon: ReceiptIndianRupee, tone: "text-danger" },
  ].filter((a) => a.n > 0);
  if (org.creditBalance <= org.lowCreditAlert) attention.unshift({ n: org.creditBalance, label: "credits left — top up before submitting RFQs", href: "/billing", icon: Coins, tone: "text-danger" });

  return (
    <>
      <PageHeader title={`Welcome back, ${u.name.split(" ")[0]}`} description={u.orgName} actions={<ButtonLink href="/rfqs/new">Submit RFQ</ButtonLink>} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((k) => (
          <Link key={k.label} href={k.href} className="group rounded-xl border border-border bg-surface p-5 shadow-card transition-colors hover:border-accent">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-medium text-muted">{k.label}</p>
              <k.icon className="h-5 w-5 text-subtle group-hover:text-accent-strong" aria-hidden />
            </div>
            <p className="mt-2 text-3xl font-semibold tracking-tight">{fmtNumber(k.value)}</p>
            <p className="mt-1 text-xs text-accent-strong opacity-0 transition-opacity group-hover:opacity-100">View list →</p>
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Needs your attention" description="Work that is blocked until someone acts." />
          {attention.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted">Nothing is waiting on you. 🎉</p>
          ) : (
            <ul className="divide-y divide-border">
              {attention.map((a) => (
                <li key={a.label}>
                  <Link href={a.href} className="flex items-center gap-3 px-5 py-3 hover:bg-surface-2">
                    <a.icon className={`h-5 w-5 shrink-0 ${a.tone}`} aria-hidden />
                    <span className="text-sm">
                      <strong className="text-text">{a.n}</strong> <span className="text-muted">{a.label}</span>
                    </span>
                    <span className="ml-auto text-xs font-medium text-accent-strong">Open →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Receivables" description="Outstanding INR invoices" />
          <div className="px-5 py-5">
            <p className="text-3xl font-semibold tracking-tight">{fmtMoney(outstandingAmt)}</p>
            <p className="mt-1 text-sm text-muted">{overdue > 0 ? <span className="inline-flex items-center gap-1 text-danger"><AlertTriangle className="h-4 w-4" aria-hidden />{overdue} overdue</span> : "Nothing overdue"}</p>
            <ButtonLink href="/invoices" variant="outline" size="sm" className="mt-4">Aging report</ButtonLink>
          </div>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="RFQs — last 6 months" description="By month created, coloured by current status" />
          <div className="p-4">
            <RfqStatusChart data={statusData} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Monthly performance" description="Job orders created vs completed, and reports issued" />
          <div className="p-4">
            <PerformanceChart data={perf} />
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Recent activity" actions={<ButtonLink href="/rfqs" variant="ghost" size="sm">All RFQs</ButtonLink>} />
        <div className="px-5 py-5">
          <Timeline events={activity} />
        </div>
      </Card>
    </>
  );
}
