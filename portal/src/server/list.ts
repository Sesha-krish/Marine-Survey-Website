// Server-side list parameters: every list is searched, filtered, sorted and paginated in SQL.
export type SP = Record<string, string | string[] | undefined>;

export function str(sp: SP, k: string) {
  const v = sp[k];
  return typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined;
}

export function multi(sp: SP, k: string, allowed: readonly string[]) {
  const raw = sp[k];
  const vals = (Array.isArray(raw) ? raw : raw ? [raw] : []).flatMap((v) => v.split(","));
  return vals.filter((v) => allowed.includes(v));
}

export function listParams(sp: SP, opts: { pageSize?: number; sortable: string[]; defaultSort: string }) {
  const page = Math.max(1, Number(str(sp, "page")) || 1);
  const pageSize = opts.pageSize ?? 15;
  const sortKey = opts.sortable.includes(str(sp, "sort") ?? "") ? str(sp, "sort")! : opts.defaultSort;
  const dir: "asc" | "desc" = str(sp, "dir") === "asc" ? "asc" : "desc";
  const q = str(sp, "q")?.trim() || undefined;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(str(sp, "from") ?? "") ? new Date(`${str(sp, "from")}T00:00:00+05:30`) : undefined;
  const to = /^\d{4}-\d{2}-\d{2}$/.test(str(sp, "to") ?? "") ? new Date(`${str(sp, "to")}T23:59:59+05:30`) : undefined;
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize, sortKey, dir, q, from, to };
}

export function dateRange(from?: Date, to?: Date) {
  if (!from && !to) return undefined;
  return { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
}

/** CSV with proper quoting + formula-injection guard for spreadsheet apps. */
export function toCsv(header: string[], rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
}
