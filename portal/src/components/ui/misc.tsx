import { cn } from "@/lib/cn";
import { STATUS_TONE, humanize, type Tone } from "@/lib/constants";

/** The ONE status component. One colour per status across RFQ / Job / Assignment / Survey / Report / Invoice. */
export function StatusPill({ status, className, label }: { status: string | null | undefined; className?: string; label?: string }) {
  if (!status) return <span className="text-subtle">—</span>;
  const tone: Tone = STATUS_TONE[status] ?? "slate";
  return (
    <span className={cn(`tone-${tone} inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold`, className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" aria-hidden />
      {label ?? humanize(status)}
    </span>
  );
}

export function Badge({ tone = "slate", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return <span className={cn(`tone-${tone} inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide`, className)}>{children}</span>;
}

export function DemoBadge() {
  return <Badge tone="violet" className="ml-1.5 align-middle">Demo</Badge>;
}

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-xl border border-border bg-surface shadow-card", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({ title, description, actions, className }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4", className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-text">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PageHeader({ title, description, actions, breadcrumb }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; breadcrumb?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {breadcrumb && <div className="mb-1.5 text-[13px] text-muted">{breadcrumb}</div>}
        <h1 className="text-[22px] font-semibold tracking-tight text-text">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: React.ReactNode; title: string; description?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-muted">{icon}</div>}
      <p className="text-[15px] font-semibold text-text">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4", className)} aria-hidden />;
}

export function DescList({ items, cols = 2 }: { items: { label: string; value: React.ReactNode; wide?: boolean }[]; cols?: 1 | 2 | 3 }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-4", cols === 1 ? "grid-cols-1" : cols === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3")}>
      {items.map((it) => (
        <div key={it.label} className={cn("min-w-0", it.wide && "sm:col-span-full")}>
          <dt className="text-xs font-medium uppercase tracking-wide text-subtle">{it.label}</dt>
          <dd className="mt-1 break-words text-sm text-text">{it.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Alert({ tone = "info", title, children, className }: { tone?: "info" | "warning" | "danger" | "success"; title?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  const tones = {
    info: "border-accent/40 bg-accent-soft text-text",
    warning: "border-warning/40 bg-warning-soft text-text",
    danger: "border-danger/40 bg-danger-soft text-text",
    success: "border-success/40 bg-success-soft text-text",
  };
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded-lg border px-4 py-3 text-sm", tones[tone], className)}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cn(title && "mt-0.5", "text-muted")}>{children}</div>}
    </div>
  );
}
