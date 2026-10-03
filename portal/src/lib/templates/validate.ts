// Pure (client + server) validation for template-driven surveys.
import { validateContainer } from "../iso6346";
import type { Answers, Field, TemplateSchema } from "./types";

export type SurveyErrors = Record<string, string>;

export function allFields(t: TemplateSchema): Field[] {
  return t.sections.flatMap((s) => s.fields);
}

export function computeValue(f: Extract<Field, { type: "computed" }>, a: Answers): number | null {
  const x = Number(a[f.a]);
  const y = Number(a[f.b]);
  if (a[f.a] === undefined || a[f.a] === "" || a[f.b] === undefined || a[f.b] === "" || Number.isNaN(x) || Number.isNaN(y)) return null;
  const v = f.op === "sub" ? x - y : x + y;
  return Math.round(v * 1000) / 1000;
}

const isEmpty = (v: unknown) =>
  v === undefined || v === null || v === "" || (Array.isArray(v) && v.filter((x) => (typeof x === "string" ? x.trim() : x)).length === 0);

function todayIST() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

/** Validate one field; returns an error message or null. `final` enforces required. */
export function validateField(f: Field, a: Answers, final: boolean): string | null {
  const v = a[f.id];
  if (f.type === "computed") return null;
  if (isEmpty(v)) return final && f.required ? `${f.label} is required` : null;
  switch (f.type) {
    case "number": {
      const n = Number(v);
      if (Number.isNaN(n)) return `${f.label} must be a number`;
      if (f.min !== undefined && n < f.min) return `${f.label} must be ≥ ${f.min}`;
      if (f.max !== undefined && n > f.max) return `${f.label} must be ≤ ${f.max}`;
      return null;
    }
    case "date": {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return `${f.label} is not a valid date`;
      if (f.notFuture && String(v) > todayIST()) return `${f.label} cannot be in the future`;
      return null;
    }
    case "time":
      return /^\d{2}:\d{2}$/.test(String(v)) ? null : `${f.label} is not a valid time`;
    case "container": {
      const r = validateContainer(String(v));
      return r.ok ? null : r.error;
    }
    case "select":
    case "radio":
      return f.options.includes(String(v)) ? null : `${f.label}: choose one of the listed options`;
    case "table": {
      const rows = Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
      const filled = rows.filter((r) => Object.values(r ?? {}).some((x) => !isEmpty(x)));
      if (final && f.minRows && filled.length < f.minRows) return `${f.label}: add at least ${f.minRows} row`;
      return null;
    }
    default:
      return null;
  }
}

export function validateSurvey(
  t: TemplateSchema,
  a: Answers,
  opts: { final: boolean; photoSlots?: Set<string>; signatures?: Set<string>; verdict?: string | null; verdictReason?: string | null },
): SurveyErrors {
  const errors: SurveyErrors = {};
  for (const f of allFields(t)) {
    const e = validateField(f, a, opts.final);
    if (e) errors[f.id] = e;
  }
  for (const r of t.rules) {
    if (r.kind === "timeOrder") {
      const s = a[r.start], e = a[r.end];
      if (typeof s === "string" && typeof e === "string" && s && e && e <= s) errors[r.end] = r.message;
    } else if (r.kind === "gt") {
      const x = Number(a[r.a]), y = Number(a[r.b]);
      if (a[r.a] !== undefined && a[r.a] !== "" && a[r.b] !== undefined && a[r.b] !== "" && !(x > y)) errors[r.a] = r.message;
    }
  }
  if (opts.final) {
    if (t.verdict.required && !opts.verdict) errors.__verdict = "Verdict (FIT / UNFIT) is required";
    if (opts.verdict === "UNFIT" && !opts.verdictReason?.trim()) errors.__verdictReason = "A reason is required when the verdict is UNFIT";
    if (opts.photoSlots) {
      for (const s of t.photoSlots) if (s.required && !opts.photoSlots.has(s.id)) errors[`photo:${s.id}`] = `Photo required: ${s.label}`;
    }
    if (opts.signatures) {
      for (const s of t.signatures) if (s.required && !opts.signatures.has(s.id)) errors[`sig:${s.id}`] = `${s.label} is required`;
    }
  }
  return errors;
}

/** Fill a certificate sentence with record data. */
export function fillCertificate(text: string, vals: Record<string, string>) {
  return text.replace(/\{(\w+)\}/g, (_, k) => vals[k] ?? "—");
}
