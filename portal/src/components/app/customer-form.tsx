"use client";
import { useState } from "react";
import { EntityDrawer } from "@/components/ui/drawer";
import { ErrorSummary, Field, Input, RadioGroup, RequiredLegend, Select } from "@/components/ui/form";
import { PhoneInput } from "@/components/ui/phone-input";
import { CountrySelect } from "@/components/ui/country-select";
import { useToast } from "@/components/ui/toast";
import { customerSchema, flattenErrors } from "@/lib/schemas";
import { INDIAN_STATES } from "@/lib/countries";
import { saveCustomer } from "@/app/actions/customers";

export type CustomerValues = {
  customerType: "ENTERPRISE" | "INDIVIDUAL";
  organizationName?: string | null;
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  taxId?: string | null;
  licenseNumber?: string | null;
  email: string;
  phone: string;
  address1: string;
  address2?: string | null;
  country: string;
  state: string;
  city: string;
};

const EMPTY: CustomerValues = { customerType: "ENTERPRISE", email: "", phone: "", address1: "", country: "IN", state: "", city: "" };

/** The ONE customer form (Customers page + RFQ wizard). Inline validation on blur, summary on submit. */
export function CustomerDrawer({
  open, onClose, initial, id, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initial?: Partial<CustomerValues>;
  id?: string | null;
  onSaved?: (c: { id: string; name: string }) => void;
}) {
  const toast = useToast();
  const [v, setV] = useState<CustomerValues>({ ...EMPTY, ...clean(initial) });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<Record<string, string>>({});

  const validate = (next: CustomerValues) => {
    const r = customerSchema.safeParse(next);
    return r.success ? {} : flattenErrors(r.error);
  };
  const set = <K extends keyof CustomerValues>(k: K, val: CustomerValues[K]) => {
    const next = { ...v, [k]: val };
    setV(next);
    setDirty(true);
    // Errors clear as soon as the field is corrected
    if (errors[k as string]) setErrors(validate(next));
  };
  const blur = (k: string) => {
    setTouched((t) => ({ ...t, [k]: true }));
    setErrors(validate(v));
  };
  const err = (k: string) => (touched[k] || Object.keys(summary).length ? errors[k] : undefined);

  const submit = async () => {
    const e = validate(v);
    setErrors(e);
    setSummary(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    const r = await saveCustomer(id ?? null, v);
    setBusy(false);
    if (!r.ok) {
      setErrors(r.fieldErrors ?? {});
      setSummary(r.fieldErrors && Object.keys(r.fieldErrors).length ? r.fieldErrors : { _form: r.error });
      return;
    }
    toast.success(id ? "Customer updated" : `Customer added: ${r.data.name}`);
    setDirty(false);
    onSaved?.(r.data);
    onClose();
  };

  const ent = v.customerType === "ENTERPRISE";
  return (
    <EntityDrawer open={open} onClose={onClose} title={id ? "Edit customer" : "Add customer"} description="Customers are reusable master records — RFQs link to them." dirty={dirty} onSubmit={submit} submitting={busy} submitLabel={id ? "Save changes" : "Add customer"}>
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        noValidate
      >
        <RequiredLegend />
        <ErrorSummary errors={summary} />
        <Field label="Customer type" required>
          {() => <RadioGroup name="customerType" options={["ENTERPRISE", "INDIVIDUAL"]} labels={{ ENTERPRISE: "Enterprise", INDIVIDUAL: "Individual" }} value={v.customerType} onChange={(x) => set("customerType", x as CustomerValues["customerType"])} />}
        </Field>
        {ent ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Organization name" required error={err("organizationName")} className="sm:col-span-2">
              {(p) => <Input id={p.id} aria-describedby={p.describedBy} invalid={p.invalid} value={v.organizationName ?? ""} onChange={(e) => set("organizationName", e.target.value)} onBlur={() => blur("organizationName")} autoComplete="organization" />}
            </Field>
            <Field label="GSTIN / Tax ID" error={err("taxId")}>
              {(p) => <Input id={p.id} invalid={p.invalid} value={v.taxId ?? ""} onChange={(e) => set("taxId", e.target.value.toUpperCase())} onBlur={() => blur("taxId")} />}
            </Field>
            <Field label="License number" error={err("licenseNumber")}>
              {(p) => <Input id={p.id} invalid={p.invalid} value={v.licenseNumber ?? ""} onChange={(e) => set("licenseNumber", e.target.value)} />}
            </Field>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="First name" required error={err("firstName")}>
              {(p) => <Input id={p.id} aria-describedby={p.describedBy} invalid={p.invalid} value={v.firstName ?? ""} onChange={(e) => set("firstName", e.target.value)} onBlur={() => blur("firstName")} autoComplete="given-name" />}
            </Field>
            <Field label="Middle name">
              {(p) => <Input id={p.id} value={v.middleName ?? ""} onChange={(e) => set("middleName", e.target.value)} autoComplete="additional-name" />}
            </Field>
            <Field label="Last name">
              {(p) => <Input id={p.id} value={v.lastName ?? ""} onChange={(e) => set("lastName", e.target.value)} autoComplete="family-name" />}
            </Field>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email" required error={err("email")}>
            {(p) => <Input id={p.id} aria-describedby={p.describedBy} invalid={p.invalid} type="email" value={v.email} onChange={(e) => set("email", e.target.value)} onBlur={() => blur("email")} autoComplete="email" />}
          </Field>
          <Field label="Mobile number" required error={err("phone")}>
            {(p) => <PhoneInput id={p.id} describedBy={p.describedBy} invalid={p.invalid} value={v.phone} onChange={(x) => set("phone", x)} />}
          </Field>
        </div>
        <Field label="Address line 1" required error={err("address1")}>
          {(p) => <Input id={p.id} aria-describedby={p.describedBy} invalid={p.invalid} value={v.address1} onChange={(e) => set("address1", e.target.value)} onBlur={() => blur("address1")} autoComplete="address-line1" />}
        </Field>
        <Field label="Address line 2">
          {(p) => <Input id={p.id} value={v.address2 ?? ""} onChange={(e) => set("address2", e.target.value)} autoComplete="address-line2" />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Country" required error={err("country")}>
            {(p) => <CountrySelect id={p.id} invalid={p.invalid} value={v.country} onChange={(e) => { set("country", e.target.value); set("state", ""); }} />}
          </Field>
          <Field label="State / Province" required error={err("state")}>
            {(p) =>
              v.country === "IN" ? (
                <Select id={p.id} invalid={p.invalid} value={v.state} onChange={(e) => set("state", e.target.value)} onBlur={() => blur("state")} placeholder="Select state">
                  {INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}
                </Select>
              ) : (
                <Input id={p.id} invalid={p.invalid} value={v.state} onChange={(e) => set("state", e.target.value)} onBlur={() => blur("state")} />
              )
            }
          </Field>
          <Field label="City" required error={err("city")}>
            {(p) => <Input id={p.id} invalid={p.invalid} value={v.city} onChange={(e) => set("city", e.target.value)} onBlur={() => blur("city")} autoComplete="address-level2" />}
          </Field>
        </div>
        <button type="submit" hidden />
      </form>
    </EntityDrawer>
  );
}

function clean(i?: Partial<CustomerValues>): Partial<CustomerValues> {
  if (!i) return {};
  return Object.fromEntries(Object.entries(i).filter(([, x]) => x !== null && x !== undefined)) as Partial<CustomerValues>;
}
