import Link from "next/link";
import { cn } from "@/lib/cn";

/** URL-driven tabs (shareable, back-button friendly). Rendered as a nav of links with aria-current. */
export function LinkTabs({ tabs, active, base, label }: { tabs: { key: string; label: string; count?: number }[]; active: string; base: string; label: string }) {
  return (
    <nav aria-label={label} className="-mb-px flex gap-1 overflow-x-auto border-b border-border">
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={`${base}${base.includes("?") ? "&" : "?"}tab=${t.key}`}
            scroll={false}
            aria-current={on ? "page" : undefined}
            className={cn(
              "inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm font-medium transition-colors",
              on ? "border-accent-strong text-text" : "border-transparent text-muted hover:text-text",
            )}
          >
            {t.label}
            {t.count !== undefined && <span className="rounded-full bg-surface-2 px-1.5 text-[11px] font-semibold text-muted">{t.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
