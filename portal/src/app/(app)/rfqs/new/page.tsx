import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/misc";
import { customerName, fmtRelative } from "@/lib/format";
import { RfqWizard, type Taxonomy } from "./wizard";

export const metadata = { title: "Submit RFQ" };

export default async function NewRfqPage({ searchParams }: { searchParams: Promise<{ customerId?: string; draft?: string }> }) {
  const u = await requireUser(["VENDOR_ADMIN", "VENDOR_STAFF"]);
  const sp = await searchParams;
  const [org, cats, overrides, drafts] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: u.orgId } }),
    db.surveyCategory.findMany({
      orderBy: { sortOrder: "asc" },
      include: { subCategories: { orderBy: { sortOrder: "asc" }, include: { types: { where: { active: true }, orderBy: { sortOrder: "asc" }, include: { scopeItems: { orderBy: { sortOrder: "asc" } }, templates: { where: { published: true }, select: { id: true } } } } } } },
    }),
    db.rateOverride.findMany({ where: { orgId: u.orgId } }),
    db.rfqDraft.findMany({ where: { orgId: u.orgId, userId: u.id }, orderBy: { updatedAt: "desc" }, take: 5 }),
  ]);
  const ov = new Map(overrides.map((o) => [o.surveyTypeId, o.creditCost]));
  // Empty leaf branches are never offered: a type needs a published template, a sub-category needs a type.
  const taxonomy: Taxonomy = cats
    .map((c) => ({
      id: c.id,
      name: c.name,
      subs: c.subCategories
        .map((s) => ({
          id: s.id,
          name: s.name,
          quantityLabel: s.quantityLabel,
          types: s.types.filter((t) => t.templates.length).map((t) => ({ id: t.id, name: t.name, creditCost: ov.get(t.id) ?? t.creditCost, scope: t.scopeItems.map((x) => x.text) })),
        }))
        .filter((s) => s.types.length),
    }))
    .filter((c) => c.subs.length);

  const draft = sp.draft ? drafts.find((d) => d.id === sp.draft) ?? (await db.rfqDraft.findFirst({ where: { id: sp.draft, orgId: u.orgId, userId: u.id } })) : null;
  const preCustomer = sp.customerId ? await db.customer.findFirst({ where: { id: sp.customerId, orgId: u.orgId, active: true } }) : null;
  const otherDrafts = drafts.filter((d) => d.id !== draft?.id);

  return (
    <>
      <PageHeader
        title="Submit RFQ"
        description="Six short steps. Your progress is saved as a draft automatically — you can resume on any device."
        breadcrumb={<Link href="/rfqs" className="hover:underline">RFQs</Link>}
      />
      {!draft && otherDrafts.length > 0 && (
        <div className="mb-5 rounded-xl border border-border bg-surface p-4">
          <p className="text-sm font-semibold">Resume a draft</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {otherDrafts.map((d) => {
              const data = JSON.parse(d.data) as { customer?: { displayName?: string } };
              return (
                <li key={d.id}>
                  <Link href={`/rfqs/new?draft=${d.id}`} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-[13px] hover:bg-surface-2">
                    <span className="font-medium">{data.customer?.displayName ?? "Untitled draft"}</span>
                    <span className="text-subtle">step {d.step + 1} · {fmtRelative(d.updatedAt)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <RfqWizard
        key={draft?.id ?? "new"}
        taxonomy={taxonomy}
        homeCurrency={org.homeCurrency as "INR" | "USD"}
        draft={draft ? { id: draft.id, step: draft.step, data: JSON.parse(draft.data) } : null}
        preCustomer={preCustomer ? { id: preCustomer.id, displayName: customerName(preCustomer), email: preCustomer.email, phone: preCustomer.phone, city: preCustomer.city, customerType: preCustomer.customerType } : null}
      />
    </>
  );
}
