"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EntityDrawer } from "@/components/ui/drawer";
import { Checkbox, ErrorSummary, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { INDIAN_STATES } from "@/lib/countries";
import { fmtMoney, toDateInput } from "@/lib/format";
import { createInvoiceAction } from "@/app/actions/invoices";

type Job = { id: string; number: string; type: string; container: string | null };
type Line = { jobOrderId?: string; description: string; sac: string; quantity: string; unitPrice: string; taxRate: string };

/** Multi-job / whole-RFQ invoice with line items and a GST block computed live. */
export function InvoiceCreateButton({
  rfq, jobs,
}: {
  rfq: { id: string; number: string; currency: string; estimatedRate: number; customerGstin: string | null; customerState: string | null };
  jobs: Job[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>(jobs.map((j) => j.id));
  const per = jobs.length ? Math.round(rfq.estimatedRate / jobs.length) : rfq.estimatedRate;
  const mk = (ids: string[]): Line[] =>
    ids.length
      ? ids.map((id) => {
          const j = jobs.find((x) => x.id === id)!;
          return { jobOrderId: id, description: `${j.type} — ${j.number}${j.container ? ` (${j.container})` : ""}`, sac: "998346", quantity: "1", unitPrice: String(per), taxRate: "18" };
        })
      : [{ description: `Survey services — ${rfq.number}`, sac: "998346", quantity: "1", unitPrice: String(rfq.estimatedRate), taxRate: "18" }];
  const [lines, setLines] = useState<Line[]>(() => mk(jobs.map((j) => j.id)));
  const [due, setDue] = useState(toDateInput(new Date(Date.now() + 15 * 86400_000)));
  const [pos, setPos] = useState(rfq.customerState ?? "");
  const [gstin, setGstin] = useState(rfq.customerGstin ?? "");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const inr = rfq.currency === "INR";

  const totals = useMemo(() => {
    const sub = lines.reduce((s, l) => s + Number(l.quantity || 0) * Number(l.unitPrice || 0), 0);
    const tax = inr ? lines.reduce((s, l) => s + (Number(l.quantity || 0) * Number(l.unitPrice || 0) * Number(l.taxRate || 0)) / 100, 0) : 0;
    return { sub, tax, total: sub + tax };
  }, [lines, inr]);

  const submit = async () => {
    setBusy(true);
    const r = await createInvoiceAction({ rfqId: rfq.id, dueDate: due, customerGstin: gstin || undefined, placeOfSupply: pos || undefined, notes: notes || undefined, lines });
    setBusy(false);
    if (!r.ok) {
      setErrors(r.fieldErrors && Object.keys(r.fieldErrors).length ? r.fieldErrors : { _form: r.error });
      return;
    }
    toast.success(`Invoice ${r.data.number} created as draft`);
    setOpen(false);
    router.push(`/invoices/${r.data.id}`);
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" aria-hidden /> Create invoice</Button>
      <EntityDrawer open={open} onClose={() => setOpen(false)} size="lg" title={`New invoice — ${rfq.number}`} description={`Currency follows the RFQ: ${rfq.currency}${inr ? "" : " (export of services — zero-rated GST)"}`} onSubmit={submit} submitting={busy} submitLabel="Create draft invoice" dirty>
        <div className="space-y-5">
          <ErrorSummary errors={errors} />
          {jobs.length > 0 && (
            <fieldset>
              <legend className="mb-2 text-[13px] font-medium">Job orders on this invoice</legend>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {jobs.map((j) => (
                  <Checkbox
                    key={j.id}
                    label={`${j.number} · ${j.type}`}
                    checked={picked.includes(j.id)}
                    onChange={(e) => {
                      const next = e.target.checked ? [...picked, j.id] : picked.filter((x) => x !== j.id);
                      setPicked(next);
                      setLines(mk(jobs.filter((x) => next.includes(x.id)).map((x) => x.id)));
                    }}
                  />
                ))}
              </div>
            </fieldset>
          )}
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_90px_70px_110px_70px_auto] sm:items-end">
                <Field label="Description" error={errors[`lines.${i}.description`]}>{(p) => <Input id={p.id} value={l.description} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />}</Field>
                <Field label="SAC" error={errors[`lines.${i}.sac`]}>{(p) => <Input id={p.id} value={l.sac} inputMode="numeric" onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, sac: e.target.value } : x)))} />}</Field>
                <Field label="Qty">{(p) => <Input id={p.id} type="number" min={0} value={l.quantity} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, quantity: e.target.value } : x)))} />}</Field>
                <Field label={`Unit (${rfq.currency})`}>{(p) => <Input id={p.id} type="number" min={0} value={l.unitPrice} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, unitPrice: e.target.value } : x)))} />}</Field>
                <Field label="GST %">
                  {(p) => (
                    <Select id={p.id} value={inr ? l.taxRate : "0"} disabled={!inr} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, taxRate: e.target.value } : x)))}>
                      {["0", "5", "12", "18", "28"].map((t) => <option key={t} value={t}>{t}</option>)}
                    </Select>
                  )}
                </Field>
                <Button variant="ghost" size="icon" aria-label={`Remove line ${i + 1}`} onClick={() => setLines(lines.filter((_, j) => j !== i))} disabled={lines.length === 1}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={() => setLines([...lines, { description: "", sac: "998346", quantity: "1", unitPrice: "0", taxRate: "18" }])}><Plus className="h-4 w-4" aria-hidden /> Add line</Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Due date" required error={errors.dueDate}>{(p) => <Input id={p.id} type="date" value={due} onChange={(e) => setDue(e.target.value)} />}</Field>
            <Field label="Place of supply" help="Same state as yours → CGST+SGST, else IGST">
              {(p) => (
                <Select id={p.id} aria-describedby={p.describedBy} value={pos} onChange={(e) => setPos(e.target.value)} placeholder="Outside India / not applicable" disabled={!inr}>
                  {INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Customer GSTIN" error={errors.customerGstin}>{(p) => <Input id={p.id} value={gstin} maxLength={15} onChange={(e) => setGstin(e.target.value.toUpperCase())} />}</Field>
          </div>
          <Field label="Notes">{(p) => <Textarea id={p.id} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
          <Alert tone="info" title={`Total ${fmtMoney(totals.total, rfq.currency)}`}>
            Subtotal {fmtMoney(totals.sub, rfq.currency)} · GST {fmtMoney(totals.tax, rfq.currency)} — the CGST/SGST vs IGST split is decided from the place of supply when you save.
          </Alert>
        </div>
      </EntityDrawer>
    </>
  );
}
