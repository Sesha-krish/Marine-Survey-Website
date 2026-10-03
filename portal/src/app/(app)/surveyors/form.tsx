"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EntityDrawer } from "@/components/ui/drawer";
import { Checkbox, ErrorSummary, Field, Input, RadioGroup, RequiredLegend, Select, Textarea } from "@/components/ui/form";
import { PhoneInput } from "@/components/ui/phone-input";
import { Alert } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { SURVEYOR_AVAILABILITY, humanize } from "@/lib/constants";
import { saveSurveyorAction } from "@/app/actions/surveyors";

type Values = { kind: string; name: string; email: string; phone: string; availability: string; baseLocation: string; coverage: string; notes: string; capabilities: string[]; createLogin: boolean };
const EMPTY: Values = { kind: "IN_HOUSE", name: "", email: "", phone: "", availability: "AVAILABLE", baseLocation: "", coverage: "", notes: "", capabilities: [], createLogin: true };

export function SurveyorFormButton({ types, id, initial, hasLogin }: { types: { id: string; name: string }[]; id?: string; initial?: Partial<Values>; hasLogin?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<Values>({ ...EMPTY, ...(initial ?? {}), createLogin: id ? false : true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [temp, setTemp] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    const r = await saveSurveyorAction(id ?? null, v);
    setBusy(false);
    if (!r.ok) return setErrors(r.fieldErrors && Object.keys(r.fieldErrors).length ? r.fieldErrors : { _form: r.error });
    toast.success(id ? "Surveyor updated" : "Surveyor added");
    router.refresh();
    if (r.data.tempPassword) setTemp(r.data.tempPassword);
    else {
      setOpen(false);
      if (!id) router.push(`/surveyors/${r.data.id}`);
    }
  };

  return (
    <>
      <Button variant={id ? "outline" : "primary"} onClick={() => { setErrors({}); setTemp(null); setOpen(true); }}>
        {id ? <><Pencil className="h-4 w-4" aria-hidden /> Edit</> : <><Plus className="h-4 w-4" aria-hidden /> Add surveyor</>}
      </Button>
      <EntityDrawer
        open={open}
        onClose={() => setOpen(false)}
        title={id ? "Edit surveyor" : "Add surveyor"}
        dirty={!temp}
        onSubmit={temp ? undefined : submit}
        submitting={busy}
        submitLabel={id ? "Save" : "Add surveyor"}
        footer={temp ? <div className="flex justify-end"><Button onClick={() => setOpen(false)}>Done</Button></div> : undefined}
      >
        {temp ? (
          <Alert tone="success" title="Login created">
            Share this one-time password with {v.name} securely. They&apos;ll sign in at <strong>/login</strong> with <strong>{v.email}</strong>:
            <code className="mt-2 block rounded bg-surface px-3 py-2 font-mono text-base text-text">{temp}</code>
            It won&apos;t be shown again.
          </Alert>
        ) : (
          <div className="space-y-5">
            <RequiredLegend />
            <ErrorSummary errors={errors} />
            <Field label="Surveyor type" required>
              {() => <RadioGroup name="kind" options={["IN_HOUSE", "INDEPENDENT"]} labels={{ IN_HOUSE: "In-house (company)", INDEPENDENT: "Independent" }} value={v.kind} onChange={(x) => setV({ ...v, kind: x })} />}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" required error={errors.name}>{(p) => <Input id={p.id} invalid={p.invalid} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />}</Field>
              <Field label="Availability" required>
                {(p) => <Select id={p.id} value={v.availability} onChange={(e) => setV({ ...v, availability: e.target.value })}>{SURVEYOR_AVAILABILITY.map((a) => <option key={a} value={a}>{humanize(a)}</option>)}</Select>}
              </Field>
              <Field label="Email" required error={errors.email}>{(p) => <Input id={p.id} invalid={p.invalid} type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />}</Field>
              <Field label="Mobile" required error={errors.phone}>{(p) => <PhoneInput id={p.id} invalid={p.invalid} value={v.phone} onChange={(x) => setV({ ...v, phone: x })} />}</Field>
              <Field label="Base location">{(p) => <Input id={p.id} value={v.baseLocation} onChange={(e) => setV({ ...v, baseLocation: e.target.value })} placeholder="e.g. Chennai Port" />}</Field>
              <Field label="Coverage" help="Comma-separated ports / cities">{(p) => <Input id={p.id} aria-describedby={p.describedBy} value={v.coverage} onChange={(e) => setV({ ...v, coverage: e.target.value })} placeholder="Ennore, Kattupalli" />}</Field>
            </div>
            <fieldset>
              <legend className="mb-2 text-[13px] font-medium">Qualified survey types</legend>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {types.map((t) => (
                  <Checkbox key={t.id} label={t.name} checked={v.capabilities.includes(t.id)} onChange={(e) => setV({ ...v, capabilities: e.target.checked ? [...v.capabilities, t.id] : v.capabilities.filter((x) => x !== t.id) })} />
                ))}
              </div>
            </fieldset>
            <Field label="Notes">{(p) => <Textarea id={p.id} rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />}</Field>
            {!hasLogin && <Checkbox label="Create a Surveyor app login (they'll get assignments on their phone)" checked={v.createLogin} onChange={(e) => setV({ ...v, createLogin: e.target.checked })} />}
          </div>
        )}
      </EntityDrawer>
    </>
  );
}
