import { signedFileUrl } from "@/lib/storage";
import { computeValue } from "@/lib/templates/validate";
import type { Answers, Field, TemplateSchema } from "@/lib/templates/types";
import { formatContainer } from "@/lib/iso6346";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";

export type PhotoRef = { slot: string; attachmentId: string; takenAt: string | Date; lat: number | null; lng: number | null };

export function formatAnswer(f: Field, a: Answers): React.ReactNode {
  const v = f.type === "computed" ? computeValue(f, a) : a[f.id];
  if (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)) return <span className="text-subtle">—</span>;
  switch (f.type) {
    case "container":
      return <span className="font-mono">{formatContainer(String(v))}</span>;
    case "date":
      return fmtDate(String(v));
    case "number":
    case "computed":
      return `${Number(v).toLocaleString("en-IN")}${"unit" in f && f.unit ? ` ${f.unit}` : ""}`;
    case "boolean":
      return v ? "Yes" : "No";
    case "list":
      return (
        <ol className="list-decimal space-y-0.5 pl-5">
          {(v as string[]).filter(Boolean).map((x, i) => <li key={i}>{x}</li>)}
        </ol>
      );
    case "table": {
      const rows = (v as Record<string, unknown>[]).filter((r) => Object.values(r ?? {}).some((x) => x !== "" && x != null));
      return (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>{f.columns.map((c) => <th key={c.id} scope="col" className="border border-border bg-surface-2 px-2 py-1 text-left font-semibold">{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>{f.columns.map((c) => <td key={c.id} className="border border-border px-2 py-1">{String(r[c.id] ?? "")}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    case "textarea":
      return <span className="whitespace-pre-line">{String(v)}</span>;
    default:
      return String(v);
  }
}

/** Read-only rendering of template-driven survey data (vendor review, reports, public viewer). */
export function SurveyAnswersView({
  schema, answers, photos, verdict, verdictReason, ttl = 900, compact = false,
}: {
  schema: TemplateSchema;
  answers: Answers;
  photos: PhotoRef[];
  verdict?: string | null;
  verdictReason?: string | null;
  ttl?: number;
  compact?: boolean;
}) {
  const bySlot = new Map(photos.map((p) => [p.slot, p]));
  const extra = photos.filter((p) => p.slot.startsWith("extra:"));
  return (
    <div className="space-y-6">
      {verdict && (
        <div className={cn("flex flex-wrap items-center gap-3 rounded-lg px-4 py-3", verdict === "FIT" ? "tone-green" : "tone-red")}>
          <span className="text-lg font-bold tracking-wide">{verdict}</span>
          {verdictReason && <span className="text-sm">{verdictReason}</span>}
        </div>
      )}
      {schema.sections.map((s) => (
        <section key={s.id} className="break-inside-avoid">
          <h3 className="mb-2 border-b border-border pb-1 text-sm font-semibold uppercase tracking-wide text-subtle">{s.title}</h3>
          <dl className={cn("grid gap-x-6 gap-y-3", compact ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3")}>
            {s.fields.map((f) => (
              <div key={f.id} className={cn("min-w-0", (f.type === "table" || f.type === "list" || f.type === "textarea" || f.width === "full") && "col-span-full")}>
                <dt className="text-xs text-subtle">{f.label}</dt>
                <dd className="mt-0.5 text-sm text-text">{formatAnswer(f, answers)}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
      <section className="break-inside-avoid">
        <h3 className="mb-2 border-b border-border pb-1 text-sm font-semibold uppercase tracking-wide text-subtle">Digital images</h3>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[...schema.photoSlots.map((s) => ({ key: s.id, label: s.label, p: bySlot.get(s.id) })), ...extra.map((p, i) => ({ key: p.slot, label: `Additional ${i + 1}`, p }))].map(({ key, label, p }) => (
            <li key={key} className="break-inside-avoid">
              <figure>
                {p ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={signedFileUrl(p.attachmentId, ttl)} alt={label} className="aspect-[4/3] w-full rounded-md border border-border object-cover" />
                ) : (
                  <div className="flex aspect-[4/3] w-full items-center justify-center rounded-md border border-dashed border-border-strong text-xs text-subtle">Not captured</div>
                )}
                <figcaption className="mt-1 text-xs">
                  <span className="font-medium text-text">{label}</span>
                  {p && <span className="block text-subtle">{fmtDateTime(p.takenAt)}{p.lat != null ? ` · ${p.lat.toFixed(4)}, ${p.lng?.toFixed(4)}` : ""}</span>}
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </section>
      {schema.signatures.length > 0 && (
        <section className="break-inside-avoid">
          <h3 className="mb-2 border-b border-border pb-1 text-sm font-semibold uppercase tracking-wide text-subtle">Signatures</h3>
          <ul className="flex flex-wrap gap-6">
            {schema.signatures.map((s) => {
              const p = bySlot.get(`sig:${s.id}`);
              return (
                <li key={s.id} className="w-56">
                  {p ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={signedFileUrl(p.attachmentId, ttl)} alt={s.label} className="h-20 w-full rounded border border-border bg-white object-contain" />
                  ) : (
                    <div className="h-20 rounded border border-dashed border-border-strong" />
                  )}
                  <p className="mt-1 border-t border-border pt-1 text-xs text-muted">{s.label}</p>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
