import { FileCheck2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardHeader, EmptyState, PageHeader, StatusPill } from "@/components/ui/misc";
import { REPORT_STAGE_LABEL, type ReportStage } from "@/lib/constants";
import { fmtDate } from "@/lib/format";
import { formatContainer } from "@/lib/iso6346";
import { signToken } from "@/lib/storage";

export const metadata = { title: "My surveys" };

/**
 * Requester view: RFQs placed on their behalf by any vendor (matched by the customer email on the
 * vendor's record) and the reports issued to them. Read-only; drafts are never shown.
 */
export default async function RequesterHome() {
  const u = await requireUser(["REQUESTER"]);
  const rfqs = await db.rfq.findMany({
    where: { customer: { email: u.email, active: true } },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      org: true,
      lines: { include: { surveyType: true } },
      jobOrders: { include: { survey: { include: { reports: { where: { status: { in: ["ISSUED", "REISSUED"] } } } } } } },
    },
  });
  return (
    <>
      <PageHeader title="My surveys" description="Survey requests made on your behalf, and the reports issued to you." />
      {rfqs.length === 0 ? (
        <Card><EmptyState icon={<FileCheck2 className="h-6 w-6" />} title="Nothing yet" description="When a survey company records a request for you, it appears here." /></Card>
      ) : (
        <div className="space-y-4">
          {rfqs.map((r) => {
            const reports = r.jobOrders.flatMap((j) => (j.survey?.reports ?? []).map((rep) => ({ rep, job: j })));
            return (
              <Card key={r.id}>
                <CardHeader
                  title={<span className="flex flex-wrap items-center gap-2">{r.number} <StatusPill status={r.status} /></span>}
                  description={`${r.org.name} · ${r.lines.map((l) => `${l.surveyType.name} ×${l.quantity}`).join(", ")} · ${r.areaName} · ${fmtDate(r.surveyDate)}`}
                />
                {reports.length === 0 ? (
                  <p className="px-5 py-4 text-sm text-muted">No reports issued yet.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {reports.map(({ rep, job }) => (
                      <li key={rep.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                        <span>{REPORT_STAGE_LABEL[rep.stage as ReportStage]} {rep.number} <span className="text-muted">· {job.number}{job.containerNumber ? ` · ${formatContainer(job.containerNumber)}` : ""} · issued {fmtDate(rep.issuedAt)}</span></span>
                        <a className="font-medium text-accent-strong hover:underline" href={`/verify/${signToken(`${rep.id}:${rep.currentVersion}`, 3600)}`}>View report</a>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
