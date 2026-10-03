import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, Paperclip } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Alert, Badge, Card, CardHeader, DemoBadge, DescList, EmptyState, PageHeader, StatusPill } from "@/components/ui/misc";
import { LinkTabs } from "@/components/ui/tabs";
import { Timeline } from "@/components/app/timeline";
import { AllocationButton } from "@/components/app/allocation-drawer";
import { ACTIVE_ASSIGNMENT_STATUSES, REPORT_STAGE_LABEL, humanize, type ReportStage } from "@/lib/constants";
import { countryName, formatPhone } from "@/lib/countries";
import { customerName, fmtDate, fmtDateTime, fmtMoney } from "@/lib/format";
import { formatContainer } from "@/lib/iso6346";
import { signedFileUrl } from "@/lib/storage";
import { ButtonLink } from "@/components/ui/button";
import { AttachmentUpload, BulkSurveyGrid, JobsAllocateBar, RfqActions } from "./client";
import { InvoiceCreateButton } from "../../invoices/create";

export const metadata = { title: "RFQ" };

export default async function RfqDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; created?: string }> }) {
  const u = await requireUser(["VENDOR_ADMIN", "VENDOR_STAFF"]);
  const { id } = await params;
  const sp = await searchParams;
  const rfq = await db.rfq.findFirst({
    where: { id, orgId: u.orgId },
    include: {
      customer: true,
      lines: { include: { surveyType: { include: { subCategory: { include: { category: true } } } } } },
      jointInspectors: true,
      agentContacts: true,
      attachments: { orderBy: { createdAt: "asc" } },
      jobOrders: {
        orderBy: { number: "asc" },
        include: {
          surveyType: true,
          assignments: { include: { surveyor: true }, orderBy: { assignedAt: "asc" } },
          survey: { include: { reports: { orderBy: { stage: "asc" } } } },
        },
      },
      invoices: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!rfq) notFound();
  const [creator, events] = await Promise.all([
    db.user.findUnique({ where: { id: rfq.createdById }, select: { firstName: true, lastName: true } }),
    db.auditLog.findMany({ where: { rfqId: rfq.id }, orderBy: { createdAt: "desc" } }),
  ]);

  const tab = sp.tab ?? "overview";
  const showBulk = rfq.jobOrders.length > 0;
  const reportsCount = rfq.jobOrders.reduce((s, j) => s + (j.survey?.reports.length ?? 0), 0);
  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "allocation", label: "Survey Allocation", count: rfq.jobOrders.length },
    ...(showBulk ? [{ key: "bulk", label: "Bulk Survey" }] : []),
    { key: "reports", label: "Reports", count: reportsCount },
    { key: "invoices", label: "Invoices", count: rfq.invoices.length },
    { key: "activity", label: "Activity", count: events.length },
  ];
  const open = !["COMPLETED", "DECLINED", "CANCELLED"].includes(rfq.status);

  return (
    <>
      <PageHeader
        breadcrumb={<Link href="/rfqs" className="hover:underline">RFQs</Link>}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {rfq.number} <StatusPill status={rfq.status} />
            {rfq.isDemo && <DemoBadge />}
          </span>
        }
        description={
          <>
            {customerName(rfq.customer)} · received {fmtDateTime(rfq.requestReceivedAt)} via {humanize(rfq.requestSource)}
            {rfq.legacyNumber && <> · legacy ID {rfq.legacyNumber}</>}
          </>
        }
        actions={
          <RfqActions
            rfq={{ id: rfq.id, number: rfq.number, status: rfq.status, creditsCharged: rfq.creditsCharged }}
            lines={rfq.lines.map((l) => ({ id: l.id, name: l.surveyType.name, quantity: l.quantity, containerized: ["COC", "TS", "TU", "FB", "FRL", "OT"].includes(l.surveyType.code) }))}
          />
        }
      />

      {sp.created && <Alert tone="success" className="mb-4" title={`RFQ ${rfq.number} created`}>It&apos;s in your RFQ list with status New. Review it, then Accept to generate job orders and allocate surveyors.</Alert>}
      {rfq.status === "NEW" && !sp.created && <Alert tone="info" className="mb-4" title="Waiting for your decision">Accept to generate {rfq.lines.reduce((s, l) => s + l.quantity, 0)} job order(s), or Decline with a reason.</Alert>}
      {rfq.declineReason && <Alert tone="warning" className="mb-4" title={rfq.status === "DECLINED" ? "Declined" : "Cancelled"}>{rfq.declineReason}</Alert>}

      <LinkTabs tabs={tabs} active={tab} base={`/rfqs/${rfq.id}`} label="RFQ sections" />

      <div className="mt-6">
        {tab === "overview" && (
          <div className="grid gap-6 xl:grid-cols-3">
            <div className="space-y-6 xl:col-span-2">
              <Card>
                <CardHeader title="Survey details" />
                <div className="p-5">
                  <DescList cols={3} items={[
                    { label: "Survey area / spot", value: humanize(rfq.surveyArea) },
                    { label: "Area name", value: rfq.areaName },
                    { label: "Date of survey", value: fmtDate(rfq.surveyDate) },
                    { label: "Location of survey", value: <>{rfq.locationName}{rfq.lat != null && <span className="block text-xs text-subtle">{rfq.lat.toFixed(4)}, {rfq.lng?.toFixed(4)}</span>}</>, wide: true },
                    { label: "Estimated rate", value: fmtMoney(rfq.estimatedRate, rfq.currency) },
                    { label: "Acting on behalf of", value: rfq.actingOnBehalfOf ?? "—" },
                    { label: "P&I Club", value: rfq.piClub ?? "—" },
                    { label: "Payment terms", value: <span className="whitespace-pre-line">{rfq.paymentTerms}</span>, wide: true },
                  ]} />
                </div>
              </Card>
              <Card>
                <CardHeader title="Survey types & cargo" description={`Cargo: ${rfq.cargoName ?? "—"} · ${rfq.cargoQuantity ?? "—"}`} />
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <caption className="sr-only">Survey lines</caption>
                    <thead><tr className="bg-surface-2 text-left text-xs uppercase tracking-wide text-subtle"><th scope="col" className="px-5 py-2">Category</th><th scope="col" className="px-5 py-2">Type of survey</th><th scope="col" className="px-5 py-2">Qty</th><th scope="col" className="px-5 py-2">Scope</th></tr></thead>
                    <tbody>
                      {rfq.lines.map((l) => {
                        const scope = [...(JSON.parse(l.scope) as string[]), ...(l.scopeOther ? [`Other: ${l.scopeOther}`] : [])];
                        return (
                          <tr key={l.id} className="border-t border-border align-top">
                            <td className="px-5 py-3 text-muted">{l.surveyType.subCategory.category.name}<span className="block text-xs">{l.surveyType.subCategory.name}</span></td>
                            <td className="px-5 py-3 font-medium">{l.surveyType.name}</td>
                            <td className="px-5 py-3 tabular-nums">{l.quantity}</td>
                            <td className="px-5 py-3"><ul className="list-disc space-y-0.5 pl-4 text-[13px] text-muted">{scope.map((s) => <li key={s}>{s}</li>)}</ul></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
              <Card>
                <CardHeader title="Agent details" />
                <div className="space-y-4 p-5">
                  <DescList items={[
                    { label: "Company", value: rfq.agentCompanyName },
                    { label: "Email", value: rfq.agentEmail },
                    { label: "Phone", value: formatPhone(rfq.agentPhone) },
                    { label: "Address", value: rfq.agentAddress },
                  ]} />
                  {rfq.agentContacts.length > 0 && (
                    <ul className="divide-y divide-border rounded-lg border border-border text-sm">
                      {rfq.agentContacts.map((c) => <li key={c.id} className="px-3 py-2">{c.name} <span className="text-muted">{[c.phone, c.email].filter(Boolean).join(" · ")}</span></li>)}
                    </ul>
                  )}
                </div>
              </Card>
              {rfq.jointInspection && (
                <Card>
                  <CardHeader title="Surveyor / joint inspection" />
                  <ul className="divide-y divide-border text-sm">
                    {rfq.jointInspectors.map((j) => <li key={j.id} className="px-5 py-2.5">{j.name} <span className="text-muted">· {j.onBehalfOf} ({j.role})</span></li>)}
                  </ul>
                </Card>
              )}
            </div>
            <div className="space-y-6">
              <Card>
                <CardHeader title="Customer" actions={<ButtonLink href={`/customers?q=${encodeURIComponent(customerName(rfq.customer))}`} variant="ghost" size="sm">Open</ButtonLink>} />
                <div className="p-5">
                  <DescList cols={1} items={[
                    { label: "Name", value: customerName(rfq.customer) },
                    { label: "Email", value: rfq.customer.email },
                    { label: "Mobile", value: formatPhone(rfq.customer.phone) },
                    { label: "Address", value: [rfq.customer.address1, rfq.customer.city, rfq.customer.state, countryName(rfq.customer.country)].filter(Boolean).join(", ") },
                    { label: "GSTIN / Tax ID", value: rfq.customer.taxId ?? "—" },
                  ]} />
                </div>
              </Card>
              <Card>
                <CardHeader title="Request intake" />
                <div className="p-5">
                  <DescList cols={1} items={[
                    { label: "Source", value: humanize(rfq.requestSource) },
                    { label: "Received", value: fmtDateTime(rfq.requestReceivedAt) },
                    { label: "Contact", value: [rfq.contactPerson, rfq.contactDetails].filter(Boolean).join(" · ") || "—" },
                    { label: "Notes", value: rfq.initialNotes ?? "—" },
                    { label: "Created by", value: `${creator?.firstName ?? ""} ${creator?.lastName ?? ""} · ${fmtDateTime(rfq.createdAt)}` },
                    { label: "Credits charged", value: rfq.creditsCharged },
                  ]} />
                </div>
              </Card>
              <Card>
                <CardHeader title="Attachments" actions={<AttachmentUpload rfqId={rfq.id} />} />
                {rfq.attachments.length === 0 ? (
                  <p className="px-5 py-6 text-sm text-muted">No attachments. Upload the appointment letter to keep the paper trail with the RFQ.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {rfq.attachments.map((a) => (
                      <li key={a.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                        <Paperclip className="h-4 w-4 shrink-0 text-subtle" aria-hidden />
                        <span className="min-w-0 flex-1">
                          <a href={signedFileUrl(a.id)} target="_blank" rel="noreferrer" className="block truncate font-medium text-accent-strong hover:underline">{a.fileName}</a>
                          <span className="text-xs text-muted">{humanize(a.kind)} · {(a.size / 1024).toFixed(0)} KB · {fmtDate(a.createdAt)}</span>
                        </span>
                        <a href={signedFileUrl(a.id, 900, true)} className="text-xs font-medium text-accent-strong hover:underline">Download</a>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          </div>
        )}

        {tab === "allocation" && (
          <Card>
            <CardHeader
              title="Survey allocation"
              description="One row per job order. Assign in-house or independent surveyors; rejected assignments stay in the history."
              actions={open && rfq.status !== "NEW" ? <JobsAllocateBar jobs={rfq.jobOrders.filter((j) => j.status === "NEW").map((j) => ({ id: j.id, number: j.number, type: j.surveyType.name, location: j.location }))} /> : undefined}
            />
            {rfq.jobOrders.length === 0 ? (
              <EmptyState icon={<FileText className="h-6 w-6" />} title={rfq.status === "NEW" ? "No job orders yet" : "No job orders"} description={rfq.status === "NEW" ? "Accept this RFQ to generate one job order per unit on each survey line." : "This RFQ was closed before job orders were created."} />
            ) : (
              <ul className="divide-y divide-border">
                {rfq.jobOrders.map((j) => {
                  const active = j.assignments.filter((a) => (ACTIVE_ASSIGNMENT_STATUSES as string[]).includes(a.status) || a.status === "COMPLETED");
                  const history = j.assignments.filter((a) => !active.includes(a));
                  return (
                    <li key={j.id} className="px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <Link href={`/jobs/${j.id}`} className="font-semibold text-accent-strong hover:underline">{j.number}</Link>
                          <span className="ml-2"><StatusPill status={j.status} /></span>
                          <p className="mt-0.5 text-[13px] text-muted">{j.surveyType.name} · {formatContainer(j.containerNumber)} · {j.location} · {fmtDate(j.surveyDate)}</p>
                        </div>
                        {["NEW", "ASSIGNED"].includes(j.status) && <AllocationButton jobs={[{ id: j.id, number: j.number, type: j.surveyType.name, location: j.location }]} label={j.status === "NEW" ? (history.some((h) => h.status === "REJECTED") ? "Reassign" : "Allocate") : "Add surveyor"} variant={j.status === "NEW" ? "primary" : "outline"} />}
                      </div>
                      {j.assignments.length > 0 && (
                        <ol className="mt-3 space-y-1.5 border-l-2 border-border pl-3 text-[13px]">
                          {j.assignments.map((a) => (
                            <li key={a.id} className="flex flex-wrap items-center gap-2">
                              <span className="font-medium">{a.surveyor.name}</span>
                              <Badge tone={a.surveyor.kind === "IN_HOUSE" ? "blue" : "violet"}>{a.surveyor.kind === "IN_HOUSE" ? "In-house" : "Independent"}</Badge>
                              <StatusPill status={a.status} />
                              <span className="text-subtle">{a.number} · {fmtDateTime(a.assignedAt)}</span>
                              {a.rejectionReason && <span className="text-danger">“{a.rejectionReason}”</span>}
                            </li>
                          ))}
                        </ol>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        )}

        {tab === "bulk" && (
          <BulkSurveyGrid
            rfqId={rfq.id}
            rows={rfq.jobOrders.map((j) => ({
              jobId: j.id,
              number: j.number,
              type: j.surveyType.name,
              surveyor: j.assignments.filter((a) => a.status !== "REJECTED" && a.status !== "CANCELLED").map((a) => a.surveyor.name).join(", ") || "—",
              containerNumber: j.containerNumber ?? "",
              verdict: (j.bulkVerdict ?? "") as "" | "FIT" | "UNFIT",
              locked: ["COMPLETED", "CANCELLED"].includes(j.status),
            }))}
          />
        )}

        {tab === "reports" && (
          <Card>
            <CardHeader title="Reports" description="Generated from submitted survey data. Issued versions are locked; changes go through tracked amendments." />
            {reportsCount === 0 ? (
              <EmptyState icon={<FileText className="h-6 w-6" />} title="No reports yet" description="Reports are generated automatically when a surveyor submits a completed survey." />
            ) : (
              <ul className="divide-y divide-border">
                {rfq.jobOrders.filter((j) => j.survey?.reports.length).map((j) => (
                  <li key={j.id} className="px-5 py-3">
                    <p className="text-sm font-semibold">{j.number} <span className="font-normal text-muted">· {j.surveyType.name} · {formatContainer(j.containerNumber)}</span></p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {j.survey!.reports.map((r) => (
                        <Link key={r.id} href={`/reports/${r.id}`} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-[13px] hover:bg-surface-2">
                          {REPORT_STAGE_LABEL[r.stage as ReportStage]} <StatusPill status={r.status} /> <span className="text-subtle">v{r.currentVersion}</span>
                        </Link>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {tab === "invoices" && (
          <Card>
            <CardHeader
              title="Invoices"
              description="Invoice one job, several, or the whole RFQ on one document."
              actions={!["NEW", "DECLINED", "CANCELLED"].includes(rfq.status) ? <InvoiceCreateButton rfq={{ id: rfq.id, number: rfq.number, currency: rfq.currency, estimatedRate: rfq.estimatedRate, customerGstin: rfq.customer.taxId, customerState: rfq.customer.country === "IN" ? rfq.customer.state : null }} jobs={rfq.jobOrders.filter((j) => j.status !== "CANCELLED").map((j) => ({ id: j.id, number: j.number, type: j.surveyType.name, container: j.containerNumber }))} /> : undefined}
            />
            {rfq.invoices.length === 0 ? (
              <EmptyState icon={<FileText className="h-6 w-6" />} title="No invoices yet" description={rfq.status === "NEW" ? "Accept the RFQ first." : "Raise a GST invoice for completed work."} />
            ) : (
              <ul className="divide-y divide-border">
                {rfq.invoices.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                    <Link href={`/invoices/${i.id}`} className="font-semibold text-accent-strong hover:underline">{i.number}</Link>
                    <span className="text-muted">Due {fmtDate(i.dueDate)}</span>
                    <span className="tabular-nums">{fmtMoney(i.total, i.currency)}</span>
                    <StatusPill status={i.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {tab === "activity" && (
          <Card>
            <CardHeader title="Activity timeline" description="Every change on this RFQ, its job orders, assignments, surveys, reports and invoices." />
            <div className="p-5">
              <Timeline events={events} />
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
