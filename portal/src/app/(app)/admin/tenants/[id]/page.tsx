import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardHeader, DescList, PageHeader } from "@/components/ui/misc";
import { Timeline } from "@/components/app/timeline";
import { fmtDateTime } from "@/lib/format";
import { humanize } from "@/lib/constants";
import { CreditAdjust, OverrideEditor, SuspendTenant } from "./client";

export const metadata = { title: "Tenant" };

export default async function TenantPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser(["PLATFORM_ADMIN"]);
  const { id } = await params;
  const org = await db.organization.findUnique({ where: { id }, include: { users: true, rateOverrides: true } });
  if (!org) notFound();
  const [types, ledger, events] = await Promise.all([
    db.surveyType.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.creditLedger.findMany({ where: { orgId: id }, orderBy: { createdAt: "desc" }, take: 10 }),
    db.auditLog.findMany({ where: { orgId: id }, orderBy: { createdAt: "desc" }, take: 15 }),
  ]);
  const active = org.users.some((u) => u.active);
  return (
    <>
      <PageHeader breadcrumb={<Link href="/admin/tenants" className="hover:underline">Tenants</Link>} title={org.name} description={`${org.kind} · ${org.users.length} users · ${org.creditBalance} credits`} actions={<SuspendTenant orgId={org.id} active={active} />} />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Details" />
          <div className="p-5">
            <DescList items={[
              { label: "GSTIN", value: org.gstin ?? "—" },
              { label: "Location", value: [org.city, org.state].filter(Boolean).join(", ") || "—" },
              { label: "Home currency", value: org.homeCurrency },
              { label: "Users", value: org.users.map((u) => `${u.firstName} (${humanize(u.role)})`).join(", "), wide: true },
            ]} />
          </div>
        </Card>
        {org.kind === "VENDOR" && (
          <Card>
            <CardHeader title="Credits" description="Manual adjustments are ledgered and audited." />
            <div className="space-y-4 p-5">
              <CreditAdjust orgId={org.id} />
              <ul className="divide-y divide-border text-sm">
                {ledger.map((l) => <li key={l.id} className="flex justify-between py-1.5"><span>{humanize(l.reason)} · {fmtDateTime(l.createdAt)}</span><span className={l.delta > 0 ? "text-success" : "text-danger"}>{l.delta > 0 ? "+" : ""}{l.delta} → {l.balanceAfter}</span></li>)}
              </ul>
            </div>
          </Card>
        )}
        {org.kind === "VENDOR" && (
          <Card className="xl:col-span-2">
            <CardHeader title="Negotiated rate card" description="Overrides the default credit cost per survey type for this tenant only." />
            <OverrideEditor orgId={org.id} rows={types.map((t) => ({ id: t.id, name: t.name, base: t.creditCost, override: org.rateOverrides.find((o) => o.surveyTypeId === t.id)?.creditCost ?? null }))} />
          </Card>
        )}
        <Card className="xl:col-span-2">
          <CardHeader title="Recent activity" />
          <div className="p-5"><Timeline events={events} /></div>
        </Card>
      </div>
    </>
  );
}
