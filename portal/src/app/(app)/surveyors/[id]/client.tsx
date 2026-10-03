"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { EntityDrawer } from "@/components/ui/drawer";
import { ErrorSummary, Field, Input, Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { KYC_DOC_TYPES, UPLOAD_LIMITS, humanize } from "@/lib/constants";
import { toDateInput } from "@/lib/format";
import { addKycAction, addRateAction, deleteRateAction, reviewKycAction, setSurveyorActiveAction } from "@/app/actions/surveyors";

export function ActiveToggle({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  return (
    <ConfirmButton
      label={active ? "Deactivate" : "Reactivate"}
      title={active ? "Deactivate this surveyor?" : "Reactivate this surveyor?"}
      description={active ? "They won't be offered new jobs and their app login is disabled. History is kept." : undefined}
      confirmVariant={active ? "danger" : "primary"}
      confirmLabel={active ? "Deactivate" : "Reactivate"}
      action={async () => { const r = await setSurveyorActiveAction(id, !active); if (!r.ok) return r.error; router.refresh(); }}
    />
  );
}

export function RateForm({ surveyorId, types }: { surveyorId: string; types: { id: string; name: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ surveyTypeId: "", location: "", amount: "", effectiveFrom: toDateInput(new Date()) });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Plus className="h-4 w-4" aria-hidden /> Add rate</Button>
      <EntityDrawer open={open} onClose={() => setOpen(false)} variant="modal" size="sm" title="Add rate" dirty submitLabel="Add rate" submitting={busy}
        onSubmit={async () => {
          setBusy(true);
          const r = await addRateAction(surveyorId, v);
          setBusy(false);
          if (!r.ok) return setErrors(r.fieldErrors ?? { _form: r.error });
          toast.success("Rate added");
          setOpen(false);
          router.refresh();
        }}
      >
        <div className="space-y-4">
          <ErrorSummary errors={errors} />
          <Field label="Survey type" required error={errors.surveyTypeId}>
            {(p) => <Select id={p.id} invalid={p.invalid} value={v.surveyTypeId} onChange={(e) => setV({ ...v, surveyTypeId: e.target.value })} placeholder="Select">{types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>}
          </Field>
          <Field label="Location" required error={errors.location}>{(p) => <Input id={p.id} invalid={p.invalid} value={v.location} onChange={(e) => setV({ ...v, location: e.target.value })} />}</Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (₹)" required error={errors.amount}>{(p) => <Input id={p.id} invalid={p.invalid} type="number" min={0} value={v.amount} onChange={(e) => setV({ ...v, amount: e.target.value })} />}</Field>
            <Field label="Effective from" required error={errors.effectiveFrom}>{(p) => <Input id={p.id} type="date" value={v.effectiveFrom} onChange={(e) => setV({ ...v, effectiveFrom: e.target.value })} />}</Field>
          </div>
        </div>
      </EntityDrawer>
    </>
  );
}

export function RateDelete({ surveyorId, rateId }: { surveyorId: string; rateId: string }) {
  const router = useRouter();
  return (
    <ConfirmButton variant="ghost" size="sm" label={<Trash2 className="h-4 w-4" aria-label="Delete rate" />} title="Delete this rate?" confirmVariant="danger" confirmLabel="Delete"
      action={async () => { const r = await deleteRateAction(surveyorId, rateId); if (!r.ok) return r.error; router.refresh(); }} />
  );
}

export function KycForm({ surveyorId }: { surveyorId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Plus className="h-4 w-4" aria-hidden /> Add</Button>
      <EntityDrawer open={open} onClose={() => setOpen(false)} variant="modal" size="sm" title="Add KYC document" formId="kyc-form" submitLabel="Upload" submitting={busy}>
        <form
          id="kyc-form"
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const r = await addKycAction(surveyorId, new FormData(e.currentTarget));
            setBusy(false);
            if (!r.ok) return setErrors(r.fieldErrors ?? { _form: r.error });
            toast.success("Document added — pending verification");
            setOpen(false);
            router.refresh();
          }}
        >
          <ErrorSummary errors={errors} />
          <Field label="Document type" required>{(p) => <Select id={p.id} name="docType">{KYC_DOC_TYPES.map((d) => <option key={d} value={d}>{humanize(d)}</option>)}</Select>}</Field>
          <Field label="Document number" required error={errors.docNumber}>{(p) => <Input id={p.id} name="docNumber" invalid={p.invalid} />}</Field>
          <Field label="Expiry date">{(p) => <Input id={p.id} name="expiresAt" type="date" />}</Field>
          <Field label="File" help={UPLOAD_LIMITS.document.label} error={errors.file}>{(p) => <Input id={p.id} aria-describedby={p.describedBy} name="file" type="file" accept={UPLOAD_LIMITS.document.mime.join(",")} className="py-1.5" />}</Field>
        </form>
      </EntityDrawer>
    </>
  );
}

export function KycReview({ surveyorId, docId }: { surveyorId: string; docId: string }) {
  const router = useRouter();
  const go = async (s: "VERIFIED" | "REJECTED") => { await reviewKycAction(surveyorId, docId, s); router.refresh(); };
  return (
    <>
      <button className="text-xs font-medium text-success hover:underline" onClick={() => go("VERIFIED")}>Verify</button>
      <button className="text-xs font-medium text-danger hover:underline" onClick={() => go("REJECTED")}>Reject</button>
    </>
  );
}
