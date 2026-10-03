"use client";
import { useMemo, useState } from "react";
import { AsYouType, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";
import { COUNTRIES } from "@/lib/countries";
import { cn } from "@/lib/cn";
import { controlClass } from "./form";

/**
 * Phone picker bound to the SAME canonical country list as address fields.
 * Emits E.164 (+919876543210) when valid, raw text otherwise; the flag never degrades to a globe.
 */
export function PhoneInput({
  value, onChange, id, invalid, describedBy, defaultCountry = "IN", name,
}: {
  value: string;
  onChange: (v: string) => void;
  id?: string;
  invalid?: boolean;
  describedBy?: string;
  defaultCountry?: string;
  name?: string;
}) {
  const parsed = useMemo(() => (value ? parsePhoneNumberFromString(value) : undefined), [value]);
  const [country, setCountry] = useState<string>(parsed?.country ?? defaultCountry);
  const [local, setLocal] = useState<string>(parsed ? parsed.formatNational() : value.replace(/^\+\d+\s?/, ""));
  const dial = COUNTRIES.find((c) => c.code === country)?.dial ?? "";

  const emit = (c: string, text: string) => {
    const p = parsePhoneNumberFromString(text, c as CountryCode);
    onChange(p && p.isValid() ? p.number : text ? `${COUNTRIES.find((x) => x.code === c)?.dial ?? ""}${text.replace(/\D/g, "")}` : "");
  };

  return (
    <div className={cn("flex rounded-lg", invalid && "ring-1 ring-danger")}>
      <select
        aria-label="Country calling code"
        className={controlClass(invalid, "h-9 w-[7.5rem] shrink-0 rounded-r-none border-r-0 pr-6 text-[13px]")}
        value={country}
        onChange={(e) => {
          setCountry(e.target.value);
          emit(e.target.value, local);
        }}
      >
        {COUNTRIES.map((c) => (
          <option key={c.code} value={c.code}>
            {c.flag} {c.code} {c.dial}
          </option>
        ))}
      </select>
      <input
        id={id}
        name={name}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        placeholder={country === "IN" ? "98765 43210" : "Phone number"}
        className={controlClass(invalid, "h-9 rounded-l-none")}
        value={local}
        onChange={(e) => {
          const formatted = new AsYouType(country as CountryCode).input(e.target.value);
          const next = e.target.value.length < local.length ? e.target.value : formatted;
          setLocal(next);
          emit(country, next);
        }}
      />
      <span className="sr-only">Selected calling code {dial}</span>
    </div>
  );
}
