// Dates are always dd-MMM-yyyy (unambiguous for Indian & international users), times 24h, IST.
const TZ = "Asia/Kolkata";

export function fmtDate(d?: Date | string | null) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: TZ }).format(new Date(d));
}

export function fmtDateTime(d?: Date | string | null) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ,
  }).format(new Date(d));
}

export function fmtRelative(d: Date | string) {
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (Math.abs(diff) < 60) return "just now";
  if (Math.abs(diff) < 3600) return rtf.format(-Math.round(diff / 60), "minute");
  if (Math.abs(diff) < 86400) return rtf.format(-Math.round(diff / 3600), "hour");
  if (Math.abs(diff) < 86400 * 30) return rtf.format(-Math.round(diff / 86400), "day");
  return fmtDate(d);
}

export function fmtMoney(amount: number | null | undefined, currency = "INR") {
  if (amount == null) return "—";
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
    style: "currency", currency, maximumFractionDigits: 2,
  }).format(amount);
}

export function fmtNumber(n: number) {
  return new Intl.NumberFormat("en-IN").format(n);
}

/** yyyy-mm-dd for <input type=date>, in IST. */
export function toDateInput(d?: Date | string | null) {
  if (!d) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d));
  return parts;
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

export function personName(p: { firstName?: string | null; middleName?: string | null; lastName?: string | null }) {
  return [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ");
}

export function customerName(c: { customerType: string; organizationName?: string | null; firstName?: string | null; middleName?: string | null; lastName?: string | null }) {
  return c.customerType === "ENTERPRISE" ? c.organizationName ?? "—" : personName(c) || "—";
}
