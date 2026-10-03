import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/misc";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { TemplateSchema } from "@/lib/templates/types";
import { TemplateEditor } from "./client";

export const metadata = { title: "Survey Templates" };

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  await requireUser(["PLATFORM_ADMIN"]);
  const sp = await searchParams;
  const types = await db.surveyType.findMany({ orderBy: { name: "asc" }, include: { templates: { orderBy: { version: "desc" } }, _count: { select: { jobOrders: true } } } });
  const sel = types.find((t) => t.id === sp.type) ?? types[0];
  const latest = sel?.templates[0];
  const usage = sel ? await db.survey.groupBy({ by: ["templateId"], where: { template: { surveyTypeId: sel.id } }, _count: true }) : [];
  const schema = latest ? (JSON.parse(latest.schema) as TemplateSchema) : null;
  return (
    <>
      <PageHeader title="Survey Templates" description="Templates are versioned data. One schema drives the capture form, validation, the report and the API. Surveys stay on the version they started with." />
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <Card className="self-start">
          <ul className="divide-y divide-border">
            {types.map((t) => (
              <li key={t.id}>
                <Link href={`/admin/templates?type=${t.id}`} aria-current={t.id === sel?.id ? "page" : undefined} className={cn("flex items-center justify-between px-4 py-2.5 text-sm hover:bg-surface-2", t.id === sel?.id && "bg-accent-soft font-semibold")}>
                  {t.name}
                  {t.templates.length ? <Badge tone="teal">v{t.templates[0].version}</Badge> : <Badge tone="red">none</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        {sel && (
          <div className="space-y-6">
            <Card>
              <CardHeader title={`${sel.name} — versions`} />
              {sel.templates.length === 0 ? <p className="px-5 py-4 text-sm text-muted">No template yet. Paste one below (copy another type&apos;s JSON as a starting point).</p> : (
                <ul className="divide-y divide-border text-sm">
                  {sel.templates.map((t) => {
                    const s = JSON.parse(t.schema) as TemplateSchema;
                    return (
                      <li key={t.id} className="flex flex-wrap justify-between gap-2 px-5 py-2.5">
                        <span>v{t.version} · {s.sections.reduce((n, x) => n + x.fields.length, 0)} fields · {s.photoSlots.length} photo slots · {s.signatures.length} signatures</span>
                        <span className="text-muted">{usage.find((u) => u.templateId === t.id)?._count ?? 0} surveys · {fmtDateTime(t.createdAt)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
            <TemplateEditor key={sel.id} typeId={sel.id} typeName={sel.name} initial={latest ? JSON.stringify(JSON.parse(latest.schema), null, 2) : JSON.stringify({ name: sel.name, certificateText: "This is to certify that at the request of {requester}, we attended at {area} on {date} at {place}.", verdict: { required: true, options: ["FIT", "UNFIT"], reasonRequiredFor: "UNFIT" }, sections: [{ id: "identification", title: "Identification", fields: [{ id: "placeOfInspection", label: "Place of Inspection", type: "text", required: true }] }], photoSlots: [], additionalPhotos: true, signatures: [{ id: "surveyor", label: "Surveyor Sign & Stamp", required: true }], rules: [] }, null, 2)} />
            {schema && (
              <Card>
                <CardHeader title="Current field map" description="What surveyors fill in, in order." />
                <div className="grid gap-4 p-5 sm:grid-cols-2">
                  {schema.sections.map((s) => (
                    <div key={s.id}>
                      <p className="text-sm font-semibold">{s.title}</p>
                      <ul className="mt-1 text-[13px] text-muted">{s.fields.map((f) => <li key={f.id}>{f.label} <span className="text-subtle">({f.type}{f.required ? ", required" : ""})</span></li>)}</ul>
                    </div>
                  ))}
                  <div>
                    <p className="text-sm font-semibold">Photo slots</p>
                    <ul className="mt-1 text-[13px] text-muted">{schema.photoSlots.map((p) => <li key={p.id}>{p.label}{p.required ? " *" : ""}</li>)}</ul>
                  </div>
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </>
  );
}
