"use client";
import { COUNTRIES } from "@/lib/countries";
import { Select } from "./form";

export function CountrySelect(props: React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <Select placeholder="Select country" {...props}>
      {COUNTRIES.map((c) => (
        <option key={c.code} value={c.code}>
          {c.flag} {c.name}
        </option>
      ))}
    </Select>
  );
}
