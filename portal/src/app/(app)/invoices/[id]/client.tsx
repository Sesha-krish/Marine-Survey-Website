"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, IndianRupee, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { EntityDrawer } from "@/components/ui/drawer";
import { ErrorSummary, Field, Input, Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { PAYMENT_MODES, humanize } from "@/lib/constants";
import { toDateInput } from "@/lib/format";
import { cancelInvoiceAction, recordPaymentAction, sendInvoiceAction } from "@/app/actions/invoices";

export function InvoiceActions({ invoice }: { invoice: { id: string; status: string; balance: number; currency: string } }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ amount: String(Math.round(invoice.balance * 100) / 100), mode: "BANK_TRANSFER", reference: "", paidAt: toDateInput(new Date()) });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const payable = ["SENT", "PARTIALLY_PAID", "OVERDUE"].includes(invoice.status);

  return (
    <>
      <Button variant="outline" onClick={() => window.print()}><Download className="h-4 w-4" aria-hidden /> Download PDF</Button>
      {invoice.status === "DRAFT" && (
        <ConfirmButton variant="primary" icon={<Send className="h-4 w-4" aria-hidden />} label="Mark as sent" title="Mark this invoice as sent?" description="The draft becomes a tax invoice and starts aging from its due date." confirmLabel="Mark as sent"
          action={async () => { const r = await sendInvoiceAction(invoice.id); if (!r.ok) return r.error; toast.success("Invoice sent"); router.refresh(); }} />
      )}
      {payable && <Button onClick={() => setOpen(true)}><IndianRupee className="h-4 w-4" aria-hidden /> Record payment</Button>}
      {["DRAFT", "SENT", "OVERDUE"].includes(invoice.status) && (
        <ConfirmButton label="Cancel" title="Cancel this invoice?" reason confirmVariant="danger" confirmLabel="Cancel invoice"
          action={async (reason) => { const r = await cancelInvoiceAction(invoice.id, reason); if (!r.ok) return r.error; toast.success("Invoice cancelled"); router.refresh(); }} />
      )}
      <EntityDrawer open={open} onClose={() => setOpen(false)} variant="modal" size="sm" title="Record payment" description="Status updates automatically from recorded payments." dirty submitLabel="Record payment" submitting={busy}
        onSubmit={async () => {
          setBusy(true);
          const r = await recordPaymentAction(invoice.id, v);
          setBusy(false);
          if (!r.ok) return setErrors(r.fieldErrors && Object.keys(r.fieldErrors).length ? r.fieldErrors : { _form: r.error });
          toast.success("Payment recorded");
          setOpen(false);
          router.refresh();
        }}
      >
        <div className="space-y-4">
          <ErrorSummary errors={errors} />
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Amount (${invoice.currency})`} required error={errors.amount}>{(p) => <Input id={p.id} invalid={p.invalid} type="number" min={0} step="0.01" value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} />}</Field>
            <Field label="Paid on" required error={errors.paidAt}>{(p) => <Input id={p.id} type="date" max={toDateInput(new Date())} value={v.paidAt} onChange={(e) => setV({ ...v, paidAt: e.target.value })} />}</Field>
          </div>
          <Field label="Mode" required>{(p) => <Select id={p.id} value={v.mode} onChange={(e) => setV({ ...v, mode: e.target.value })}>{PAYMENT_MODES.map((m) => <option key={m} value={m}>{humanize(m)}</option>)}</Select>}</Field>
          <Field label="Reference / UTR" required error={errors.reference}>{(p) => <Input id={p.id} invalid={p.invalid} value={v.reference} onChange={(e) => setV({ ...v, reference: e.target.value })} />}</Field>
        </div>
      </EntityDrawer>
    </>
  );
}
