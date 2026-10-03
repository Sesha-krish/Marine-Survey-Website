import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Alert, Card, CardHeader, PageHeader, StatusPill } from "@/components/ui/misc";
import { ReportDocument } from "@/components/app/report-document";
import { Timeline } from "@/components/app/timeline";
import { REPORT_STAGES, REPORT_STAGE_LABEL, type ReportStage } from "@/lib/constants";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { allFields } from "@/lib/templates/validate";
import type { ReportSnapshot } from "@/server/reports";
import { ReportActions } from "./client";

export const metadata = { title: "Report" };

export default async function ReportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ v?: string }> }) {
  const u = await requireUser(["VENDOR_ADMIN", "VENDOR_STAFF"]);
  const { id } = await params;
  const sp = await searchParams;
  const r = await db.report.findFirst({
    where: { id, orgId: u.orgId },
    include: { versions: { orderBy: { version: "desc" } }, survey: { include: { reports: true, jobOrder: { include: { rfq: { include: { customer: true } } } } } } },
  });
  if (!r) notFound();
  const vNum = Number(sp.v) || r.currentVersion;
  const version = r.versions.find((v) => v.version === vNum) ?? r.versions[0];
  const snap = JSON.parse(version.snapshot) as ReportSnapshot;
  const [letterheads, events, authors] = await Promise.all([
    db.letterhead.findMany({ where: { orgId: u.orgId }, orderBy: { version: "desc" } }),
    db.auditLog.findMany({ where: { entityId: r.id }, orderBy: { createdAt: "desc" } }),
    db.user.findMany({ where: { id: { in: r.versions.map((v) => v.createdById) } }, select: { id: true, firstName: true, lastName: true } }),
  ]);
  const author = (uid: string) => { const a = authors.find((x) => x.id === uid); return a ? `${a.firstName} ${a.lastName ?? ""}`.trim() : "System"; };
  const issued = ["ISSUED", "REISSUED"].includes(r.status);
  const latest = version.version === r.currentVersion;
  // Draft (not issued) reports follow the report's chosen letterhead; issued versions keep the one frozen in the snapshot.
  const lhId = !issued && latest && r.letterheadId ? letterheads.find((l) => l.id === r.letterheadId)?.attachmentId ?? snap.letterheadAttachmentId : snap.letterheadAttachmentId;
  const siblings = REPORT_STAGES.map((st) => r.survey.reports.find((x) => x.stage === st) ?? null);
  const amended = version.version > 1 && version.reason && !/^(Generated|Regenerated|Signed|Re-signed)/.test(version.reason) ? { at: version.createdAt, by: author(version.createdById), reason: version.reason } : null;
  const editable = allFields(snap.template).filter((f) => ["text", "number", "date", "time", "select", "radio", "textarea", "container"].includes(f.type)).map((f) => ({ id: f.id, label: f.label, type: f.type, options: "options" in f ? f.options : undefined, value: snap.answers[f.id] ?? "" }));

  return (
    <>
      <div className="no-print">
        <PageHeader
          breadcrumb={<><Link href="/reports" className="hover:underline">Reports</Link> / <Link href={`/rfqs/${r.survey.jobOrder.rfqId}?tab=reports`} className="hover:underline">{r.survey.jobOrder.rfq.number}</Link> / <Link href={`/jobs/${r.survey.jobOrderId}`} className="hover:underline">{r.survey.jobOrder.number}</Link></>}
          title={<span className="flex flex-wrap items-center gap-3">{REPORT_STAGE_LABEL[r.stage as ReportStage]} {r.number} <StatusPill status={r.status} />{r.sentAt && <StatusPill status="SENT" label={`Sent ${fmtDateTime(r.sentAt)}`} />}</span>}
          description={`Version ${r.currentVersion}${r.issuedAt ? ` · issued ${fmtDateTime(r.issuedAt)}` : ""}${r.sentTo ? ` · sent to ${r.sentTo}` : ""}`}
          actions={
            <ReportActions
              report={{ id: r.id, stage: r.stage, status: r.status, letterheadId: r.letterheadId, customerEmail: r.survey.jobOrder.rfq.customer.email }}
              letterheads={letterheads.map((l) => ({ id: l.id, label: `Letterhead v${l.version}${l.active ? " (default)" : ""}` }))}
              editable={editable}
              verdict={snap.verdict}
              verdictReason={snap.verdictReason}
              narrative={version.narrative}
            />
          }
        />
        <nav className="mb-4 flex flex-wrap gap-2" aria-label="Report stages for this survey">
          {siblings.map((s, i) => (
            s ? (
              <Link key={REPORT_STAGES[i]} href={`/reports/${s.id}`} aria-current={s.id === r.id ? "page" : undefined} className={cn("inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-[13px] font-medium", s.id === r.id ? "border-accent-strong bg-accent-soft text-text" : "border-border bg-surface text-muted hover:text-text")}>
                {REPORT_STAGE_LABEL[REPORT_STAGES[i]]} <StatusPill status={s.status} />
              </Link>
            ) : (
              <span key={REPORT_STAGES[i]} className="inline-flex h-9 items-center gap-2 rounded-lg border border-dashed border-border px-3 text-[13px] text-subtle" title={REPORT_STAGES[i] === "PRELIMINARY" ? "Generate from the job page while the survey is in progress" : REPORT_STAGES[i] === "SIGNED" ? "Created when the Formal Report is issued" : "Generated when the survey is submitted"}>
                {REPORT_STAGE_LABEL[REPORT_STAGES[i]]} · not generated
              </span>
            )
          ))}
        </nav>
        {!latest && <Alert tone="warning" className="mb-4" title={`You're viewing version ${version.version} (read-only)`}><Link href={`/reports/${r.id}`} className="font-medium text-accent-strong hover:underline">Go to the current version (v{r.currentVersion})</Link></Alert>}
        {r.status === "AMENDED" && <Alert tone="warning" className="mb-4" title="Amended — not yet re-issued">Re-issue to lock this version and refresh the signed copy.</Alert>}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        <ReportDocument snap={snap} number={r.number} version={version.version} status={latest ? r.status : "ISSUED"} letterheadAttachmentId={lhId} amended={amended} narrative={version.narrative} />
        <aside className="no-print space-y-6">
          <Card>
            <CardHeader title="Versions" description="Issued versions are immutable." />
            <ol className="divide-y divide-border">
              {r.versions.map((v) => (
                <li key={v.id}>
                  <Link href={`/reports/${r.id}?v=${v.version}`} className={cn("block px-5 py-2.5 text-sm hover:bg-surface-2", v.version === version.version && "bg-accent-soft")}>
                    <span className="font-semibold">v{v.version}</span> {v.locked && <span className="text-xs text-success">· locked</span>}
                    <span className="block text-xs text-muted">{fmtDateTime(v.createdAt)} · {author(v.createdById)}</span>
                    {v.reason && <span className="block text-xs text-subtle">{v.reason}</span>}
                  </Link>
                </li>
              ))}
            </ol>
          </Card>
          <Card>
            <CardHeader title="Activity" />
            <div className="p-5"><Timeline events={events} /></div>
          </Card>
        </aside>
      </div>
    </>
  );
}
