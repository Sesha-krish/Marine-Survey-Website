import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { nextId } from "@/lib/ids";
import { flattenErrors, invoiceSchema, paymentSchema } from "@/lib/schemas";
import type { Actor } from "./workflow";
import { postCredits } from "./credits";
import { DomainError, NotFound } from "./errors";

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * GST: services from an Indian supplier. Same state as place of supply → CGST + SGST (half each);
 * different state → IGST; foreign currency (export of services under LUT) → zero-rated.
 */
export function computeTax(lines: { quantity: number; unitPrice: number; taxRate: number }[], supplierState: string | null, placeOfSupply: string | null, currency: string) {
  const subtotal = round2(lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0));
  const tax = round2(lines.reduce((s, l) => s + (l.quantity * l.unitPrice * l.taxRate) / 100, 0));
  if (currency !== "INR") return { taxMode: "NONE", subtotal, cgst: 0, sgst: 0, igst: 0, total: subtotal };
  const intra = !!supplierState && !!placeOfSupply && supplierState.toLowerCase() === placeOfSupply.toLowerCase();
  if (intra) {
    const half = round2(tax / 2);
    return { taxMode: "CGST_SGST", subtotal, cgst: half, sgst: round2(tax - half), igst: 0, total: round2(subtotal + tax) };
  }
  return { taxMode: "IGST", subtotal, cgst: 0, sgst: 0, igst: tax, total: round2(subtotal + tax) };
}

/** Multi-job / whole-RFQ invoice with line items. Currency is inherited from the RFQ. */
export async function createInvoice(actor: Actor, raw: unknown) {
  const p = invoiceSchema.safeParse(raw);
  if (!p.success) throw new DomainError("Please fix the highlighted fields", flattenErrors(p.error));
  const v = p.data;
  return db.$transaction(async (tx) => {
    const rfq = await tx.rfq.findFirst({ where: { id: v.rfqId, orgId: actor.orgId }, include: { org: true, customer: true } });
    if (!rfq) throw new NotFound("RFQ");
    if (["NEW", "DECLINED", "CANCELLED"].includes(rfq.status)) throw new DomainError("Invoices can only be raised on accepted RFQs");
    const jobIds = v.lines.map((l) => l.jobOrderId).filter(Boolean) as string[];
    if (jobIds.length) {
      const n = await tx.jobOrder.count({ where: { id: { in: jobIds }, rfqId: rfq.id } });
      if (n !== new Set(jobIds).size) throw new DomainError("A line references a job order from another RFQ");
    }
    const placeOfSupply = v.placeOfSupply ?? (rfq.customer.country === "IN" ? rfq.customer.state : null);
    const t = computeTax(v.lines, rfq.org.state, placeOfSupply, rfq.currency);
    const inv = await tx.invoice.create({
      data: {
        number: await nextId(tx, "INV"),
        orgId: actor.orgId,
        rfqId: rfq.id,
        customerId: rfq.customerId,
        dueDate: new Date(`${v.dueDate}T23:59:59+05:30`),
        currency: rfq.currency,
        supplierGstin: rfq.org.gstin,
        customerGstin: v.customerGstin ?? rfq.customer.taxId,
        placeOfSupply,
        ...t,
        notes: v.notes,
        createdById: actor.id,
        lines: {
          create: v.lines.map((l) => ({
            jobOrderId: l.jobOrderId || null, description: l.description, sac: l.sac, quantity: l.quantity, unitPrice: l.unitPrice,
            taxRate: rfq.currency === "INR" ? l.taxRate : 0, amount: round2(l.quantity * l.unitPrice),
          })),
        },
      },
    });
    await audit(tx, actor, { entityType: "INVOICE", entityId: inv.id, rfqId: rfq.id, action: "INVOICE_CREATED", toStatus: "DRAFT", note: `${inv.number} · ${rfq.currency} ${inv.total}` });
    return inv;
  });
}

export async function markInvoiceSent(actor: Actor, invoiceId: string) {
  return db.$transaction(async (tx) => {
    const inv = await tx.invoice.findFirst({ where: { id: invoiceId, orgId: actor.orgId } });
    if (!inv) throw new NotFound("Invoice");
    if (inv.status !== "DRAFT") throw new DomainError("Only draft invoices can be sent");
    await tx.invoice.update({ where: { id: inv.id }, data: { status: "SENT", sentAt: new Date() } });
    await audit(tx, actor, { entityType: "INVOICE", entityId: inv.id, rfqId: inv.rfqId, action: "INVOICE_SENT", fromStatus: "DRAFT", toStatus: "SENT" });
  });
}

/** Payment status is DERIVED from recorded payments — never set by hand. */
export async function recordPayment(actor: Actor, invoiceId: string, raw: unknown) {
  const p = paymentSchema.safeParse(raw);
  if (!p.success) throw new DomainError("Please fix the highlighted fields", flattenErrors(p.error));
  return db.$transaction(async (tx) => {
    const inv = await tx.invoice.findFirst({ where: { id: invoiceId, orgId: actor.orgId } });
    if (!inv) throw new NotFound("Invoice");
    if (["CANCELLED", "PAID"].includes(inv.status)) throw new DomainError(`Invoice is ${inv.status.toLowerCase()}`);
    const outstanding = round2(inv.total - inv.amountPaid);
    if (p.data.amount > outstanding + 0.001) throw new DomainError(`Amount exceeds the outstanding ${outstanding}`, { amount: `Max ${outstanding}` });
    await tx.payment.create({ data: { invoiceId: inv.id, amount: p.data.amount, mode: p.data.mode, reference: p.data.reference, paidAt: new Date(`${p.data.paidAt}T12:00:00+05:30`), recordedById: actor.id } });
    const paid = round2(inv.amountPaid + p.data.amount);
    const status = paid >= inv.total - 0.001 ? "PAID" : "PARTIALLY_PAID";
    await tx.invoice.update({ where: { id: inv.id }, data: { amountPaid: paid, status } });
    await audit(tx, actor, { entityType: "INVOICE", entityId: inv.id, rfqId: inv.rfqId, action: "PAYMENT_RECORDED", fromStatus: inv.status, toStatus: status, note: `${inv.currency} ${p.data.amount} via ${p.data.mode} (${p.data.reference})` });
  });
}

export async function cancelInvoice(actor: Actor, invoiceId: string, reason: string) {
  return db.$transaction(async (tx) => {
    const inv = await tx.invoice.findFirst({ where: { id: invoiceId, orgId: actor.orgId } });
    if (!inv) throw new NotFound("Invoice");
    if (inv.amountPaid > 0) throw new DomainError("Invoices with recorded payments can't be cancelled — issue a credit note");
    await tx.invoice.update({ where: { id: inv.id }, data: { status: "CANCELLED" } });
    await audit(tx, actor, { entityType: "INVOICE", entityId: inv.id, rfqId: inv.rfqId, action: "INVOICE_CANCELLED", fromStatus: inv.status, toStatus: "CANCELLED", note: reason });
  });
}

/** Overdue is a function of time; keep stored status in sync whenever lists are read. */
export async function refreshOverdue(orgId: string) {
  await db.invoice.updateMany({ where: { orgId, status: { in: ["SENT", "PARTIALLY_PAID"] }, dueDate: { lt: new Date() } }, data: { status: "OVERDUE" } });
}

/**
 * Package checkout. PAYMENT GATEWAY IS SIMULATED: in production, create a Razorpay/Stripe order
 * here, return its id to the client, and only post credits from the verified webhook.
 */
export async function purchasePackage(actor: Actor, packageId: string) {
  return db.$transaction(async (tx) => {
    const pkg = await tx.package.findFirst({ where: { id: packageId, active: true } });
    if (!pkg) throw new NotFound("Package");
    if (!(pkg.price > 0)) throw new DomainError("This package has no price configured — contact support"); // never sell a ₹0 plan
    const pur = await tx.purchase.create({
      data: {
        number: await nextId(tx, "PUR"), orgId: actor.orgId, packageId: pkg.id, price: pkg.price, credits: pkg.credits,
        expiresAt: new Date(Date.now() + pkg.validityDays * 86400_000), status: "ACTIVE", paymentRef: `SIM-${Date.now()}`, createdById: actor.id,
      },
    });
    await postCredits(tx, actor.orgId, pkg.credits, "PURCHASE", { type: "PURCHASE", id: pur.id, actor });
    await audit(tx, actor, { entityType: "PURCHASE", entityId: pur.id, action: "CREDITS_PURCHASED", note: `${pkg.name}: ${pkg.credits} credits for ${pkg.currency} ${pkg.price}` });
    return pur;
  });
}
