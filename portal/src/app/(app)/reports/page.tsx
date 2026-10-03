import Link from "next/link";
import { FileCheck2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, EmptyState, PageHeader, StatusPill } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { DataTable, Pagination, type Column } from "@/components/app/data-table";
import { ListToolbar } from "@/components/app/list-toolbar";
import { REPORT_STAGES, REPORT_STAGE_LABEL, REPORT_STATUSES, type ReportStage } from "@/lib/constants";
import { fmtDate } from "@/lib/format";
import { formatContainer } from "@/lib/iso6346";
import { reportQuery } from "@/server/queries";
import type { SP } from "@/server/list";

export const metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requireUser(["VENDOR_ADMIN", "VENDOR_STAFF"]);
  const sp = await searchParams;
  const { lp, where, orderBy } = reportQuery(u.orgId, sp);
  const [total, rows] = await Promise.all([
    db.report.count({ where }),
    db.report.findMany({ where, orderBy, skip: lp.skip, take: lp.take, include: { survey: { include: { jobOrder: { include: { rfq: true, surveyType: true } } } } } }),
  ]);
  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    { key: "number", header: "Report", sortable: true, primary: true, cell: (r) => <span className="whitespace-nowrap">{r.number} <span className="text-xs font-normal text-subtle">v{r.currentVersion}</span></span> },
    { key: "stage", header: "Stage", cell: (r) => REPORT_STAGE_LABEL[r.stage as ReportStage] },
    { key: "survey", header: "Survey", cell: (r) => <span className="whitespace-nowrap">{r.survey.number}</span> },
    { key: "rfq", header: "RFQ / Job", cell: (r) => <span className="whitespace-nowrap"><Link className="hover:underline" href={`/rfqs/${r.survey.jobOrder.rfqId}`}>{r.survey.jobOrder.rfq.number}</Link><span className="block text-xs text-subtle">{r.survey.jobOrder.number}</span></span> },
    { key: "type", header: "Type of survey", cell: (r) => r.survey.jobOrder.surveyType.name },
    { key: "container", header: "Container", cell: (r) => <span className="whitespace-nowrap font-mono text-[13px]">{formatContainer(r.survey.jobOrder.containerNumber)}</span> },
    { key: "issuedAt", header: "Issued", sortable: true, cell: (r) => (r.issuedAt ? fmtDate(r.issuedAt) : "—") },
    { key: "status", header: "Status", sortable: true, cell: (r) => <span className="flex flex-wrap gap-1"><StatusPill status={r.status} />{r.sentAt && <StatusPill status="SENT" />}</span> },
  ];
  return (
    <>
      <PageHeader title="Reports" description="Certificates, preliminary, completion, formal and signed reports — generated from survey data, versioned, locked on issue." />
      <Card>
        <ListToolbar
          listKey="reports"
          searchPlaceholder="Search report, survey, job, RFQ, container"
          total={total}
          exportHref="/api/export/reports"
          filters={[
            { key: "stage", label: "Stage", type: "multi", options: REPORT_STAGES, labels: REPORT_STAGE_LABEL },
            { key: "status", label: "Status", type: "multi", options: REPORT_STATUSES },
          ]}
        />
        <DataTable
          caption="Reports"
          columns={columns}
          rows={rows}
          searchParams={sp}
          rowHref={(r) => `/reports/${r.id}`}
          actions={(r) => <ButtonLink href={`/reports/${r.id}`} variant="ghost" size="sm">Open</ButtonLink>}
          empty={<EmptyState icon={<FileCheck2 className="h-6 w-6" />} title="No reports match" description="Reports are generated when surveyors submit completed surveys." />}
        />
        <Pagination page={lp.page} pageSize={lp.pageSize} total={total} searchParams={sp} />
      </Card>
    </>
  );
}
