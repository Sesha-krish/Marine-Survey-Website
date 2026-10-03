import Link from "next/link";
import { notFound } from "next/navigation";
import { Star } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Alert, Badge, Card, CardHeader, DescList, PageHeader, StatusPill } from "@/components/ui/misc";
import { formatPhone } from "@/lib/countries";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/format";
import { humanize } from "@/lib/constants";
import { signedFileUrl } from "@/lib/storage";
import { SurveyorFormButton } from "../form";
import { ActiveToggle, KycForm, KycReview, RateForm, RateDelete } from "./client";

export const metadata = { title: "Surveyor" };

export default async function SurveyorPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(["VENDOR_ADMIN", "VENDOR_STAFF"]);
  const { id } = await params;
  const s = await db.surveyor.findFirst({
    where: { id, OR: [{ orgId: u.orgId }, { orgId: null, kind: "INDEPENDENT" }] },
    include: {
      capabilities: { include: { surveyType: true } },
      rates: { include: { surveyType: true }, orderBy: [{ surveyTypeId: "asc" }, { effectiveFrom: "desc" }] },
      documents: { orderBy: { createdAt: "desc" } },
      user: { select: { email: true, lastLoginAt: true, active: true } },
    },
  });
  if (!s) notFound();
  const mine = s.orgId === u.orgId;
  // Assignment history is always limited to THIS vendor's jobs, even for marketplace surveyors.
  const [assignments, types] = await Promise.all([
    db.assignment.findMany({ where: { surveyorId: s.id, jobOrder: { orgId: u.orgId } }, include: { jobOrder: { include: { surveyType: true, rfq: true } } }, orderBy: { assignedAt: "desc" }, take: 50 }),
    db.surveyType.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  const stats = {
    accepted: assignments.filter((a) => ["ACCEPTED", "IN_PROGRESS", "COMPLETED"].includes(a.status)).length,
    rejected: assignments.filter((a) => a.status === "REJECTED").length,
    completed: assignments.filter((a) => a.status === "COMPLETED").length,
    active: assignments.filter((a) => ["NEW", "ACCEPTED", "IN_PROGRESS"].includes(a.status)).length,
  };
  const today = new Date();

  return (
    <>
      <PageHeader
        breadcrumb={<Link href="/surveyors" className="hover:underline">Surveyors</Link>}
        title={<span className="flex flex-wrap items-center gap-2">{s.name} <Badge tone={s.kind === "IN_HOUSE" ? "blue" : "violet"}>{s.kind === "IN_HOUSE" ? "In-house" : "Independent"}</Badge><StatusPill status={s.availability} /></span>}
        description={`${s.baseLocation ?? "No base location"} · ${formatPhone(s.phone)} · ${s.email}`}
        actions={mine ? (
          <>
            <ActiveToggle id={s.id} active={s.active} />
            <SurveyorFormButton id={s.id} hasLogin={!!s.userId} types={types.map((t) => ({ id: t.id, name: t.name }))} initial={{ kind: s.kind, name: s.name, email: s.email, phone: s.phone, availability: s.availability, baseLocation: s.baseLocation ?? "", coverage: s.coverage ?? "", notes: s.notes ?? "", capabilities: s.capabilities.map((c) => c.surveyTypeId) }} />
          </>
        ) : undefined}
      />
      {!mine && <Alert tone="info" className="mb-4">Marketplace surveyor — profile managed by the platform. You see only your own jobs with them.</Alert>}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-5">
        {[["Active jobs", stats.active], ["Accepted", stats.accepted], ["Completed", stats.completed], ["Rejected", stats.rejected]].map(([l, n]) => (
          <Card key={l as string} className="p-4"><p className="text-xs text-muted">{l}</p><p className="mt-1 text-2xl font-semibold">{n}</p></Card>
        ))}
        <Card className="p-4"><p className="text-xs text-muted">Rating</p><p className="mt-1 flex items-center gap-1 text-2xl font-semibold"><Star className="h-5 w-5 text-warning" aria-hidden />{s.rating.toFixed(1)}</p></Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Rate card" description="What you pay this surveyor, per survey type and location. The newest effective rate applies." actions={mine ? <RateForm surveyorId={s.id} types={types.map((t) => ({ id: t.id, name: t.name }))} /> : undefined} />
            {s.rates.length === 0 ? <p className="px-5 py-6 text-sm text-muted">No rates recorded.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">Rates</caption>
                  <thead><tr className="bg-surface-2 text-left text-xs uppercase tracking-wide text-subtle"><th scope="col" className="px-5 py-2">Survey type</th><th scope="col" className="px-5 py-2">Location</th><th scope="col" className="px-5 py-2 text-right">Amount</th><th scope="col" className="px-5 py-2">Effective from</th><th scope="col" className="px-5 py-2"><span className="sr-only">Actions</span></th></tr></thead>
                  <tbody>
                    {s.rates.map((r) => (
                      <tr key={r.id} className="border-t border-border">
                        <td className="px-5 py-2">{r.surveyType.name}</td>
                        <td className="px-5 py-2">{r.location}</td>
                        <td className="px-5 py-2 text-right tabular-nums">{fmtMoney(r.amount, r.currency)}</td>
                        <td className="px-5 py-2">{fmtDate(r.effectiveFrom)}{r.effectiveFrom > today && <Badge tone="amber" className="ml-1">Future</Badge>}</td>
                        <td className="px-5 py-2 text-right">{mine && <RateDelete surveyorId={s.id} rateId={r.id} />}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <Card>
            <CardHeader title="Assignment history" description="With your company only." />
            {assignments.length === 0 ? <p className="px-5 py-6 text-sm text-muted">No assignments yet.</p> : (
              <ul className="divide-y divide-border">
                {assignments.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm">
                    <span><Link href={`/jobs/${a.jobOrderId}`} className="font-medium text-accent-strong hover:underline">{a.jobOrder.number}</Link> <span className="text-muted">· {a.jobOrder.surveyType.name} · {a.jobOrder.rfq.number} · {fmtDate(a.assignedAt)}</span>{a.rejectionReason && <span className="block text-xs text-danger">“{a.rejectionReason}”</span>}</span>
                    <StatusPill status={a.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Profile" />
            <div className="p-5">
              <DescList cols={1} items={[
                { label: "Coverage", value: s.coverage ?? "—" },
                { label: "Qualified for", value: s.capabilities.map((c) => c.surveyType.name).join(", ") || "—" },
                { label: "App login", value: s.user ? `${s.user.email}${s.user.lastLoginAt ? ` · last seen ${fmtDateTime(s.user.lastLoginAt)}` : " · never signed in"}` : "No login" },
                { label: "Notes", value: s.notes ?? "—" },
              ]} />
            </div>
          </Card>
          <Card>
            <CardHeader title="KYC documents" actions={mine ? <KycForm surveyorId={s.id} /> : undefined} />
            {s.documents.length === 0 ? <p className="px-5 py-6 text-sm text-muted">No documents.</p> : (
              <ul className="divide-y divide-border">
                {s.documents.map((d) => {
                  const expired = d.expiresAt && d.expiresAt < today;
                  return (
                    <li key={d.id} className="px-5 py-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{humanize(d.docType)} · {d.docNumber}</span>
                        <StatusPill status={expired ? "EXPIRED" : d.status} />
                      </div>
                      <p className="text-xs text-muted">{d.expiresAt ? `Expires ${fmtDate(d.expiresAt)}` : "No expiry"}{d.reviewedAt ? ` · reviewed ${fmtDate(d.reviewedAt)}` : ""}</p>
                      <div className="mt-1 flex gap-3">
                        {d.attachmentId && <a href={signedFileUrl(d.attachmentId)} target="_blank" rel="noreferrer" className="text-xs font-medium text-accent-strong hover:underline">View file</a>}
                        {mine && u.role === "VENDOR_ADMIN" && d.status === "PENDING" && <KycReview surveyorId={s.id} docId={d.id} />}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
