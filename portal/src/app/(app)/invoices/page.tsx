import Link from "next/link";
import { ReceiptIndianRupee } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardHeader, EmptyState, PageHeader, StatusPill } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { DataTable, Pagination, type Column } from "@/components/app/data-table";
import { ListToolbar } from "@/components/app/list-toolbar";
import { INVOICE_STATUSES } from "@/lib/constants";
import { customerName, fmtDate, fmtMoney } from "@/lib/format";
import { invoiceQuery } from "@/server/queries";
import { refreshOverdue } from "@/server/billing";
import type { SP } from "@/server/list";

export const metadata = { title: "Invoices" };

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requireUser(["VENDOR_ADMIN", "VENDOR_STAFF"]);
  await refreshOverdue(u.orgId);
  const sp = await searchParams;
  const { lp, where, orderBy } = invoiceQuery(u.orgId, sp);
  const [total, rows, open] = await Promise.all([
    db.invoice.count({ where }),
    db.invoice.findMany({ where, orderBy, skip: lp.skip, take: lp.take, include: { rfq: true, customer: true } }),
    db.invoice.findMany({ where: { orgId: u.orgId, status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] } }, select: { total: true, amountPaid: true, dueDate: true, currency: true } }),
  ]);
  // Aging buckets on outstanding INR balances
  const now = Date.now();
  const buckets = [
    { label: "Not yet due", test: (d: number) => d <= 0 },
    { label: "1–30 days", test: (d: number) => d > 0 && d <= 30 },
    { label: "31–60 days", test: (d: number) => d > 30 && d <= 60 },
    { label: "61–90 days", test: (d: number) => d > 60 && d <= 90 },
    { label: "90+ days", test: (d: number) => d > 90 },
  ].map((b) => ({
    label: b.label,
    amount: open.filter((i) => i.currency === "INR" && b.test(Math.floor((now - i.dueDate.getTime()) / 86400_000))).reduce((s, i) => s + i.total - i.amountPaid, 0),
  }));

  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    { key: "number", header: "Invoice", sortable: true, primary: true, cell: (i) => <span className="whitespace-nowrap">{i.number}</span> },
    { key: "rfq", header: "RFQ", cell: (i) => <Link href={`/rfqs/${i.rfqId}?tab=invoices`} className="whitespace-nowrap hover:underline">{i.rfq.number}</Link> },
    { key: "customer", header: "Requester", cell: (i) => <span className="line-clamp-1">{customerName(i.customer)}</span> },
    { key: "issueDate", header: "Issued", sortable: true, cell: (i) => <span className="whitespace-nowrap">{fmtDate(i.issueDate)}</span> },
    { key: "dueDate", header: "Due", sortable: true, cell: (i) => <span className="whitespace-nowrap">{fmtDate(i.dueDate)}</span> },
    { key: "total", header: "Amount", sortable: true, className: "text-right", cell: (i) => <span className="whitespace-nowrap tabular-nums">{fmtMoney(i.total, i.currency)}</span> },
    { key: "balance", header: "Balance", className: "text-right", cell: (i) => <span className="whitespace-nowrap tabular-nums">{fmtMoney(i.total - i.amountPaid, i.currency)}</span> },
    { key: "status", header: "Status", sortable: true, cell: (i) => <StatusPill status={i.status} /> },
  ];

  return (
    <>
      <PageHeader title="Invoices" description="GST invoices raised against RFQs. Payment status comes from recorded payments." />
      <Card className="mb-6">
        <CardHeader title="Receivables aging (INR)" />
        <dl className="grid grid-cols-2 divide-border sm:grid-cols-5 sm:divide-x">
          {buckets.map((b) => (
            <div key={b.label} className="px-5 py-4">
              <dt className="text-xs text-muted">{b.label}</dt>
              <dd className={`mt-1 text-lg font-semibold tabular-nums ${b.label !== "Not yet due" && b.amount > 0 ? "text-danger" : ""}`}>{fmtMoney(b.amount)}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card>
        <ListToolbar listKey="invoices" searchPlaceholder="Search invoice, RFQ, requester" total={total} exportHref="/api/export/invoices" filters={[{ key: "status", label: "Status", type: "multi", options: INVOICE_STATUSES }]} />
        <DataTable
          caption="Invoices"
          columns={columns}
          rows={rows}
          searchParams={sp}
          rowHref={(i) => `/invoices/${i.id}`}
          actions={(i) => <ButtonLink href={`/invoices/${i.id}`} variant="ghost" size="sm">Open</ButtonLink>}
          empty={<EmptyState icon={<ReceiptIndianRupee className="h-6 w-6" />} title="No invoices match" description="Create invoices from an RFQ's Invoices tab — one job, several, or the whole RFQ." action={<ButtonLink href="/rfqs?status=COMPLETED">Completed RFQs</ButtonLink>} />}
        />
        <Pagination page={lp.page} pageSize={lp.pageSize} total={total} searchParams={sp} />
      </Card>
    </>
  );
}
