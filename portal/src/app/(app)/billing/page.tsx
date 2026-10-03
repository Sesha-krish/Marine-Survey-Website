import { Coins } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Alert, Card, CardHeader, PageHeader, StatusPill } from "@/components/ui/misc";
import { LinkTabs } from "@/components/ui/tabs";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/format";
import { humanize } from "@/lib/constants";
import { BuyButton, CreditSettings } from "./client";

export const metadata = { title: "Packages & Credits" };

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const u = await requireUser(["VENDOR_ADMIN", "VENDOR_STAFF"]);
  const { tab = "packages" } = await searchParams;
  const [org, pkgs, types, overrides, purchases, ledger] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: u.orgId } }),
    db.package.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.surveyType.findMany({ where: { active: true }, include: { subCategory: { include: { category: true } } }, orderBy: [{ subCategoryId: "asc" }, { sortOrder: "asc" }] }),
    db.rateOverride.findMany({ where: { orgId: u.orgId } }),
    db.purchase.findMany({ where: { orgId: u.orgId }, include: { package: true }, orderBy: { purchasedAt: "desc" } }),
    db.creditLedger.findMany({ where: { orgId: u.orgId }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  const now = new Date();
  const ov = new Map(overrides.map((o) => [o.surveyTypeId, o.creditCost]));
  const rfqRefs = await db.rfq.findMany({ where: { id: { in: ledger.filter((l) => l.refType === "RFQ").map((l) => l.refId!) } }, select: { id: true, number: true } });
  const refLabel = (l: (typeof ledger)[number]) => (l.refType === "RFQ" ? rfqRefs.find((r) => r.id === l.refId)?.number : l.refType === "PURCHASE" ? purchases.find((p) => p.id === l.refId)?.number : null) ?? "—";

  return (
    <>
      <PageHeader title="Packages & Credits" description="Credits are spent when you submit an RFQ (per survey line, per the rate card) and refunded if it's declined or cancelled before work starts." />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="flex items-center gap-2 text-sm text-muted"><Coins className="h-4 w-4" aria-hidden /> Credit balance</p>
          <p className="mt-1 text-3xl font-semibold">{org.creditBalance}</p>
          {org.creditBalance <= org.lowCreditAlert && <p className="mt-1 text-sm font-medium text-danger">Low balance — top up to keep submitting RFQs</p>}
        </Card>
        <Card className="p-5 sm:col-span-2">
          <CreditSettings canEdit={u.role === "VENDOR_ADMIN"} initial={{ autoRenew: org.autoRenew, autoRenewPkgId: org.autoRenewPkgId, lowCreditAlert: org.lowCreditAlert }} packages={pkgs.map((p) => ({ id: p.id, label: `${p.name} — ${p.credits} credits for ${fmtMoney(p.price, p.currency)}` }))} />
        </Card>
      </div>
      <LinkTabs label="Billing sections" base="/billing" active={tab} tabs={[{ key: "packages", label: "Purchase package" }, { key: "rates", label: "Rate card", count: types.length }, { key: "purchases", label: "Purchase history", count: purchases.length }, { key: "ledger", label: "Credit ledger" }]} />
      <div className="mt-6">
        {tab === "packages" && (
          <>
            <Alert tone="warning" className="mb-4">Payment gateway is in simulation mode in this environment — purchases complete instantly without charging a card.</Alert>
            <div className="grid gap-4 md:grid-cols-3">
              {pkgs.map((p, i) => (
                <Card key={p.id} className={`flex flex-col p-6 ${i === 1 ? "border-accent-strong ring-1 ring-accent-strong" : ""}`}>
                  <p className="text-sm font-semibold uppercase tracking-wide text-accent-strong">{p.name}{i === 1 && " · Popular"}</p>
                  <p className="mt-2 text-3xl font-bold">{fmtMoney(p.price, p.currency)}</p>
                  <ul className="mt-4 flex-1 space-y-1 text-sm text-muted">
                    <li><strong className="text-text">{p.credits}</strong> credits</li>
                    <li>Valid for <strong className="text-text">{p.validityDays}</strong> days</li>
                    <li>{fmtMoney(p.price / p.credits, p.currency)} per credit</li>
                  </ul>
                  {u.role === "VENDOR_ADMIN" ? <BuyButton pkg={{ id: p.id, name: p.name, price: fmtMoney(p.price, p.currency), credits: p.credits }} /> : <p className="mt-4 text-xs text-muted">Ask a vendor admin to purchase.</p>}
                </Card>
              ))}
            </div>
          </>
        )}
        {tab === "rates" && (
          <Card>
            <CardHeader title="Rate card" description="Credits charged per RFQ survey line. Set by the platform; your negotiated overrides are shown." />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Rate card</caption>
                <thead><tr className="bg-surface-2 text-left text-xs uppercase tracking-wide text-subtle"><th scope="col" className="px-5 py-2">Type of survey</th><th scope="col" className="px-5 py-2">Sub category</th><th scope="col" className="px-5 py-2">Category</th><th scope="col" className="px-5 py-2 text-right">Credits</th></tr></thead>
                <tbody>
                  {types.map((t) => (
                    <tr key={t.id} className="border-t border-border">
                      <td className="px-5 py-2 font-medium">{t.name}</td><td className="px-5 py-2">{t.subCategory.name}</td><td className="px-5 py-2 text-muted">{t.subCategory.category.name}</td>
                      <td className="px-5 py-2 text-right tabular-nums">{ov.get(t.id) ?? t.creditCost}{ov.has(t.id) && <span className="ml-1 text-xs text-accent-strong">(negotiated)</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
        {tab === "purchases" && (
          <Card>
            <CardHeader title="Purchase history" />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Purchases</caption>
                <thead><tr className="bg-surface-2 text-left text-xs uppercase tracking-wide text-subtle"><th scope="col" className="px-5 py-2">Purchase</th><th scope="col" className="px-5 py-2">Plan</th><th scope="col" className="px-5 py-2 text-right">Price</th><th scope="col" className="px-5 py-2 text-right">Credits</th><th scope="col" className="px-5 py-2">Purchased</th><th scope="col" className="px-5 py-2">Valid until</th><th scope="col" className="px-5 py-2">Status</th></tr></thead>
                <tbody>
                  {purchases.map((p) => (
                    <tr key={p.id} className="border-t border-border">
                      <td className="px-5 py-2 font-medium">{p.number}</td><td className="px-5 py-2">{p.package.name}</td><td className="px-5 py-2 text-right tabular-nums">{fmtMoney(p.price)}</td><td className="px-5 py-2 text-right">{p.credits}</td><td className="px-5 py-2">{fmtDate(p.purchasedAt)}</td><td className="px-5 py-2">{fmtDate(p.expiresAt)}</td>
                      <td className="px-5 py-2"><StatusPill status={p.status === "ACTIVE" && p.expiresAt < now ? "EXPIRED" : p.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
        {tab === "ledger" && (
          <Card>
            <CardHeader title="Credit ledger" description="Every credit in and out, with the balance after each transaction." />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Credit ledger</caption>
                <thead><tr className="bg-surface-2 text-left text-xs uppercase tracking-wide text-subtle"><th scope="col" className="px-5 py-2">When</th><th scope="col" className="px-5 py-2">Reason</th><th scope="col" className="px-5 py-2">Reference</th><th scope="col" className="px-5 py-2 text-right">Change</th><th scope="col" className="px-5 py-2 text-right">Balance</th></tr></thead>
                <tbody>
                  {ledger.map((l) => (
                    <tr key={l.id} className="border-t border-border">
                      <td className="whitespace-nowrap px-5 py-2">{fmtDateTime(l.createdAt)}</td><td className="px-5 py-2">{humanize(l.reason)}</td><td className="px-5 py-2">{refLabel(l)}</td>
                      <td className={`px-5 py-2 text-right font-semibold tabular-nums ${l.delta > 0 ? "text-success" : "text-danger"}`}>{l.delta > 0 ? `+${l.delta}` : l.delta}</td>
                      <td className="px-5 py-2 text-right tabular-nums">{l.balanceAfter}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
