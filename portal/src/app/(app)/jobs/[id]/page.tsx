import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Alert, Badge, Card, CardHeader, DescList, PageHeader, StatusPill } from "@/components/ui/misc";
import { Timeline } from "@/components/app/timeline";
import { AllocationButton } from "@/components/app/allocation-drawer";
import { SurveyAnswersView } from "@/components/app/survey-view";
import { REPORT_STAGE_LABEL, humanize, type ReportStage } from "@/lib/constants";
import { formatPhone } from "@/lib/countries";
import { customerName, fmtDate, fmtDateTime, fmtMoney } from "@/lib/format";
import { formatContainer } from "@/lib/iso6346";
import type { TemplateSchema } from "@/lib/templates/types";
import { JobActions, ReviewSurvey, WithdrawAssignment } from "./client";

export const metadata = { title: "Job Order" };

export default async function JobDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ allocate?: string }> }) {
  const u = await requireUser(["VENDOR_ADMIN", "VENDOR_STAFF"]);
  const { id } = await params;
  const sp = await searchParams;
  const job = await db.jobOrder.findFirst({
    where: { id, orgId: u.orgId },
    include: {
      org: true,
      surveyType: { include: { subCategory: { include: { category: true } } } },
      rfqLine: true,
      rfq: { include: { customer: true } },
      assignments: { include: { surveyor: true }, orderBy: { assignedAt: "asc" } },
      survey: { include: { template: true, photos: true, reports: { orderBy: { createdAt: "asc" } } } },
    },
  });
  if (!job) notFound();
  const entityIds = [job.id, ...job.assignments.map((a) => a.id), ...(job.survey ? [job.survey.id, ...job.survey.reports.map((r) => r.id)] : [])];
  const events = await db.auditLog.findMany({ where: { entityId: { in: entityIds } }, orderBy: { createdAt: "desc" } });
  const scope = job.rfqLine ? [...(JSON.parse(job.rfqLine.scope) as string[]), ...(job.rfqLine.scopeOther ? [`Other: ${job.rfqLine.scopeOther}`] : [])] : [];
  const canAllocate = ["NEW", "ASSIGNED"].includes(job.status) && !["NEW", "DECLINED", "CANCELLED"].includes(job.rfq.status);
  const hasRejected = job.assignments.some((a) => a.status === "REJECTED");
  const s = job.survey;

  return (
    <>
      <PageHeader
        breadcrumb={<><Link href="/jobs" className="hover:underline">Job Orders</Link> / <Link href={`/rfqs/${job.rfqId}`} className="hover:underline">{job.rfq.number}</Link></>}
        title={<span className="flex flex-wrap items-center gap-3">{job.number} <StatusPill status={job.status} /></span>}
        description={`${job.surveyType.name} · ${formatContainer(job.containerNumber)} · ${job.location}`}
        actions={
          <>
            {canAllocate && <AllocationButton jobs={[{ id: job.id, number: job.number, type: job.surveyType.name, location: job.location }]} label={job.status === "NEW" ? (hasRejected ? "Reassign surveyor" : "Allocate surveyor") : "Add joint surveyor"} size="md" autoOpen={sp.allocate === "1" && job.status === "NEW"} />}
            <JobActions job={{ id: job.id, status: job.status, containerNumber: job.containerNumber ?? "", surveyDate: job.surveyDate.toISOString(), location: job.location }} />
          </>
        }
      />
      {job.status === "NEW" && hasRejected && <Alert tone="danger" className="mb-4" title="The last surveyor rejected this job">Reassign it — the RFQ is still active and the rejected assignment is kept in the history below.</Alert>}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Job order" />
            <div className="p-5">
              <DescList cols={3} items={[
                { label: "Job ID", value: job.number },
                { label: "Requester", value: customerName(job.rfq.customer) },
                { label: "Vendor", value: job.org.name },
                { label: "Date of survey", value: fmtDate(job.surveyDate) },
                { label: "Survey area / spot", value: `${humanize(job.rfq.surveyArea)} — ${job.rfq.areaName}` },
                { label: "Location of survey", value: job.location },
                { label: "Category", value: job.surveyType.subCategory.category.name },
                { label: "Sub category", value: job.surveyType.subCategory.name },
                { label: "Type of survey", value: job.surveyType.name },
                { label: "Container", value: <span className="font-mono">{formatContainer(job.containerNumber)}</span> },
                { label: "Bulk verdict", value: job.bulkVerdict ? <StatusPill status={job.bulkVerdict} /> : "—" },
                { label: "Scope of survey", value: <ul className="list-disc space-y-0.5 pl-4">{scope.map((x) => <li key={x}>{x}</li>)}</ul>, wide: true },
              ]} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Assignments" description="Full history: who was offered the job, who rejected, who accepted and completed it." />
            {job.assignments.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted">No surveyor allocated yet.</p>
            ) : (
              <ol className="divide-y divide-border">
                {job.assignments.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
                    <div className="min-w-0 text-sm">
                      <p className="flex flex-wrap items-center gap-2">
                        <Link href={`/surveyors/${a.surveyorId}`} className="font-semibold hover:underline">{a.surveyor.name}</Link>
                        <Badge tone={a.surveyor.kind === "IN_HOUSE" ? "blue" : "violet"}>{a.surveyor.kind === "IN_HOUSE" ? "In-house" : "Independent"}</Badge>
                        {a.isLead && <Badge tone="teal">Lead</Badge>}
                        <StatusPill status={a.status} />
                      </p>
                      <p className="mt-0.5 text-xs text-muted">
                        {a.number} · assigned {fmtDateTime(a.assignedAt)}
                        {a.respondedAt && ` · responded ${fmtDateTime(a.respondedAt)}`}
                        {a.startedAt && ` · started ${fmtDateTime(a.startedAt)}`}
                        {a.completedAt && ` · completed ${fmtDateTime(a.completedAt)}`}
                        {a.fee != null && ` · fee ${fmtMoney(a.fee)}`}
                        {` · ${formatPhone(a.surveyor.phone)}`}
                      </p>
                      {a.rejectionReason && <p className="mt-1 text-[13px] text-danger">Rejected: “{a.rejectionReason}”</p>}
                      {a.instructions && <p className="mt-1 text-[13px] text-muted">Instructions: {a.instructions}</p>}
                    </div>
                    {["NEW", "ACCEPTED"].includes(a.status) && <WithdrawAssignment id={a.id} name={a.surveyor.name} />}
                  </li>
                ))}
              </ol>
            )}
          </Card>

          {s && (
            <Card id="survey">
              <CardHeader
                title={<span className="flex items-center gap-2">Survey {s.number} <StatusPill status={s.status} /></span>}
                description={`${s.template.name} template v${s.template.version}${s.submittedAt ? ` · submitted ${fmtDateTime(s.submittedAt)}` : ""}`}
                actions={<ReviewSurvey surveyId={s.id} status={s.status} />}
              />
              <div className="p-5">
                {s.status === "NOT_STARTED" ? (
                  <p className="text-sm text-muted">The surveyor hasn&apos;t started yet. Data appears here as soon as they save progress.</p>
                ) : (
                  <SurveyAnswersView schema={JSON.parse(s.template.schema) as TemplateSchema} answers={JSON.parse(s.answers)} photos={s.photos} verdict={s.verdict} verdictReason={s.verdictReason} compact />
                )}
                {s.completionNotes && <p className="mt-4 text-sm"><span className="font-semibold">Completion notes:</span> {s.completionNotes}</p>}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {s && s.reports.length > 0 && (
            <Card>
              <CardHeader title="Reports" />
              <ul className="divide-y divide-border">
                {s.reports.map((r) => (
                  <li key={r.id}>
                    <Link href={`/reports/${r.id}`} className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm hover:bg-surface-2">
                      <span>{REPORT_STAGE_LABEL[r.stage as ReportStage]} <span className="text-subtle">v{r.currentVersion}</span></span>
                      <StatusPill status={r.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card>
            <CardHeader title="Activity" />
            <div className="p-5"><Timeline events={events} /></div>
          </Card>
        </div>
      </div>
    </>
  );
}
