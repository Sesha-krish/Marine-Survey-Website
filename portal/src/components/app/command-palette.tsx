"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Search } from "lucide-react";
import { cn } from "@/lib/cn";

type Hit = { type: string; label: string; sub?: string; href: string };

const JUMPS: Hit[] = [
  { type: "Go to", label: "Dashboard", href: "/dashboard" },
  { type: "Go to", label: "RFQs", href: "/rfqs" },
  { type: "Go to", label: "Submit RFQ", href: "/rfqs/new" },
  { type: "Go to", label: "Job Orders", href: "/jobs" },
  { type: "Go to", label: "Unassigned jobs", href: "/jobs?status=NEW" },
  { type: "Go to", label: "Customers", href: "/customers" },
  { type: "Go to", label: "Surveyors", href: "/surveyors" },
  { type: "Go to", label: "Reports", href: "/reports" },
  { type: "Go to", label: "Invoices", href: "/invoices" },
  { type: "Go to", label: "Packages & Credits", href: "/billing" },
  { type: "Go to", label: "Support", href: "/support" },
];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>(JUMPS);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      setQ("");
      setHits(JUMPS);
      setActive(0);
    } else if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const s = q.trim();
    const jumps = JUMPS.filter((j) => j.label.toLowerCase().includes(s.toLowerCase()));
    if (s.length < 2) {
      setHits(jumps);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(s)}`, { signal: ctrl.signal });
        const d = r.ok ? ((await r.json()) as Hit[]) : [];
        setHits([...d, ...jumps]);
        setActive(0);
      } catch {
        /* aborted */
      }
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, open]);

  const go = (h?: Hit) => {
    if (!h) return;
    onClose();
    router.push(h.href);
  };

  return (
    <dialog
      ref={ref}
      aria-label="Command palette"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === ref.current && onClose()}
      className="mx-auto mt-[12vh] w-[min(94vw,600px)] rounded-xl border border-border bg-surface p-0 text-text shadow-pop backdrop:bg-[rgb(2_8_23/0.5)]"
    >
      <div className="flex items-center gap-2 border-b border-border px-4">
        <Search className="h-4 w-4 text-subtle" aria-hidden />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(hits.length - 1, a + 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
            if (e.key === "Enter") { e.preventDefault(); go(hits[active]); }
          }}
          placeholder="Search RFQ / job / container / customer, or jump to a page"
          className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle"
          aria-label="Search"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={hits[active] ? `hit-${active}` : undefined}
        />
      </div>
      <ul id="palette-list" role="listbox" className="max-h-[50vh] overflow-y-auto p-1.5">
        {hits.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">No matches</li>}
        {hits.map((h, i) => (
          <li
            id={`hit-${i}`}
            key={`${h.type}-${h.href}-${i}`}
            role="option"
            aria-selected={i === active}
            onMouseEnter={() => setActive(i)}
            onClick={() => go(h)}
            className={cn("flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2", i === active && "bg-surface-2")}
          >
            <span className="w-16 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-subtle">{h.type}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{h.label}</span>
              {h.sub && <span className="block truncate text-xs text-muted">{h.sub}</span>}
            </span>
            {i === active && <CornerDownLeft className="h-4 w-4 text-subtle" aria-hidden />}
          </li>
        ))}
      </ul>
    </dialog>
  );
}
