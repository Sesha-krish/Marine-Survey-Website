// ONE canonical ISO 3166 country list, shared by address pickers AND the phone picker.
// Codes come from libphonenumber metadata (every code it knows is a real ISO alpha-2 region),
// names from the platform's CLDR data — no hand-maintained list, no duplicates, no snake_case.
import { getCountries, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

export type Country = { code: string; name: string; dial: string; flag: string };

const names = new Intl.DisplayNames(["en"], { type: "region" });

function flagOf(code: string) {
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export const COUNTRIES: Country[] = getCountries()
  .filter((c) => c.length === 2 && c !== "AC" && c !== "TA") // exclude non-ISO-3166 telephony regions
  .map((code) => ({ code, name: names.of(code) ?? code, dial: `+${getCountryCallingCode(code)}`, flag: flagOf(code) }))
  .sort((a, b) => a.name.localeCompare(b.name));

const byCode = new Map(COUNTRIES.map((c) => [c.code, c]));
export const countryName = (code?: string | null) => (code ? byCode.get(code)?.name ?? code : "—");
export const isCountryCode = (code: string) => byCode.has(code);

/** Normalise a phone number to E.164, or return null if invalid. */
export function toE164(raw: string, defaultCountry = "IN"): string | null {
  const p = parsePhoneNumberFromString(raw.trim(), defaultCountry as CountryCode);
  return p && p.isValid() ? p.number : null;
}

export function formatPhone(e164?: string | null) {
  if (!e164) return "—";
  const p = parsePhoneNumberFromString(e164);
  return p ? p.formatInternational() : e164;
}

// Indian states/UTs (GST place-of-supply needs exact names). Other countries use free text.
export const INDIAN_STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir",
  "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
  "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal",
];
