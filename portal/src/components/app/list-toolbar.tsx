"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Bookmark, Download, Filter, Rows3, Rows4, Search, X } from "lucide-react";
import { Button, buttonClass } from "@/components/ui/button";
import { Checkbox, Input, Select } from "@/components/ui/form";
import { humanize } from "@/lib/constants";
import { cn } from "@/lib/cn";

export type FilterDef =
  | { key: string; label: string; type: "multi"; options: readonly string[]; labels?: Record<string, string> }
  | { key: string; label: string; type: "select"; options: { value: string; label: string }[] };

/**
 * Filters live in the URL (shareable, bookmarkable, deep-linkable — /rfqs?status=NEW actually filters).
 * Saved views are a per-viewer convenience stored in localStorage.
 */
export function ListToolbar({
  searchPlaceholder, filters = [], dateRange = true, exportHref, total, listKey,
}: {
  searchPlaceholder: string;
  filters?: FilterDef[];
  dateRange?: boolean;
  exportHref?: string;
  total: number;
  listKey: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string[]>>({});
  const [views, setViews] = useState<{ name: string; qs: string }[]>([]);
  const popRef = useRef<HTMLDivElement>(null);

  const push = (mut: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(sp.toString());
    mut(p);
    p.delete("page");
    start(() => router.push(`${pathname}?${p.toString()}`, { scroll: false }));
  };

  // Debounced search
  useEffect(() => {
    if ((sp.get("q") ?? "") === q) return;
    const t = setTimeout(() => push((p) => (q ? p.set("q", q) : p.delete("q"))), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  useEffect(() => {
    try {
      setViews(JSON.parse(localStorage.getItem(`views:${listKey}`) ?? "[]"));
    } catch {
      setViews([]);
    }
  }, [listKey]);

  useEffect(() => {
    if (!open) return;
    const init: Record<string, string[]> = {};
    for (const f of filters) init[f.key] = sp.getAll(f.key).flatMap((v) => v.split(","));
    setDraft(init);
    const onDoc = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const active = filters.flatMap((f) =>
    sp.getAll(f.key).flatMap((v) => v.split(",")).filter(Boolean).map((v) => ({
      key: f.key, value: v, label: `${f.label}: ${f.type === "multi" ? f.labels?.[v] ?? humanize(v) : f.options.find((o) => o.value === v)?.label ?? v}`,
    })),
  );
  const density = sp.get("density") === "compact" ? "compact" : "comfortable";

  const saveView = () => {
    const name = window.prompt("Name this view");
    if (!name) return;
    const next = [...views.filter((v) => v.name !== name), { name, qs: sp.toString() }];
    setViews(next);
    try {
      localStorage.setItem(`views:${listKey}`, JSON.stringify(next));
    } catch {
      /* storage unavailable — view lives for this session only */
    }
  };

  return (
    <div className="space-y-3 border-b border-border px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
          <Input aria-label={searchPlaceholder} placeholder={searchPlaceholder} value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" type="search" />
        </div>

        {filters.length > 0 && (
          <div className="relative" ref={popRef}>
            <Button variant="outline" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog">
              <Filter className="h-4 w-4" aria-hidden /> Filter
              {active.length > 0 && <span className="rounded-full bg-accent-strong px-1.5 text-[11px] font-bold text-white dark:text-[#04201c]">{active.length}</span>}
            </Button>
            {open && (
              <div role="dialog" aria-label="Filters" className="absolute left-0 z-30 mt-2 w-[min(92vw,340px)] rounded-xl border border-border bg-surface p-4 shadow-pop">
                <div className="max-h-[60vh] space-y-4 overflow-y-auto">
                  {filters.map((f) => (
                    <fieldset key={f.key}>
                      <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">{f.label}</legend>
                      {f.type === "multi" ? (
                        <div className="grid grid-cols-2 gap-1.5">
                          {f.options.map((o) => (
                            <Checkbox
                              key={o}
                              label={f.labels?.[o] ?? humanize(o)}
                              checked={draft[f.key]?.includes(o) ?? false}
                              onChange={(e) =>
                                setDraft((d) => ({ ...d, [f.key]: e.target.checked ? [...(d[f.key] ?? []), o] : (d[f.key] ?? []).filter((x) => x !== o) }))
                              }
                            />
                          ))}
                        </div>
                      ) : (
                        <Select value={draft[f.key]?.[0] ?? ""} onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value ? [e.target.value] : [] }))} placeholder="Any">
                          {f.options.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </Select>
                      )}
                    </fieldset>
                  ))}
                </div>
                <div className="mt-4 flex justify-between gap-2 border-t border-border pt-3">
                  <Button variant="ghost" onClick={() => setDraft({})}>Clear all</Button>
                  <Button
                    onClick={() => {
                      push((p) => {
                        for (const f of filters) {
                          p.delete(f.key);
                          const v = draft[f.key] ?? [];
                          if (v.length) p.set(f.key, v.join(","));
                        }
                      });
                      setOpen(false);
                    }}
                  >
                    Apply
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {dateRange && (
          <div className="flex items-center gap-1.5">
            <label className="sr-only" htmlFor={`${listKey}-from`}>From date</label>
            <Input id={`${listKey}-from`} type="date" className="w-[9.5rem]" value={sp.get("from") ?? ""} onChange={(e) => push((p) => (e.target.value ? p.set("from", e.target.value) : p.delete("from")))} />
            <span className="text-subtle" aria-hidden>–</span>
            <label className="sr-only" htmlFor={`${listKey}-to`}>To date</label>
            <Input id={`${listKey}-to`} type="date" className="w-[9.5rem]" value={sp.get("to") ?? ""} onChange={(e) => push((p) => (e.target.value ? p.set("to", e.target.value) : p.delete("to")))} />
          </div>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <span className="mr-1 text-[13px] text-muted" aria-live="polite">
            {pending ? "Loading…" : `${total.toLocaleString("en-IN")} result${total === 1 ? "" : "s"}`}
          </span>
          {views.length > 0 && (
            <Select aria-label="Saved views" className="h-9 w-36" value="" onChange={(e) => e.target.value !== "" && start(() => router.push(`${pathname}?${e.target.value}`))} placeholder="Saved views">
              {views.map((v) => (
                <option key={v.name} value={v.qs}>{v.name}</option>
              ))}
            </Select>
          )}
          <Button variant="ghost" size="icon" aria-label="Save current view" title="Save current view" onClick={saveView}>
            <Bookmark className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={density === "compact" ? "Comfortable rows" : "Compact rows"}
            title={density === "compact" ? "Comfortable rows" : "Compact rows"}
            onClick={() => push((p) => (density === "compact" ? p.delete("density") : p.set("density", "compact")))}
          >
            {density === "compact" ? <Rows3 className="h-4 w-4" /> : <Rows4 className="h-4 w-4" />}
          </Button>
          {exportHref && (
            <a className={buttonClass("outline", "md")} href={`${exportHref}?${sp.toString()}`} download>
              <Download className="h-4 w-4" aria-hidden /> Export
            </a>
          )}
        </div>
      </div>

      {active.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {active.map((a) => (
            <button
              key={`${a.key}:${a.value}`}
              className={cn("inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs text-text hover:bg-surface-3")}
              onClick={() =>
                push((p) => {
                  const rest = p.getAll(a.key).flatMap((v) => v.split(",")).filter((v) => v !== a.value);
                  p.delete(a.key);
                  if (rest.length) p.set(a.key, rest.join(","));
                })
              }
              aria-label={`Remove filter ${a.label}`}
            >
              {a.label} <X className="h-3 w-3" aria-hidden />
            </button>
          ))}
          <button className="text-xs font-medium text-accent-strong hover:underline" onClick={() => push((p) => filters.forEach((f) => p.delete(f.key)))}>
            Clear filters
          </button>
        </div>
      )}
    </div>
  );
}
