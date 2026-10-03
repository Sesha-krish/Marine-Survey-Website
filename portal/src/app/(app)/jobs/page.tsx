import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge, Card, EmptyState, PageHeader, StatusPill } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { DataTable, Pagination, type Column } from "@/components/app/data-table";
import { ListToolbar } from "@/components/app/list-toolbar";
import { JOB_STATUSES } from "@/lib/constants";
import { customerName, fmtDate } from "@/lib/format";
import { formatContainer } from "@/lib/iso6346";
import { jobQuery } from "@/server/queries";
import type { SP } from "@/server/list";
import { JobBulkBar } from "./bulk";

export const metadata = { title: "Job Orders" };

export default async function JobsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requireUser(["VENDOR_ADMIN", "VENDOR_STAFF"]);
  const sp = await searchParams;
  const { lp, where, orderBy } = jobQuery(u.orgId, sp);
  const [total, rows, types, surveyors] = await Promise.all([
    db.jobOrder.count({ where }),
    db.jobOrder.findMany({
      where, orderBy, skip: lp.skip, take: lp.take,
      include: { surveyType: true, rfq: { include: { customer: true } }, assignments: { include: { surveyor: true }, orderBy: { assignedAt: "desc" } } },
    }),
    db.surveyType.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.surveyor.findMany({ where: { OR: [{ orgId: u.orgId }, { orgId: null }] }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    { key: "number", header: "Job", sortable: true, primary: true, cell: (j) => <span className="whitespace-nowrap">{j.number}</span> },
    { key: "rfq", header: "RFQ", cell: (j) => <Link href={`/rfqs/${j.rfqId}`} className="whitespace-nowrap hover:underline">{j.rfq.number}</Link> },
    { key: "type", header: "Type of survey", cell: (j) => j.surveyType.name },
    { key: "container", header: "Container", cell: (j) => <span className="whitespace-nowrap font-mono text-[13px]">{formatContainer(j.containerNumber)}</span> },
    { key: "requester", header: "Requester", cell: (j) => <span className="line-clamp-1">{customerName(j.rfq.customer)}</span> },
    { key: "surveyDate", header: "Survey date", sortable: true, cell: (j) => <span className="whitespace-nowrap">{fmtDate(j.surveyDate)}</span> },
    {
      key: "surveyor", header: "Surveyor", cell: (j) => {
        const a = j.assignments.find((x) => !["REJECTED", "CANCELLED"].includes(x.status));
        const rejected = j.assignments.filter((x) => x.status === "REJECTED").length;
        return (
          <span className="flex flex-wrap items-center gap-1">
            {a ? <>{a.surveyor.name} <StatusPill status={a.status} /></> : <span className="text-subtle">Unassigned</span>}
            {rejected > 0 && <Badge tone="red">{rejected} rejected</Badge>}
          </span>
        );
      },
    },
    { key: "status", header: "Status", sortable: true, cell: (j) => <StatusPill status={j.status} /> },
  ];

  return (
    <>
      <PageHeader title="Job Orders" description="One job per container / unit. Allocate surveyors, track progress, review submissions." />
      <Card>
        <ListToolbar
          listKey="jobs"
          searchPlaceholder="Search job no., container (any spacing), RFQ, requester"
          total={total}
          exportHref="/api/export/jobs"
          filters={[
            { key: "status", label: "Status", type: "multi", options: JOB_STATUSES },
            { key: "type", label: "Survey type", type: "select", options: types.map((t) => ({ value: t.id, label: t.name })) },
            { key: "surveyor", label: "Surveyor", type: "select", options: surveyors.map((s) => ({ value: s.id, label: s.name })) },
          ]}
        />
        <JobBulkBar />
        <DataTable
          caption="Job orders"
          columns={columns}
          rows={rows}
          searchParams={sp}
          rowHref={(j) => `/jobs/${j.id}`}
          selectable={{ formId: "bulk-jobs", label: (j) => `Select ${j.number}`, disabled: (j) => j.status !== "NEW" || ["NEW", "DECLINED", "CANCELLED"].includes(j.rfq.status) }}
          actions={(j) => (
            <>
              <ButtonLink href={`/jobs/${j.id}`} variant="ghost" size="sm" aria-label={`View ${j.number}`}>View</ButtonLink>
              {j.status === "NEW" && <ButtonLink href={`/jobs/${j.id}?allocate=1`} variant="outline" size="sm" aria-label={`Allocate surveyor to ${j.number}`}>Allocate</ButtonLink>}
              {j.status === "SUBMITTED" && <ButtonLink href={`/jobs/${j.id}#survey`} variant="outline" size="sm">Review</ButtonLink>}
            </>
          )}
          empty={<EmptyState icon={<ClipboardList className="h-6 w-6" />} title="No job orders match" description="Job orders are created when you accept an RFQ." action={<ButtonLink href="/rfqs?status=NEW">RFQs waiting for acceptance</ButtonLink>} />}
        />
        <Pagination page={lp.page} pageSize={lp.pageSize} total={total} searchParams={sp} />
      </Card>
    </>
  );
}
