import { HardHat, Star } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge, Card, EmptyState, PageHeader, StatusPill } from "@/components/ui/misc";
import { DataTable, Pagination, type Column } from "@/components/app/data-table";
import { ListToolbar } from "@/components/app/list-toolbar";
import { ButtonLink } from "@/components/ui/button";
import { ACTIVE_ASSIGNMENT_STATUSES, SURVEYOR_AVAILABILITY } from "@/lib/constants";
import { formatPhone } from "@/lib/countries";
import { listParams, multi, str, type SP } from "@/server/list";
import { SurveyorFormButton } from "./form";

export const metadata = { title: "Surveyors" };

export default async function SurveyorsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requireUser(["VENDOR_ADMIN", "VENDOR_STAFF"]);
  const sp = await searchParams;
  const lp = listParams(sp, { sortable: ["name", "rating", "createdAt"], defaultSort: "name", pageSize: 20 });
  const scope = str(sp, "scope") ?? "mine"; // mine = in-house + own independents; market = marketplace
  const kind = multi(sp, "kind", ["IN_HOUSE", "INDEPENDENT"]);
  const avail = multi(sp, "availability", SURVEYOR_AVAILABILITY);
  const typeId = str(sp, "type");
  const where = {
    ...(scope === "market" ? { orgId: null, kind: "INDEPENDENT" } : { orgId: u.orgId }),
    ...(kind.length ? { kind: { in: kind } } : {}),
    ...(avail.length ? { availability: { in: avail } } : {}),
    ...(typeId ? { capabilities: { some: { surveyTypeId: typeId } } } : {}),
    ...(lp.q ? { OR: [{ name: { contains: lp.q } }, { email: { contains: lp.q } }, { phone: { contains: lp.q.replace(/\s/g, "") } }, { baseLocation: { contains: lp.q } }, { coverage: { contains: lp.q } }] } : {}),
  };
  const [total, rows, types] = await Promise.all([
    db.surveyor.count({ where }),
    db.surveyor.findMany({
      where, orderBy: { [lp.sortKey]: lp.sortKey === "name" ? (lp.dir === "desc" && sp.sort ? "desc" : "asc") : lp.dir }, skip: lp.skip, take: lp.take,
      include: { capabilities: { include: { surveyType: true } }, _count: { select: { assignments: { where: { status: { in: ACTIVE_ASSIGNMENT_STATUSES } } } } } },
    }),
    db.surveyType.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);
  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    { key: "name", header: "Surveyor", sortable: true, primary: true, cell: (s) => s.name },
    { key: "kind", header: "Type", cell: (s) => <Badge tone={s.kind === "IN_HOUSE" ? "blue" : "violet"}>{s.kind === "IN_HOUSE" ? "In-house" : "Independent"}</Badge> },
    { key: "contact", header: "Contact", cell: (s) => <span className="whitespace-nowrap">{formatPhone(s.phone)}<span className="block text-xs text-subtle">{s.email}</span></span> },
    { key: "base", header: "Base / coverage", cell: (s) => <span className="line-clamp-2 max-w-48">{s.baseLocation ?? "—"}<span className="block text-xs text-subtle">{s.coverage}</span></span> },
    { key: "caps", header: "Survey types", mobileHidden: true, cell: (s) => <span className="line-clamp-2 max-w-56 text-[13px]">{s.capabilities.map((c) => c.surveyType.name).join(", ") || "—"}</span> },
    { key: "workload", header: "Active jobs", cell: (s) => s._count.assignments },
    { key: "rating", header: "Rating", sortable: true, cell: (s) => <span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5 text-warning" aria-hidden />{s.rating.toFixed(1)}</span> },
    { key: "availability", header: "Availability", cell: (s) => <span className="flex flex-wrap gap-1"><StatusPill status={s.availability} />{s.userId && <Badge tone="teal">App login</Badge>}</span> },
  ];
  return (
    <>
      <PageHeader title="Surveyors" description="Your in-house team, your independent surveyors, and the independent marketplace." actions={<SurveyorFormButton types={types.map((t) => ({ id: t.id, name: t.name }))} />} />
      <nav className="mb-4 flex gap-2" aria-label="Surveyor scope">
        {[["mine", "My surveyors"], ["market", "Independent marketplace"]].map(([k, l]) => (
          <a key={k} href={`/surveyors?scope=${k}`} aria-current={scope === k ? "page" : undefined} className={`inline-flex h-8 items-center rounded-full border px-3 text-[13px] font-medium ${scope === k ? "border-accent-strong bg-accent-soft text-accent-strong" : "border-border bg-surface text-muted hover:text-text"}`}>{l}</a>
        ))}
      </nav>
      <Card>
        <ListToolbar
          listKey="surveyors"
          searchPlaceholder="Search name, mobile, email, location"
          total={total}
          dateRange={false}
          filters={[
            ...(scope === "mine" ? [{ key: "kind", label: "Type", type: "multi" as const, options: ["IN_HOUSE", "INDEPENDENT"] as const, labels: { IN_HOUSE: "In-house", INDEPENDENT: "Independent" } }] : []),
            { key: "availability", label: "Availability", type: "multi", options: SURVEYOR_AVAILABILITY },
            { key: "type", label: "Qualified for", type: "select", options: types.map((t) => ({ value: t.id, label: t.name })) },
          ]}
        />
        <DataTable
          caption="Surveyors"
          columns={columns}
          rows={rows}
          searchParams={sp}
          rowHref={(s) => `/surveyors/${s.id}`}
          actions={(s) => <ButtonLink href={`/surveyors/${s.id}`} variant="ghost" size="sm">Profile</ButtonLink>}
          empty={<EmptyState icon={<HardHat className="h-6 w-6" />} title="No surveyors match" description="Add your in-house surveyors, or independents you work with regularly." />}
        />
        <Pagination page={lp.page} pageSize={lp.pageSize} total={total} searchParams={sp} />
      </Card>
    </>
  );
}
