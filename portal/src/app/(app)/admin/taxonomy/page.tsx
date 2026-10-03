import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Alert, Card, CardHeader, PageHeader } from "@/components/ui/misc";
import { AddType, TypeRow } from "./client";

export const metadata = { title: "Taxonomy & Rates" };

export default async function TaxonomyPage() {
  await requireUser(["PLATFORM_ADMIN"]);
  const cats = await db.surveyCategory.findMany({
    orderBy: { sortOrder: "asc" },
    include: { subCategories: { orderBy: { sortOrder: "asc" }, include: { types: { orderBy: { sortOrder: "asc" }, include: { scopeItems: { orderBy: { sortOrder: "asc" } }, templates: { where: { published: true }, select: { version: true } } } } } } },
  });
  return (
    <>
      <PageHeader title="Taxonomy & Rates" description="Category → Sub category → Type of survey. One source for RFQ forms, surveyor capabilities, rate cards and templates." />
      <Alert tone="info" className="mb-6">A survey type is offered on RFQ forms only when it is active <strong>and</strong> has a published template — so no form ever shows an empty branch.</Alert>
      <div className="space-y-6">
        {cats.map((c) => (
          <Card key={c.id}>
            <CardHeader title={c.name} />
            {c.subCategories.map((s) => (
              <div key={s.id} className="border-t border-border first:border-t-0">
                <div className="flex items-center justify-between bg-surface-2 px-5 py-2">
                  <p className="text-sm font-semibold">{s.name} <span className="font-normal text-muted">· quantity label “{s.quantityLabel}”</span></p>
                  <AddType subCategoryId={s.id} />
                </div>
                <ul className="divide-y divide-border">
                  {s.types.map((t) => <TypeRow key={t.id} type={{ id: t.id, name: t.name, code: t.code, creditCost: t.creditCost, active: t.active, scope: t.scopeItems.map((x) => x.text), templateVersion: t.templates.length ? Math.max(...t.templates.map((x) => x.version)) : null }} />)}
                  {s.types.length === 0 && <li className="px-5 py-3 text-sm text-danger">No survey types — this sub category is hidden from forms.</li>}
                </ul>
              </div>
            ))}
          </Card>
        ))}
      </div>
    </>
  );
}
