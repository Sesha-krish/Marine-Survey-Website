"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { Field, Input } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { adjustCreditsAction, setOverrideAction, setTenantActiveAction } from "@/app/actions/admin";

export function SuspendTenant({ orgId, active }: { orgId: string; active: boolean }) {
  const router = useRouter();
  return (
    <ConfirmButton label={active ? "Suspend tenant" : "Reactivate tenant"} title={active ? "Suspend this tenant?" : "Reactivate this tenant?"} description={active ? "All users are signed out and blocked. Data is kept." : undefined} confirmVariant={active ? "danger" : "primary"} confirmLabel={active ? "Suspend" : "Reactivate"}
      action={async () => { const r = await setTenantActiveAction(orgId, !active); if (!r.ok) return r.error; router.refresh(); }} />
  );
}

export function CreditAdjust({ orgId }: { orgId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");
  return (
    <div className="grid gap-3 sm:grid-cols-[120px_1fr_auto] sm:items-end">
      <Field label="Credits ±">{(p) => <Input id={p.id} type="number" value={delta} onChange={(e) => setDelta(e.target.value)} />}</Field>
      <Field label="Reason">{(p) => <Input id={p.id} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Goodwill for outage on 12 Sep" />}</Field>
      <Button onClick={async () => { const r = await adjustCreditsAction(orgId, Number(delta), note); if (!r.ok) return toast.error(r.error); setDelta(""); setNote(""); toast.success("Credits adjusted"); router.refresh(); }}>Apply</Button>
    </div>
  );
}

export function OverrideEditor({ orgId, rows }: { orgId: string; rows: { id: string; name: string; base: number; override: number | null }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [vals, setVals] = useState<Record<string, string>>(Object.fromEntries(rows.map((r) => [r.id, r.override?.toString() ?? ""])));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">Rate overrides</caption>
        <thead><tr className="bg-surface-2 text-left text-xs uppercase tracking-wide text-subtle"><th scope="col" className="px-5 py-2">Survey type</th><th scope="col" className="px-5 py-2">Default</th><th scope="col" className="px-5 py-2">Override</th><th scope="col" className="px-5 py-2"><span className="sr-only">Save</span></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-border">
              <td className="px-5 py-2">{r.name}</td>
              <td className="px-5 py-2">{r.base}</td>
              <td className="px-5 py-2"><Input aria-label={`Override for ${r.name}`} type="number" min={0} className="w-24" placeholder="—" value={vals[r.id]} onChange={(e) => setVals({ ...vals, [r.id]: e.target.value })} /></td>
              <td className="px-5 py-2 text-right">
                <Button size="sm" variant="outline" disabled={(r.override?.toString() ?? "") === vals[r.id]} onClick={async () => {
                  const r2 = await setOverrideAction(orgId, r.id, vals[r.id] === "" ? null : Number(vals[r.id]));
                  if (!r2.ok) return toast.error(r2.error);
                  toast.success("Saved");
                  router.refresh();
                }}>Save</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
