import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardHeader, PageHeader, StatusPill } from "@/components/ui/misc";
import { Timeline } from "@/components/app/timeline";
import { countryName } from "@/lib/countries";
import { customerName, fmtDate, fmtMoney } from "@/lib/format";
import { humanize } from "@/lib/constants";
import { InvoiceActions } from "./client";

export const metadata = { title: "Invoice" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(["VENDOR_ADMIN", "VENDOR_STAFF"]);
  const { id } = await params;
  const inv = await db.invoice.findFirst({ where: { id, orgId: u.orgId }, include: { org: true, customer: true, rfq: true, lines: true, payments: { orderBy: { paidAt: "asc" } } } });
  if (!inv) notFound();
  const events = await db.auditLog.findMany({ where: { entityId: inv.id }, orderBy: { createdAt: "desc" } });
  const m = (n: number) => fmtMoney(n, inv.currency);
  const balance = inv.total - inv.amountPaid;

  return (
    <>
      <div className="no-print">
        <PageHeader
          breadcrumb={<><Link href="/invoices" className="hover:underline">Invoices</Link> / <Link href={`/rfqs/${inv.rfqId}?tab=invoices`} className="hover:underline">{inv.rfq.number}</Link></>}
          title={<span className="flex items-center gap-3">{inv.number} <StatusPill status={inv.status} /></span>}
          description={`Balance ${m(balance)} · due ${fmtDate(inv.dueDate)}`}
          actions={<InvoiceActions invoice={{ id: inv.id, status: inv.status, balance, currency: inv.currency }} />}
        />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <article className="print-page rounded-xl border border-border bg-white p-6 text-[#0f172a] shadow-card sm:p-10">
          <header className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-[#0b2545] pb-5">
            <div>
              <p className="text-xl font-bold text-[#0b2545]">{inv.org.name}</p>
              <p className="text-xs text-[#475569]">{[inv.org.address, inv.org.city, inv.org.state].filter(Boolean).join(", ")}</p>
              {inv.supplierGstin && <p className="text-xs text-[#475569]">GSTIN {inv.supplierGstin}</p>}
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold">{inv.status === "DRAFT" ? "Proforma Invoice (Draft)" : "Tax Invoice"}</p>
              <p className="text-sm">{inv.number}</p>
              <p className="text-xs text-[#475569]">Issued {fmtDate(inv.issueDate)} · Due {fmtDate(inv.dueDate)}</p>
            </div>
          </header>
          <section className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">Bill to</p>
              <p className="font-semibold">{customerName(inv.customer)}</p>
              <p className="text-[#475569]">{[inv.customer.address1, inv.customer.address2, inv.customer.city, inv.customer.state, countryName(inv.customer.country)].filter(Boolean).join(", ")}</p>
              {inv.customerGstin && <p className="text-[#475569]">GSTIN {inv.customerGstin}</p>}
            </div>
            <div className="sm:text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">Reference</p>
              <p>RFQ {inv.rfq.number}</p>
              <p className="text-[#475569]">Place of supply: {inv.placeOfSupply ?? "Outside India"}</p>
              <p className="text-[#475569]">Currency: {inv.currency}</p>
            </div>
          </section>
          <table className="mt-6 w-full border-collapse text-sm">
            <caption className="sr-only">Invoice lines</caption>
            <thead>
              <tr className="bg-[#f1f5f9] text-left text-xs uppercase tracking-wide text-[#475569]">
                <th scope="col" className="px-3 py-2">#</th><th scope="col" className="px-3 py-2">Description</th><th scope="col" className="px-3 py-2">SAC</th><th scope="col" className="px-3 py-2 text-right">Qty</th><th scope="col" className="px-3 py-2 text-right">Rate</th><th scope="col" className="px-3 py-2 text-right">GST %</th><th scope="col" className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {inv.lines.map((l, i) => (
                <tr key={l.id} className="border-b border-[#e2e8f0]">
                  <td className="px-3 py-2">{i + 1}</td><td className="px-3 py-2">{l.description}</td><td className="px-3 py-2">{l.sac}</td><td className="px-3 py-2 text-right">{l.quantity}</td><td className="px-3 py-2 text-right tabular-nums">{m(l.unitPrice)}</td><td className="px-3 py-2 text-right">{l.taxRate}</td><td className="px-3 py-2 text-right tabular-nums">{m(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="ml-auto mt-4 w-full max-w-xs space-y-1 text-sm">
            <div className="flex justify-between"><dt>Subtotal</dt><dd className="tabular-nums">{m(inv.subtotal)}</dd></div>
            {inv.taxMode === "CGST_SGST" && (<><div className="flex justify-between"><dt>CGST</dt><dd className="tabular-nums">{m(inv.cgst)}</dd></div><div className="flex justify-between"><dt>SGST</dt><dd className="tabular-nums">{m(inv.sgst)}</dd></div></>)}
            {inv.taxMode === "IGST" && <div className="flex justify-between"><dt>IGST</dt><dd className="tabular-nums">{m(inv.igst)}</dd></div>}
            {inv.taxMode === "NONE" && <div className="flex justify-between text-[#475569]"><dt>GST</dt><dd>Zero-rated export (LUT)</dd></div>}
            <div className="flex justify-between border-t border-[#0b2545] pt-1 text-base font-bold"><dt>Total</dt><dd className="tabular-nums">{m(inv.total)}</dd></div>
            {inv.amountPaid > 0 && <div className="flex justify-between text-[#14622c]"><dt>Paid</dt><dd className="tabular-nums">−{m(inv.amountPaid)}</dd></div>}
            <div className="flex justify-between font-semibold"><dt>Balance due</dt><dd className="tabular-nums">{m(balance)}</dd></div>
          </dl>
          {inv.notes && <p className="mt-6 text-sm text-[#475569]">{inv.notes}</p>}
          <p className="mt-8 border-t border-[#e2e8f0] pt-3 text-xs text-[#64748b]">Payment terms: {inv.rfq.paymentTerms.split("\n")[0]}</p>
        </article>
        <aside className="no-print space-y-6">
          <Card>
            <CardHeader title="Payments" />
            {inv.payments.length === 0 ? <p className="px-5 py-5 text-sm text-muted">No payments recorded.</p> : (
              <ul className="divide-y divide-border">
                {inv.payments.map((p) => (
                  <li key={p.id} className="px-5 py-2.5 text-sm">
                    <span className="font-semibold tabular-nums">{m(p.amount)}</span> <span className="text-muted">· {humanize(p.mode)} · {fmtDate(p.paidAt)}</span>
                    <span className="block text-xs text-subtle">Ref {p.reference}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardHeader title="Activity" />
            <div className="p-5"><Timeline events={events} /></div>
          </Card>
        </aside>
      </div>
    </>
  );
}
