import { AUDIT_LABEL } from "@/lib/audit";
import { fmtDateTime } from "@/lib/format";
import { StatusPill } from "@/components/ui/misc";

export type TimelineEvent = {
  id: string;
  action: string;
  actorName: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  createdAt: Date;
  entityType: string;
};

/** End-to-end activity timeline (reads the append-only audit log). */
export function Timeline({ events }: { events: TimelineEvent[] }) {
  if (!events.length) return <p className="px-1 py-6 text-sm text-muted">No activity recorded yet.</p>;
  return (
    <ol className="relative ml-2 border-l border-border">
      {events.map((e) => (
        <li key={e.id} className="mb-5 ml-5 last:mb-0">
          <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-accent-strong" aria-hidden />
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-sm font-medium text-text">{AUDIT_LABEL[e.action] ?? e.action}</p>
            {e.fromStatus && e.toStatus && (
              <span className="flex items-center gap-1 text-xs text-muted">
                <StatusPill status={e.fromStatus} /> → <StatusPill status={e.toStatus} />
              </span>
            )}
            {!e.fromStatus && e.toStatus && <StatusPill status={e.toStatus} />}
          </div>
          {e.note && <p className="mt-0.5 text-[13px] text-muted">{e.note}</p>}
          <p className="mt-0.5 text-xs text-subtle">
            {fmtDateTime(e.createdAt)} · {e.actorName ?? "System"}
          </p>
        </li>
      ))}
    </ol>
  );
}
