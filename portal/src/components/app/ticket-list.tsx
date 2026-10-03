import { LifeBuoy } from "lucide-react";
import { db } from "@/lib/db";
import { Card, EmptyState, StatusPill } from "@/components/ui/misc";
import { DataTable, Pagination, type Column } from "@/components/app/data-table";
import { ListToolbar } from "@/components/app/list-toolbar";
import { PRIORITIES, SUPPORT_TYPES, TICKET_STATUSES, humanize } from "@/lib/constants";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import { listParams, multi, type SP } from "@/server/list";

/** Shared ticket table for the vendor Support page and the platform Support Queue. */
export async function TicketList({ orgId, sp, showOrg }: { orgId: string | null; sp: SP; showOrg?: boolean }) {
  const lp = listParams(sp, { sortable: ["createdAt", "slaDueAt", "updatedAt"], defaultSort: "updatedAt" });
  const status = multi(sp, "status", TICKET_STATUSES);
  const priority = multi(sp, "priority", PRIORITIES);
  const type = multi(sp, "type", SUPPORT_TYPES);
  const where = {
    ...(orgId ? { orgId } : {}),
    ...(status.length ? { status: { in: status } } : {}),
    ...(priority.length ? { priority: { in: priority } } : {}),
    ...(type.length ? { supportType: { in: type } } : {}),
    ...(lp.q ? { OR: [{ number: { contains: lp.q.toUpperCase() } }, { topic: { contains: lp.q } }, { description: { contains: lp.q } }] } : {}),
  };
  const [total, rows] = await Promise.all([
    db.supportTicket.count({ where }),
    db.supportTicket.findMany({ where, orderBy: { [lp.sortKey]: lp.dir }, skip: lp.skip, take: lp.take, include: { org: true, _count: { select: { messages: true } } } }),
  ]);
  const now = new Date();
  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    { key: "number", header: "Ticket", primary: true, cell: (t) => <span className="whitespace-nowrap">{t.number}</span> },
    ...(showOrg ? [{ key: "org", header: "Tenant", cell: (t: Row) => t.org.name }] : []),
    { key: "topic", header: "Topic", cell: (t) => <span className="line-clamp-2 max-w-72">{t.topic}</span> },
    { key: "priority", header: "Priority", cell: (t) => <StatusPill status={t.priority} /> },
    { key: "type", header: "Type", cell: (t) => humanize(t.supportType) },
    { key: "createdAt", header: "Created", sortable: true, cell: (t) => <span className="whitespace-nowrap">{fmtDateTime(t.createdAt)}</span> },
    { key: "slaDueAt", header: "SLA", sortable: true, cell: (t) => (["RESOLVED", "CLOSED"].includes(t.status) ? "—" : <span className={t.slaDueAt < now ? "font-medium text-danger" : ""}>{t.slaDueAt < now ? "Breached " : "Due "}{fmtRelative(t.slaDueAt)}</span>) },
    { key: "messages", header: "Msgs", mobileHidden: true, cell: (t) => t._count.messages },
    { key: "status", header: "Status", cell: (t) => <StatusPill status={t.status} /> },
  ];
  return (
    <Card>
      <ListToolbar
        listKey={showOrg ? "admin-tickets" : "tickets"}
        searchPlaceholder="Search ticket, topic, description"
        total={total}
        dateRange={false}
        filters={[
          { key: "status", label: "Status", type: "multi", options: TICKET_STATUSES },
          { key: "priority", label: "Priority", type: "multi", options: PRIORITIES },
          { key: "type", label: "Support type", type: "multi", options: SUPPORT_TYPES },
        ]}
      />
      <DataTable caption="Support tickets" columns={columns} rows={rows} searchParams={sp} rowHref={(t) => `/support/${t.id}`} empty={<EmptyState icon={<LifeBuoy className="h-6 w-6" />} title="No tickets" description="Raise a ticket and we'll get back within the SLA for its priority." />} />
      <Pagination page={lp.page} pageSize={lp.pageSize} total={total} searchParams={sp} />
    </Card>
  );
}
