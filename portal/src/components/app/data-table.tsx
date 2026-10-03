import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  sortable?: boolean;
  className?: string;
  /** hidden on the mobile card */
  mobileHidden?: boolean;
  /** shown as the card title on mobile */
  primary?: boolean;
};

type Search = Record<string, string | string[] | undefined>;

function qs(sp: Search, patch: Record<string, string | null>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((x) => p.append(k, x));
    else p.set(k, v);
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) p.delete(k);
    else p.set(k, v);
  }
  return `?${p.toString()}`;
}

/**
 * Server-rendered data table. Desktop: real <table> with scope'd headers, sortable links,
 * and a sticky right-hand Actions column that never scrolls off. Mobile: stacked cards.
 * `selectable` renders checkboxes associated with <form id={selectable.formId}> for bulk actions.
 */
export function DataTable<T extends { id: string }>({
  columns, rows, searchParams, actions, rowHref, selectable, caption, empty,
}: {
  columns: Column<T>[];
  rows: T[];
  searchParams: Search;
  actions?: (row: T) => React.ReactNode;
  rowHref?: (row: T) => string;
  selectable?: { formId: string; label: (row: T) => string; disabled?: (row: T) => boolean };
  caption: string;
  empty?: React.ReactNode;
}) {
  const sort = typeof searchParams.sort === "string" ? searchParams.sort : undefined;
  const dir = searchParams.dir === "asc" ? "asc" : "desc";
  const compact = searchParams.density === "compact";
  const pad = compact ? "py-1.5" : "py-3";

  if (!rows.length) return <>{empty}</>;

  return (
    <>
      {/* Desktop / tablet */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="bg-surface-2 text-left">
              {selectable && (
                <th scope="col" className="w-10 border-b border-border px-4 py-2.5">
                  <span className="sr-only">Select</span>
                  <input type="checkbox" aria-label="Select all rows on this page" data-select-all={selectable.formId} className="h-4 w-4 accent-[var(--accent-strong)]" />
                </th>
              )}
              {columns.map((c) => {
                const active = sort === c.key;
                return (
                  <th key={c.key} scope="col" className={cn("whitespace-nowrap border-b border-border px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-subtle", c.className)} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}>
                    {c.sortable ? (
                      <Link href={qs(searchParams, { sort: c.key, dir: active && dir === "desc" ? "asc" : "desc", page: null })} className="inline-flex items-center gap-1 hover:text-text" scroll={false}>
                        {c.header}
                        {active ? dir === "asc" ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden /> : <ArrowUpDown className="h-3 w-3 opacity-40" aria-hidden />}
                      </Link>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
              {actions && (
                <th scope="col" className="sticky right-0 z-10 whitespace-nowrap border-b border-l border-border bg-surface-2 px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-subtle">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="group">
                {selectable && (
                  <td className={cn("border-b border-border px-4 group-hover:bg-surface-2", pad)}>
                    <input type="checkbox" name="ids" value={r.id} form={selectable.formId} aria-label={selectable.label(r)} disabled={selectable.disabled?.(r)} className="h-4 w-4 accent-[var(--accent-strong)]" />
                  </td>
                )}
                {columns.map((c, i) => (
                  <td key={c.key} className={cn("border-b border-border px-4 align-middle text-text group-hover:bg-surface-2", pad, c.className)}>
                    {i === 0 && rowHref ? (
                      <Link href={rowHref(r)} className="font-medium text-accent-strong hover:underline">
                        {c.cell(r)}
                      </Link>
                    ) : (
                      c.cell(r)
                    )}
                  </td>
                ))}
                {actions && (
                  <td className={cn("sticky right-0 border-b border-l border-border bg-surface px-3 text-right group-hover:bg-surface-2", pad)}>
                    <div className="flex items-center justify-end gap-1">{actions(r)}</div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="divide-y divide-border md:hidden" aria-label={caption}>
        {rows.map((r) => {
          const primary = columns.find((c) => c.primary) ?? columns[0];
          return (
            <li key={r.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2">
                  {selectable && (
                    <input type="checkbox" name="ids" value={r.id} form={selectable.formId} aria-label={selectable.label(r)} disabled={selectable.disabled?.(r)} className="mt-1 h-4 w-4 accent-[var(--accent-strong)]" />
                  )}
                  <div className="min-w-0 font-medium">
                    {rowHref ? <Link href={rowHref(r)} className="text-accent-strong hover:underline">{primary.cell(r)}</Link> : primary.cell(r)}
                  </div>
                </div>
                {actions && <div className="flex shrink-0 gap-1">{actions(r)}</div>}
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
                {columns.filter((c) => c !== primary && !c.mobileHidden).map((c) => (
                  <div key={c.key} className="min-w-0">
                    <dt className="text-[11px] uppercase tracking-wide text-subtle">{c.header}</dt>
                    <dd className="truncate text-text">{c.cell(r)}</dd>
                  </div>
                ))}
              </dl>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function Pagination({ page, pageSize, total, searchParams }: { page: number; pageSize: number; total: number; searchParams: Search }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const nums = [...new Set([1, page - 1, page, page + 1, pages].filter((n) => n >= 1 && n <= pages))].sort((a, b) => a - b);
  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[13px] text-muted" aria-label="Pagination">
      <span>
        Showing <strong className="text-text">{from}–{to}</strong> of <strong className="text-text">{total.toLocaleString("en-IN")}</strong>
      </span>
      <div className="flex items-center gap-1">
        <PageLink disabled={page <= 1} href={qs(searchParams, { page: String(page - 1) })} label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </PageLink>
        {nums.map((n, i) => (
          <span key={n} className="flex items-center">
            {i > 0 && n - nums[i - 1] > 1 && <span className="px-1">…</span>}
            <Link
              href={qs(searchParams, { page: String(n) })}
              aria-current={n === page ? "page" : undefined}
              className={cn("inline-flex h-8 min-w-8 items-center justify-center rounded-md px-2 font-medium", n === page ? "bg-primary text-primary-fg" : "text-text hover:bg-surface-2")}
            >
              {n}
            </Link>
          </span>
        ))}
        <PageLink disabled={page >= pages} href={qs(searchParams, { page: String(page + 1) })} label="Next page">
          <ChevronRight className="h-4 w-4" />
        </PageLink>
      </div>
    </nav>
  );
}

function PageLink({ disabled, href, label, children }: { disabled: boolean; href: string; label: string; children: React.ReactNode }) {
  if (disabled) return <span className="inline-flex h-8 w-8 items-center justify-center rounded-md text-subtle opacity-50" aria-hidden>{children}</span>;
  return (
    <Link href={href} aria-label={label} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text hover:bg-surface-2">
      {children}
    </Link>
  );
}
