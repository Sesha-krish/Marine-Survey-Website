"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Pencil, Plus, UserCheck, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { EntityDrawer } from "@/components/ui/drawer";
import { ErrorSummary, Field, Input, RadioGroup, RequiredLegend } from "@/components/ui/form";
import { PhoneInput } from "@/components/ui/phone-input";
import { Alert } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { ASSIGNABLE_ROLES, ROLE_LABEL } from "@/lib/constants";
import { resetPasswordAction, saveUserAction, setUserActiveAction } from "@/app/actions/users";

type U = { id?: string; role: string; firstName: string; middleName: string; lastName: string; email: string; phone: string; active?: boolean };

export function UserFormButton({ user, iconOnly }: { user?: U; iconOnly?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<U>(user ?? { role: "VENDOR_STAFF", firstName: "", middleName: "", lastName: "", email: "", phone: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [temp, setTemp] = useState<string | null>(null);
  return (
    <>
      {iconOnly ? (
        <Button variant="ghost" size="sm" aria-label="Edit user" title="Edit" onClick={() => setOpen(true)}><Pencil className="h-4 w-4" /></Button>
      ) : (
        <Button onClick={() => { setTemp(null); setOpen(true); }}><Plus className="h-4 w-4" aria-hidden /> Add user</Button>
      )}
      <EntityDrawer open={open} onClose={() => setOpen(false)} title={user ? "Edit user" : "Add user"} dirty={!temp} submitting={busy} submitLabel={user ? "Save" : "Create user"}
        footer={temp ? <div className="flex justify-end"><Button onClick={() => setOpen(false)}>Done</Button></div> : undefined}
        onSubmit={async () => {
          setBusy(true);
          const payload = { role: v.role, firstName: v.firstName, middleName: v.middleName, lastName: v.lastName, email: v.email, phone: v.phone };
          const r = await saveUserAction(user?.id ?? null, payload);
          setBusy(false);
          if (!r.ok) return setErrors(r.fieldErrors && Object.keys(r.fieldErrors).length ? r.fieldErrors : { _form: r.error });
          toast.success(user ? "User updated" : "User created");
          router.refresh();
          if (r.data.tempPassword) setTemp(r.data.tempPassword);
          else setOpen(false);
        }}
      >
        {temp ? (
          <Alert tone="success" title="User created">
            Share this one-time password securely with {v.firstName}. It won&apos;t be shown again.
            <code className="mt-2 block rounded bg-surface px-3 py-2 font-mono text-base text-text">{temp}</code>
          </Alert>
        ) : (
          <div className="space-y-5">
            <RequiredLegend />
            <ErrorSummary errors={errors} />
            <Field label="Role" required help="Surveyors get the mobile Surveyor app and a surveyor profile.">
              {(p) => <div aria-describedby={p.describedBy}><RadioGroup name="role" options={ASSIGNABLE_ROLES} labels={ROLE_LABEL} value={v.role} onChange={(x) => setV({ ...v, role: x })} /></div>}
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="First name" required error={errors.firstName}>{(p) => <Input id={p.id} invalid={p.invalid} value={v.firstName} onChange={(e) => setV({ ...v, firstName: e.target.value })} />}</Field>
              <Field label="Middle name">{(p) => <Input id={p.id} value={v.middleName} onChange={(e) => setV({ ...v, middleName: e.target.value })} />}</Field>
              <Field label="Last name">{(p) => <Input id={p.id} value={v.lastName} onChange={(e) => setV({ ...v, lastName: e.target.value })} />}</Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email" required error={errors.email}>{(p) => <Input id={p.id} invalid={p.invalid} type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />}</Field>
              <Field label="Mobile" required error={errors.phone}>{(p) => <PhoneInput id={p.id} invalid={p.invalid} value={v.phone} onChange={(x) => setV({ ...v, phone: x })} />}</Field>
            </div>
          </div>
        )}
      </EntityDrawer>
    </>
  );
}

export function UserRowActions({ user, self }: { user: U & { id: string; active: boolean }; self: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [pw, setPw] = useState<string | null>(null);
  return (
    <>
      <UserFormButton user={user} iconOnly />
      {!self && (
        <>
          <ConfirmButton variant="ghost" size="sm" label={<KeyRound className="h-4 w-4" aria-label="Reset password" />} title={`Reset ${user.firstName}'s password?`} description="They'll be signed out everywhere and need the new one-time password." confirmLabel="Reset password"
            action={async () => { const r = await resetPasswordAction(user.id); if (!r.ok) return r.error; setPw(r.data); }} />
          <ConfirmButton variant="ghost" size="sm" label={user.active ? <UserX className="h-4 w-4" aria-label="Deactivate user" /> : <UserCheck className="h-4 w-4" aria-label="Reactivate user" />} title={user.active ? `Deactivate ${user.firstName}?` : `Reactivate ${user.firstName}?`} description={user.active ? "They're signed out immediately. Their history is kept." : undefined} confirmVariant={user.active ? "danger" : "primary"} confirmLabel={user.active ? "Deactivate" : "Reactivate"}
            action={async () => { const r = await setUserActiveAction(user.id, !user.active); if (!r.ok) return r.error; toast.success(user.active ? "User deactivated" : "User reactivated"); router.refresh(); }} />
        </>
      )}
      {pw && (
        <EntityDrawer open onClose={() => setPw(null)} variant="modal" size="sm" title="New one-time password" footer={<div className="flex justify-end"><Button onClick={() => setPw(null)}>Done</Button></div>}>
          <code className="block rounded bg-surface-2 px-3 py-2 font-mono text-base">{pw}</code>
        </EntityDrawer>
      )}
    </>
  );
}
