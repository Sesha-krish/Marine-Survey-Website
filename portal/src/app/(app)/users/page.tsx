import { Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge, Card, EmptyState, PageHeader, StatusPill } from "@/components/ui/misc";
import { DataTable, Pagination, type Column } from "@/components/app/data-table";
import { ListToolbar } from "@/components/app/list-toolbar";
import { ASSIGNABLE_ROLES, ROLE_LABEL, type Role } from "@/lib/constants";
import { formatPhone } from "@/lib/countries";
import { fmtDate, fmtRelative, personName } from "@/lib/format";
import { listParams, multi, type SP } from "@/server/list";
import { UserFormButton, UserRowActions } from "./client";

export const metadata = { title: "User Management" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requireUser(["VENDOR_ADMIN"]);
  const sp = await searchParams;
  const lp = listParams(sp, { sortable: ["firstName", "createdAt", "lastLoginAt"], defaultSort: "createdAt" });
  const role = multi(sp, "role", ASSIGNABLE_ROLES);
  const where = {
    orgId: u.orgId,
    ...(role.length ? { role: { in: role } } : {}),
    ...(lp.q ? { OR: [{ firstName: { contains: lp.q } }, { lastName: { contains: lp.q } }, { email: { contains: lp.q.toLowerCase() } }, { phone: { contains: lp.q } }] } : {}),
    ...(lp.from || lp.to ? { createdAt: { ...(lp.from ? { gte: lp.from } : {}), ...(lp.to ? { lte: lp.to } : {}) } } : {}),
  };
  const [total, rows] = await Promise.all([db.user.count({ where }), db.user.findMany({ where, orderBy: { [lp.sortKey]: lp.dir }, skip: lp.skip, take: lp.take })]);
  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    { key: "firstName", header: "Name", sortable: true, primary: true, cell: (x) => <>{personName(x)}{x.id === u.id && <Badge tone="teal" className="ml-1.5">You</Badge>}</> },
    { key: "role", header: "Role", cell: (x) => ROLE_LABEL[x.role as Role] },
    { key: "email", header: "Email", cell: (x) => x.email },
    { key: "phone", header: "Mobile", cell: (x) => <span className="whitespace-nowrap">{formatPhone(x.phone)}</span> },
    { key: "createdAt", header: "Created", sortable: true, cell: (x) => fmtDate(x.createdAt) },
    { key: "lastLoginAt", header: "Last sign-in", sortable: true, cell: (x) => (x.lastLoginAt ? fmtRelative(x.lastLoginAt) : "Never") },
    { key: "security", header: "2FA", mobileHidden: true, cell: (x) => (x.totpEnabled ? <Badge tone="green">On</Badge> : <Badge tone="slate">Off</Badge>) },
    { key: "status", header: "Status", cell: (x) => <StatusPill status={x.active ? "ACTIVE" : "INACTIVE"} /> },
  ];
  return (
    <>
      <PageHeader title="User Management" description="Who can sign in to your workspace. Users are deactivated, never deleted." actions={<UserFormButton />} />
      <Card>
        <ListToolbar listKey="users" searchPlaceholder="Search name, email, mobile" total={total} filters={[{ key: "role", label: "Role", type: "multi", options: ASSIGNABLE_ROLES, labels: ROLE_LABEL }]} />
        <DataTable
          caption="Users"
          columns={columns}
          rows={rows}
          searchParams={sp}
          actions={(x) => <UserRowActions self={x.id === u.id} user={{ id: x.id, role: x.role, firstName: x.firstName, middleName: x.middleName ?? "", lastName: x.lastName ?? "", email: x.email, phone: x.phone ?? "", active: x.active }} />}
          empty={<EmptyState icon={<Users className="h-6 w-6" />} title="No users match" />}
        />
        <Pagination page={lp.page} pageSize={lp.pageSize} total={total} searchParams={sp} />
      </Card>
    </>
  );
}
