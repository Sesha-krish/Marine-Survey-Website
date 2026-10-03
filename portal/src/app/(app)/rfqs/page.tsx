import { FileText, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, DemoBadge, EmptyState, PageHeader, StatusPill } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { DataTable, Pagination, type Column } from "@/components/app/data-table";
import { ListToolbar } from "@/components/app/list-toolbar";
import { REQUEST_SOURCES, RFQ_STATUSES, humanize } from "@/lib/constants";
import { customerName, fmtDate, fmtMoney } from "@/lib/format";
import { rfqQuery } from "@/server/queries";
import type { SP } from "@/server/list";
import { RfqBulkBar } from "./bulk";

export const metadata = { title: "RFQs" };

export default async function RfqsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requireUser(["VENDOR_ADMIN", "VENDOR_STAFF"]);
  const sp = await searchParams;
  const { lp, where, orderBy } = rfqQuery(u.orgId, sp);
  const [total, rows, types, users, counts] = await Promise.all([
    db.rfq.count({ where }),
    db.rfq.findMany({
      where, orderBy, skip: lp.skip, take: lp.take,
      include: { customer: true, lines: { include: { surveyType: true } }, _count: { select: { jobOrders: true } } },
    }),
    db.surveyType.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.user.findMany({ where: { orgId: u.orgId, role: { in: ["VENDOR_ADMIN", "VENDOR_STAFF"] } }, select: { id: true, firstName: true, lastName: true } }),
    db.rfq.groupBy({ by: ["status"], where: { orgId: u.orgId }, _count: true }),
  ]);
  const userName = new Map(users.map((x) => [x.id, `${x.firstName} ${x.lastName ?? ""}`.trim()]));
  const count = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;

  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    { key: "number", header: "RFQ", sortable: true, primary: true, cell: (r) => <span className="whitespace-nowrap">{r.number}{r.isDemo && <DemoBadge />}{r.legacyNumber && <span className="block text-xs font-normal text-subtle">{r.legacyNumber}</span>}</span> },
    { key: "createdAt", header: "Received", sortable: true, cell: (r) => <span className="whitespace-nowrap">{fmtDate(r.createdAt)}<span className="block text-xs text-subtle">{humanize(r.requestSource)}</span></span> },
    { key: "customer", header: "Customer", cell: (r) => <span className="line-clamp-2">{customerName(r.customer)}</span> },
    { key: "place", header: "Place of survey", cell: (r) => <span className="line-clamp-2 max-w-56">{r.areaName}<span className="block text-xs text-subtle">{humanize(r.surveyArea)}</span></span> },
    { key: "types", header: "Survey", cell: (r) => <span className="line-clamp-2 max-w-48">{r.lines.map((l) => `${l.surveyType.name} ×${l.quantity}`).join(", ")}</span> },
    { key: "surveyDate", header: "Survey date", sortable: true, cell: (r) => <span className="whitespace-nowrap">{fmtDate(r.surveyDate)}</span> },
    { key: "createdBy", header: "Created by", mobileHidden: true, cell: (r) => userName.get(r.createdById) ?? "—" },
    { key: "estimatedRate", header: "Rate", sortable: true, className: "text-right", cell: (r) => <span className="whitespace-nowrap tabular-nums">{fmtMoney(r.estimatedRate, r.currency)}</span> },
    { key: "status", header: "Status", sortable: true, cell: (r) => <StatusPill status={r.status} /> },
  ];

  const quick = [
    { label: "All", href: "/rfqs", n: counts.reduce((s, c) => s + c._count, 0) },
    ...["NEW", "ACCEPTED", "ASSIGNED", "IN_PROGRESS", "COMPLETED"].map((s) => ({ label: humanize(s), href: `/rfqs?status=${s}`, n: count(s), s })),
  ];
  const currentStatus = typeof sp.status === "string" ? sp.status : "";

  return (
    <>
      <PageHeader title="RFQs" description="Every request for quotation, from intake to completion." actions={<ButtonLink href="/rfqs/new"><Plus className="h-4 w-4" aria-hidden /> Submit RFQ</ButtonLink>} />
      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Quick status filters">
        {quick.map((q) => {
          const active = ("s" in q ? currentStatus === q.s : !currentStatus);
          return (
            <a key={q.label} href={q.href} aria-current={active ? "true" : undefined} className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium ${active ? "border-accent-strong bg-accent-soft text-accent-strong" : "border-border bg-surface text-muted hover:text-text"}`}>
              {q.label} <span className="tabular-nums text-subtle">{q.n}</span>
            </a>
          );
        })}
      </nav>
      <Card>
        <ListToolbar
          listKey="rfqs"
          searchPlaceholder="Search RFQ no., legacy no., customer, place, container"
          total={total}
          exportHref="/api/export/rfqs"
          filters={[
            { key: "status", label: "Status", type: "multi", options: RFQ_STATUSES },
            { key: "source", label: "Request source", type: "multi", options: REQUEST_SOURCES },
            { key: "type", label: "Survey type", type: "select", options: types.map((t) => ({ value: t.id, label: t.name })) },
            { key: "createdBy", label: "Created by", type: "select", options: users.map((x) => ({ value: x.id, label: `${x.firstName} ${x.lastName ?? ""}` })) },
          ]}
        />
        <RfqBulkBar />
        <DataTable
          caption="RFQs"
          columns={columns}
          rows={rows}
          searchParams={sp}
          rowHref={(r) => `/rfqs/${r.id}`}
          selectable={{ formId: "bulk-rfqs", label: (r) => `Select ${r.number}` }}
          actions={(r) => <ButtonLink href={`/rfqs/${r.id}`} variant="ghost" size="sm" aria-label={`Open ${r.number}`}>Open</ButtonLink>}
          empty={
            <EmptyState
              icon={<FileText className="h-6 w-6" />}
              title={Object.keys(sp).length ? "No RFQs match these filters" : "No RFQs yet"}
              description={Object.keys(sp).length ? "Try clearing a filter or widening the date range." : "When a customer calls, find or add them, then submit their RFQ."}
              action={<ButtonLink href="/rfqs/new">Submit RFQ</ButtonLink>}
            />
          }
        />
        <Pagination page={lp.page} pageSize={lp.pageSize} total={total} searchParams={sp} />
      </Card>
    </>
  );
}
