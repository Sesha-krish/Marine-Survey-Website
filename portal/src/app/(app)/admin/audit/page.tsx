import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader, StatusPill } from "@/components/ui/misc";
import { DataTable, Pagination, type Column } from "@/components/app/data-table";
import { ListToolbar } from "@/components/app/list-toolbar";
import { AUDIT_LABEL } from "@/lib/audit";
import { fmtDateTime } from "@/lib/format";
import { dateRange, listParams, str, type SP } from "@/server/list";

export const metadata = { title: "Audit Log" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser(["PLATFORM_ADMIN"]);
  const sp = await searchParams;
  const lp = listParams(sp, { sortable: ["createdAt"], defaultSort: "createdAt", pageSize: 30 });
  const orgId = str(sp, "org");
  const entity = str(sp, "entity");
  const where = {
    ...(orgId ? { orgId } : {}),
    ...(entity ? { entityType: entity } : {}),
    ...(dateRange(lp.from, lp.to) ? { createdAt: dateRange(lp.from, lp.to) } : {}),
    ...(lp.q ? { OR: [{ action: { contains: lp.q.toUpperCase() } }, { actorName: { contains: lp.q } }, { note: { contains: lp.q } }, { entityId: lp.q }] } : {}),
  };
  const [total, rows, orgs] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({ where, orderBy: { createdAt: lp.dir }, skip: lp.skip, take: lp.take }),
    db.organization.findMany({ select: { id: true, name: true } }),
  ]);
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));
  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    { key: "createdAt", header: "When", sortable: true, primary: true, cell: (r) => <span className="whitespace-nowrap">{fmtDateTime(r.createdAt)}</span> },
    { key: "org", header: "Tenant", cell: (r) => (r.orgId ? orgName.get(r.orgId) : "—") },
    { key: "actor", header: "Actor", cell: (r) => r.actorName ?? "System" },
    { key: "action", header: "Action", cell: (r) => AUDIT_LABEL[r.action] ?? r.action },
    { key: "entity", header: "Entity", cell: (r) => <span className="whitespace-nowrap text-xs">{r.entityType}<span className="block font-mono text-subtle">{r.entityId.slice(0, 10)}…</span></span> },
    { key: "change", header: "Change", cell: (r) => (r.toStatus ? <span className="flex items-center gap-1">{r.fromStatus && <><StatusPill status={r.fromStatus} />→</>}<StatusPill status={r.toStatus} /></span> : "—") },
    { key: "note", header: "Note", mobileHidden: true, cell: (r) => <span className="line-clamp-2 max-w-80 text-[13px]">{r.note}</span> },
  ];
  return (
    <>
      <PageHeader title="Audit Log" description="Append-only record of every state change across all tenants." />
      <Card>
        <ListToolbar
          listKey="audit"
          searchPlaceholder="Search action, actor, note or entity ID"
          total={total}
          filters={[
            { key: "org", label: "Tenant", type: "select", options: orgs.map((o) => ({ value: o.id, label: o.name })) },
            { key: "entity", label: "Entity", type: "select", options: ["RFQ", "JOB_ORDER", "ASSIGNMENT", "SURVEY", "REPORT", "INVOICE", "CUSTOMER", "USER", "SURVEYOR", "TICKET", "TEMPLATE", "SURVEY_TYPE", "ORGANIZATION"].map((e) => ({ value: e, label: e })) },
          ]}
        />
        <DataTable caption="Audit log" columns={columns} rows={rows} searchParams={sp} />
        <Pagination page={lp.page} pageSize={lp.pageSize} total={total} searchParams={sp} />
      </Card>
    </>
  );
}
