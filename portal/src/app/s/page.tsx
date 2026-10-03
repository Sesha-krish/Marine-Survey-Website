import Link from "next/link";
import { CalendarDays, ChevronRight, ClipboardList, MapPin } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge, EmptyState, StatusPill } from "@/components/ui/misc";
import { customerName, fmtDate, fmtRelative } from "@/lib/format";
import { formatContainer } from "@/lib/iso6346";
import { cn } from "@/lib/cn";
import { RespondButtons } from "./respond";

export const metadata = { title: "My assignments" };

const TABS = [
  { key: "new", label: "New", statuses: ["NEW"] },
  { key: "accepted", label: "Accepted", statuses: ["ACCEPTED"] },
  { key: "progress", label: "In progress", statuses: ["IN_PROGRESS"] },
  { key: "completed", label: "Completed", statuses: ["COMPLETED"] },
  { key: "closed", label: "Rejected / cancelled", statuses: ["REJECTED", "CANCELLED"] },
];

export default async function SurveyorHome({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const u = await requireUser(["SURVEYOR"]);
  const { tab = "new" } = await searchParams;
  if (!u.surveyorId) return <EmptyState title="Your login isn't linked to a surveyor profile" description="Ask the survey company to link your account." />;
  const counts = await db.assignment.groupBy({ by: ["status"], where: { surveyorId: u.surveyorId }, _count: true });
  const current = TABS.find((t) => t.key === tab) ?? TABS[0];
  const list = await db.assignment.findMany({
    where: { surveyorId: u.surveyorId, status: { in: current.statuses } },
    include: { jobOrder: { include: { surveyType: true, org: true, rfq: { include: { customer: true } }, survey: { select: { id: true, status: true } } } } },
    orderBy: current.key === "completed" || current.key === "closed" ? { assignedAt: "desc" } : { jobOrder: { surveyDate: "asc" } },
    take: 50,
  });
  const n = (s: string[]) => counts.filter((c) => s.includes(c.status)).reduce((a, c) => a + c._count, 0);

  return (
    <>
      <h1 className="mb-1 text-xl font-semibold">Hi {u.name.split(" ")[0]}</h1>
      <p className="mb-4 text-sm text-muted">{n(["NEW"])} new · {n(["ACCEPTED", "IN_PROGRESS"])} to do</p>
      <nav className="-mx-3 mb-4 flex gap-2 overflow-x-auto px-3 pb-1" aria-label="Assignment status">
        {TABS.map((t) => (
          <Link key={t.key} href={`/s?tab=${t.key}`} aria-current={t.key === current.key ? "page" : undefined} className={cn("inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium", t.key === current.key ? "border-accent-strong bg-accent-soft text-accent-strong" : "border-border bg-surface text-muted")}>
            {t.label} <span className="tabular-nums text-subtle">{n(t.statuses)}</span>
          </Link>
        ))}
      </nav>
      {list.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface">
          <EmptyState icon={<ClipboardList className="h-6 w-6" />} title={current.key === "new" ? "No new assignments" : `Nothing ${current.label.toLowerCase()}`} description={current.key === "new" ? "You'll get a notification when a survey company assigns you a job." : undefined} />
        </div>
      ) : (
        <ul className="space-y-3">
          {list.map((a) => {
            const j = a.jobOrder;
            return (
              <li key={a.id} className="rounded-xl border border-border bg-surface shadow-card">
                <Link href={`/s/assignments/${a.id}`} className="block p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-wide text-subtle">{j.surveyType.name}</p>
                      <p className="mt-0.5 font-semibold">{j.number} {j.containerNumber && <span className="font-mono text-sm font-normal text-muted">· {formatContainer(j.containerNumber)}</span>}</p>
                    </div>
                    <span className="flex items-center gap-1"><StatusPill status={a.status} /><ChevronRight className="h-4 w-4 text-subtle" aria-hidden /></span>
                  </div>
                  <p className="mt-2 flex items-start gap-1.5 text-sm text-muted"><MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{j.location}</p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-muted"><CalendarDays className="h-4 w-4" aria-hidden />{fmtDate(j.surveyDate)} · for {customerName(j.rfq.customer)}</p>
                  <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-subtle">
                    {j.org.name} {!a.isLead && <Badge tone="slate">Supporting</Badge>} · assigned {fmtRelative(a.assignedAt)}
                  </p>
                  {a.rejectionReason && <p className="mt-1 text-xs text-danger">You declined: {a.rejectionReason}</p>}
                </Link>
                {a.status === "NEW" && (
                  <div className="border-t border-border p-3">
                    <RespondButtons assignmentId={a.id} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
