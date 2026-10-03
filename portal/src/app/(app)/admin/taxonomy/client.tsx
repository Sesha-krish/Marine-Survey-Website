"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { EntityDrawer } from "@/components/ui/drawer";
import { Badge } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { addTypeAction, saveScopeAction, setTypeCostAction } from "@/app/actions/admin";

export function TypeRow({ type }: { type: { id: string; name: string; code: string; creditCost: number; active: boolean; scope: string[]; templateVersion: number | null } }) {
  const router = useRouter();
  const toast = useToast();
  const [cost, setCost] = useState(String(type.creditCost));
  const [active, setActive] = useState(type.active);
  const [scope, setScope] = useState(type.scope.join("\n"));
  const [open, setOpen] = useState(false);
  const dirty = cost !== String(type.creditCost) || active !== type.active;
  return (
    <li className="flex flex-wrap items-center gap-3 px-5 py-3">
      <div className="min-w-48 flex-1">
        <p className="text-sm font-medium">{type.name} <span className="font-mono text-xs text-subtle">{type.code}</span></p>
        <p className="text-xs text-muted">{type.scope.length} scope items · {type.templateVersion ? <Link className="text-accent-strong hover:underline" href={`/admin/templates?type=${type.id}`}>template v{type.templateVersion}</Link> : <Badge tone="red">No template — not orderable</Badge>}</p>
      </div>
      <label className="flex items-center gap-2 text-sm">Credits <Input type="number" min={0} className="w-20" value={cost} onChange={(e) => setCost(e.target.value)} aria-label={`Credit cost for ${type.name}`} /></label>
      <Checkbox label="Active" checked={active} onChange={(e) => setActive(e.target.checked)} />
      <Button size="sm" variant="outline" disabled={!dirty} onClick={async () => { const r = await setTypeCostAction(type.id, Number(cost), active); if (!r.ok) return toast.error(r.error); toast.success("Saved"); router.refresh(); }}>Save</Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Scope checklist</Button>
      <EntityDrawer open={open} onClose={() => setOpen(false)} title={`Scope of survey — ${type.name}`} description="One item per line. Vendors tick these on each RFQ line; “Other (please specify)” is always offered." dirty={scope !== type.scope.join("\n")} submitLabel="Save checklist"
        onSubmit={async () => { const r = await saveScopeAction(type.id, scope.split("\n")); if (!r.ok) return toast.error(r.error); toast.success("Checklist saved"); setOpen(false); router.refresh(); }}>
        <Textarea rows={14} value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Scope items" />
      </EntityDrawer>
    </li>
  );
}

export function AddType({ subCategoryId }: { subCategoryId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name: "", code: "", scope: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}><Plus className="h-4 w-4" aria-hidden /> Add type</Button>
      <EntityDrawer open={open} onClose={() => setOpen(false)} title="Add survey type" dirty submitLabel="Add type"
        onSubmit={async () => { const r = await addTypeAction(subCategoryId, v.name, v.code, v.scope.split("\n")); if (!r.ok) return setErrors(r.fieldErrors ?? { name: r.error }); toast.success("Added — publish a template to make it orderable"); setOpen(false); router.refresh(); }}>
        <div className="space-y-4">
          <Field label="Name" required error={errors.name}>{(p) => <Input id={p.id} invalid={p.invalid} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />}</Field>
          <Field label="Code" required error={errors.code} help="2–6 letters, used in IDs and templates">{(p) => <Input id={p.id} aria-describedby={p.describedBy} invalid={p.invalid} value={v.code} onChange={(e) => setV({ ...v, code: e.target.value.toUpperCase() })} />}</Field>
          <Field label="Scope checklist (one per line)" required error={errors.scope}>{(p) => <Textarea id={p.id} invalid={p.invalid} rows={8} value={v.scope} onChange={(e) => setV({ ...v, scope: e.target.value })} />}</Field>
        </div>
      </EntityDrawer>
    </>
  );
}
