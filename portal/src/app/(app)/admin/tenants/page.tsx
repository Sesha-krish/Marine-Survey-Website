import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge, Card, PageHeader } from "@/components/ui/misc";
import { DataTable, type Column } from "@/components/app/data-table";
import { ButtonLink } from "@/components/ui/button";
import { fmtDate } from "@/lib/format";
import type { SP } from "@/server/list";

export const metadata = { title: "Tenants" };

export default async function TenantsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser(["PLATFORM_ADMIN"]);
  const sp = await searchParams;
  const orgs = await db.organization.findMany({
    where: { kind: { in: ["VENDOR", "REQUESTER"] } },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { users: true, rfqs: true, customers: true, surveyors: true } }, users: { where: { active: true }, select: { id: true } } },
  });
  type Row = (typeof orgs)[number];
  const columns: Column<Row>[] = [
    { key: "name", header: "Tenant", primary: true, cell: (o) => <>{o.name}{o.isDemo && <Badge tone="violet" className="ml-1.5">Demo</Badge>}</> },
    { key: "kind", header: "Kind", cell: (o) => <Badge tone={o.kind === "VENDOR" ? "blue" : "slate"}>{o.kind}</Badge> },
    { key: "users", header: "Users", cell: (o) => `${o.users.length}/${o._count.users} active` },
    { key: "rfqs", header: "RFQs", cell: (o) => o._count.rfqs },
    { key: "customers", header: "Customers", cell: (o) => o._count.customers },
    { key: "credits", header: "Credits", cell: (o) => (o.kind === "VENDOR" ? o.creditBalance : "—") },
    { key: "created", header: "Created", cell: (o) => fmtDate(o.createdAt) },
    { key: "status", header: "Status", cell: (o) => (o.users.length ? <Badge tone="green">Active</Badge> : <Badge tone="red">Suspended</Badge>) },
  ];
  return (
    <>
      <PageHeader title="Tenants" description="Every vendor and requester organisation on the platform." />
      <Card>
        <DataTable caption="Tenants" columns={columns} rows={orgs} searchParams={sp} rowHref={(o) => `/admin/tenants/${o.id}`} actions={(o) => <ButtonLink href={`/admin/tenants/${o.id}`} variant="ghost" size="sm">Manage</ButtonLink>} />
      </Card>
    </>
  );
}
