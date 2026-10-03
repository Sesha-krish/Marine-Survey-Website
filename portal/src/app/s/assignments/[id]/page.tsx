import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarDays, ExternalLink, FileText, MapPin, Phone } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Alert, Badge, Card, CardHeader, DescList, StatusPill } from "@/components/ui/misc";
import { ButtonLink } from "@/components/ui/button";
import { humanize } from "@/lib/constants";
import { formatPhone } from "@/lib/countries";
import { customerName, fmtDate, fmtDateTime, fmtMoney } from "@/lib/format";
import { formatContainer } from "@/lib/iso6346";
import { signedFileUrl } from "@/lib/storage";
import { RespondButtons, StartButton } from "../../respond";

export const metadata = { title: "Assignment" };

export default async function AssignmentPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(["SURVEYOR"]);
  const { id } = await params;
  const a = await db.assignment.findFirst({
    where: { id, surveyorId: u.surveyorId ?? "__none__" },
    include: {
      jobOrder: {
        include: {
          org: true,
          surveyType: true,
          rfqLine: true,
          survey: { select: { id: true, status: true } },
          rfq: { include: { customer: true, attachments: true, agentContacts: true, jointInspectors: true } },
          assignments: { include: { surveyor: true } },
        },
      },
    },
  });
  if (!a) notFound();
  const j = a.jobOrder;
  const rfq = j.rfq;
  const scope = j.rfqLine ? [...(JSON.parse(j.rfqLine.scope) as string[]), ...(j.rfqLine.scopeOther ? [`Other: ${j.rfqLine.scopeOther}`] : [])] : [];
  const others = j.assignments.filter((x) => x.id !== a.id && ["NEW", "ACCEPTED", "IN_PROGRESS"].includes(x.status));
  const mapHref = rfq.lat != null ? `https://www.openstreetmap.org/?mlat=${rfq.lat}&mlon=${rfq.lng}#map=15/${rfq.lat}/${rfq.lng}` : `https://www.openstreetmap.org/search?query=${encodeURIComponent(j.location)}`;

  return (
    <>
      <Link href="/s" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-text"><ArrowLeft className="h-4 w-4" aria-hidden /> Assignments</Link>
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-subtle">{j.surveyType.name} · {a.number}</p>
        <h1 className="mt-0.5 flex flex-wrap items-center gap-2 text-xl font-semibold">{j.number} <StatusPill status={a.status} />{!a.isLead && <Badge tone="slate">Supporting surveyor</Badge>}</h1>
        {j.containerNumber && <p className="mt-0.5 font-mono text-sm text-muted">{formatContainer(j.containerNumber)}</p>}
      </div>

      {a.status === "NEW" && (
        <Card className="mb-4 p-4">
          <p className="mb-3 text-sm">Assigned {fmtDateTime(a.assignedAt)} by <strong>{j.org.name}</strong>{a.fee != null && <> · fee <strong>{fmtMoney(a.fee)}</strong></>}. Please accept or reject.</p>
          <RespondButtons assignmentId={a.id} large />
        </Card>
      )}
      {a.status === "ACCEPTED" && (a.isLead || !others.some((o) => o.isLead)) && <div className="mb-4"><StartButton assignmentId={a.id} /></div>}
      {a.status === "ACCEPTED" && !a.isLead && others.some((o) => o.isLead) && <Alert tone="info" className="mb-4">You&apos;re supporting the lead surveyor; they will capture and submit the survey.</Alert>}
      {a.status === "IN_PROGRESS" && j.survey && <div className="mb-4"><ButtonLink href={`/s/surveys/${j.survey.id}`} size="lg" variant="accent" className="w-full">Continue survey</ButtonLink></div>}
      {a.status === "COMPLETED" && <Alert tone="success" className="mb-4" title="Submitted">Completed {fmtDateTime(a.completedAt)}. The survey company is reviewing it.</Alert>}
      {a.status === "REJECTED" && <Alert tone="warning" className="mb-4" title="You rejected this assignment">{a.rejectionReason}</Alert>}
      {a.status === "CANCELLED" && <Alert tone="warning" className="mb-4" title="This assignment was withdrawn" />}

      <div className="space-y-4">
        <Card>
          <CardHeader title="Where & when" />
          <div className="space-y-3 p-5 text-sm">
            <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-subtle" aria-hidden /><span>{humanize(rfq.surveyArea)} — {rfq.areaName}<span className="block text-muted">{j.location}</span></span></p>
            <a href={mapHref} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] font-medium text-accent-strong hover:underline">Open in map <ExternalLink className="h-3.5 w-3.5" aria-hidden /></a>
            <p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-subtle" aria-hidden />{fmtDate(j.surveyDate)}</p>
          </div>
        </Card>
        {a.instructions && <Alert tone="info" title="Instructions from the survey company">{a.instructions}</Alert>}
        <Card>
          <CardHeader title="Scope of survey" />
          <ul className="list-disc space-y-1 p-5 pl-9 text-sm">{scope.map((s) => <li key={s}>{s}</li>)}</ul>
        </Card>
        <Card>
          <CardHeader title="Customer & contacts" />
          <div className="space-y-3 p-5">
            <DescList cols={2} items={[
              { label: "Requester", value: customerName(rfq.customer) },
              { label: "Survey company", value: j.org.name },
              { label: "Cargo", value: `${rfq.cargoName ?? "—"} (${rfq.cargoQuantity ?? "—"})` },
              { label: "On-site contact", value: rfq.contactPerson ?? "—" },
              { label: "Agent", value: rfq.agentCompanyName ? <>{rfq.agentCompanyName}<a href={`tel:${rfq.agentPhone}`} className="block text-accent-strong">{formatPhone(rfq.agentPhone)}</a></> : "—" },
            ]} />
            {rfq.agentContacts.length > 0 && (
              <ul className="divide-y divide-border rounded-lg border border-border text-sm">
                {rfq.agentContacts.map((c) => (
                  <li key={c.id} className="flex items-center justify-between px-3 py-2">
                    {c.name}
                    {c.phone && <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 text-accent-strong"><Phone className="h-3.5 w-3.5" aria-hidden />{c.phone}</a>}
                  </li>
                ))}
              </ul>
            )}
            {others.length > 0 && <p className="text-[13px] text-muted">Joint inspection with: {others.map((o) => o.surveyor.name).join(", ")}</p>}
            {rfq.jointInspectors.length > 0 && <p className="text-[13px] text-muted">Other parties attending: {rfq.jointInspectors.map((x) => `${x.name} (${x.onBehalfOf})`).join(", ")}</p>}
          </div>
        </Card>
        {a.status !== "REJECTED" && a.status !== "CANCELLED" && rfq.attachments.length > 0 && (
          <Card>
            <CardHeader title="Documents" />
            <ul className="divide-y divide-border">
              {rfq.attachments.map((f) => (
                <li key={f.id}>
                  <a href={signedFileUrl(f.id)} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-5 py-3 text-sm hover:bg-surface-2">
                    <FileText className="h-4 w-4 text-subtle" aria-hidden /> <span className="flex-1 truncate">{f.fileName}</span> <span className="text-xs text-muted">{humanize(f.kind)}</span>
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
