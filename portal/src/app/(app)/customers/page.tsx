import { Building2 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, DemoBadge, EmptyState, PageHeader, StatusPill } from "@/components/ui/misc";
import { DataTable, Pagination, type Column } from "@/components/app/data-table";
import { ListToolbar } from "@/components/app/list-toolbar";
import { countryName, formatPhone } from "@/lib/countries";
import { customerName, fmtDate } from "@/lib/format";
import { listParams, multi, type SP } from "@/server/list";
import { AddCustomerButton, CustomerRowActions } from "./client";

export const metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requireUser(["VENDOR_ADMIN", "VENDOR_STAFF"]);
  const sp = await searchParams;
  const lp = listParams(sp, { sortable: ["name", "createdAt", "city"], defaultSort: "createdAt" });
  const type = multi(sp, "type", ["ENTERPRISE", "INDIVIDUAL"]);
  const state = multi(sp, "state", ["ACTIVE", "INACTIVE"]);
  const where = {
    orgId: u.orgId,
    ...(type.length ? { customerType: { in: type } } : {}),
    ...(state.length === 1 ? { active: state[0] === "ACTIVE" } : {}),
    ...(lp.q ? { OR: [{ organizationName: { contains: lp.q } }, { firstName: { contains: lp.q } }, { lastName: { contains: lp.q } }, { email: { contains: lp.q.toLowerCase() } }, { phone: { contains: lp.q.replace(/\s/g, "") } }, { city: { contains: lp.q } }] } : {}),
    ...(lp.from || lp.to ? { createdAt: { ...(lp.from ? { gte: lp.from } : {}), ...(lp.to ? { lte: lp.to } : {}) } } : {}),
  };
  const orderBy = lp.sortKey === "name" ? [{ organizationName: lp.dir }, { firstName: lp.dir }] : lp.sortKey === "city" ? { city: lp.dir } : { createdAt: lp.dir };
  const [total, rows] = await Promise.all([
    db.customer.count({ where }),
    db.customer.findMany({ where, orderBy, skip: lp.skip, take: lp.take, include: { _count: { select: { rfqs: true } } } }),
  ]);

  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    { key: "name", header: "Customer", sortable: true, primary: true, cell: (c) => <span>{customerName(c)}{c.isDemo && <DemoBadge />}</span> },
    { key: "type", header: "Type", cell: (c) => (c.customerType === "ENTERPRISE" ? "Enterprise" : "Individual") },
    { key: "email", header: "Email", cell: (c) => c.email },
    { key: "phone", header: "Mobile", cell: (c) => <span className="whitespace-nowrap">{formatPhone(c.phone)}</span> },
    { key: "city", header: "Location", sortable: true, cell: (c) => `${c.city}, ${c.country === "IN" ? c.state : countryName(c.country)}` },
    { key: "rfqs", header: "RFQs", cell: (c) => c._count.rfqs },
    { key: "createdAt", header: "Added", sortable: true, mobileHidden: true, cell: (c) => fmtDate(c.createdAt) },
    { key: "status", header: "Status", cell: (c) => <StatusPill status={c.active ? "ACTIVE" : "INACTIVE"} /> },
  ];

  return (
    <>
      <PageHeader
        title="Customers"
        description="Search here first when a customer calls — reuse the record, then submit the RFQ."
        actions={<AddCustomerButton />}
      />
      <Card>
        <ListToolbar
          listKey="customers"
          searchPlaceholder="Search name, email, mobile, city"
          total={total}
          exportHref="/api/export/customers"
          filters={[
            { key: "type", label: "Type", type: "multi", options: ["ENTERPRISE", "INDIVIDUAL"] },
            { key: "state", label: "Status", type: "multi", options: ["ACTIVE", "INACTIVE"] },
          ]}
        />
        <DataTable
          caption="Customers"
          columns={columns}
          rows={rows}
          searchParams={sp}
          actions={(c) => <CustomerRowActions customer={JSON.parse(JSON.stringify(c))} />}
          empty={
            <EmptyState
              icon={<Building2 className="h-6 w-6" />}
              title={lp.q ? `No customer matches “${lp.q}”` : "No customers yet"}
              description={lp.q ? "Add them now — you'll be able to submit their RFQ straight after." : "Add your first customer, then submit an RFQ for them."}
              action={<AddCustomerButton initialName={lp.q} />}
            />
          }
        />
        <Pagination page={lp.page} pageSize={lp.pageSize} total={total} searchParams={sp} />
      </Card>
    </>
  );
}
