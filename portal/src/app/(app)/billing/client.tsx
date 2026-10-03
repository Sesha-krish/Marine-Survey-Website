"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { buyPackageAction, creditSettingsAction } from "@/app/actions/billing";

export function BuyButton({ pkg }: { pkg: { id: string; name: string; price: string; credits: number } }) {
  const router = useRouter();
  const toast = useToast();
  return (
    <div className="mt-5">
      <ConfirmButton
        variant="primary"
        label="Buy now"
        title={`Buy ${pkg.name}?`}
        description={<>You&apos;ll be charged <strong>{pkg.price}</strong> and receive <strong>{pkg.credits} credits</strong>. A GST invoice is emailed to your billing contact.</>}
        confirmLabel={`Pay ${pkg.price}`}
        action={async () => {
          const r = await buyPackageAction(pkg.id);
          if (!r.ok) return r.error;
          toast.success(`${r.data.credits} credits added (${r.data.number})`);
          router.refresh();
        }}
      />
    </div>
  );
}

export function CreditSettings({ canEdit, initial, packages }: { canEdit: boolean; initial: { autoRenew: boolean; autoRenewPkgId: string | null; lowCreditAlert: number }; packages: { id: string; label: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  return (
    <fieldset disabled={!canEdit} className="space-y-3">
      <legend className="text-sm font-semibold">Low balance & auto-renew</legend>
      <div className="grid gap-3 sm:grid-cols-[160px_1fr] sm:items-end">
        <Field label="Alert me at (credits)" error={errors.lowCreditAlert}>{(p) => <Input id={p.id} type="number" min={0} value={v.lowCreditAlert} onChange={(e) => setV({ ...v, lowCreditAlert: Number(e.target.value) })} />}</Field>
        <Field label="Auto-renew package" error={errors.autoRenewPkgId}>
          {(p) => <Select id={p.id} value={v.autoRenewPkgId ?? ""} onChange={(e) => setV({ ...v, autoRenewPkgId: e.target.value || null })} placeholder="Choose a package">{packages.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</Select>}
        </Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Checkbox label="Automatically buy this package when the balance drops to the alert level" checked={v.autoRenew} onChange={(e) => setV({ ...v, autoRenew: e.target.checked })} />
        {canEdit && (
          <Button size="sm" disabled={!dirty} loading={busy} onClick={async () => {
            setBusy(true);
            const r = await creditSettingsAction(v);
            setBusy(false);
            if (!r.ok) return setErrors(r.fieldErrors ?? {});
            setErrors({});
            toast.success("Credit settings saved");
            router.refresh();
          }}>Save</Button>
        )}
      </div>
    </fieldset>
  );
}
