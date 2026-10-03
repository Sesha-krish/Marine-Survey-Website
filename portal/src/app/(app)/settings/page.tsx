import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui/misc";
import { LinkTabs } from "@/components/ui/tabs";
import { SecuritySettings } from "@/components/app/security-settings";
import { formatPhone } from "@/lib/countries";
import { fmtDateTime } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/constants";
import { signedFileUrl } from "@/lib/storage";
import { LetterheadManager, OrgForm } from "./client";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const u = await requireUser(["VENDOR_ADMIN", "VENDOR_STAFF", "PLATFORM_ADMIN"]);
  const { tab = "security" } = await searchParams;
  const admin = u.role === "VENDOR_ADMIN";
  const [me, org, sessions, letterheads] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: u.id } }),
    db.organization.findUniqueOrThrow({ where: { id: u.orgId } }),
    db.session.count({ where: { userId: u.id, revoked: false, expiresAt: { gt: new Date() } } }),
    db.letterhead.findMany({ where: { orgId: u.orgId }, orderBy: { version: "desc" } }),
  ]);
  const tabs = [{ key: "security", label: "Profile & security" }, ...(admin ? [{ key: "organization", label: "Company" }, { key: "letterhead", label: "Letterhead", count: letterheads.length }] : [])];
  return (
    <>
      <PageHeader title="Settings" />
      <LinkTabs tabs={tabs} active={tab} base="/settings" label="Settings sections" />
      <div className="mt-6 max-w-4xl">
        {tab === "security" && (
          <div className="space-y-6">
            <Card>
              <CardHeader title="Profile" />
              <dl className="grid gap-4 p-5 sm:grid-cols-3 text-sm">
                <div><dt className="text-xs text-subtle">Name</dt><dd>{me.firstName} {me.lastName}</dd></div>
                <div><dt className="text-xs text-subtle">Email</dt><dd>{me.email}</dd></div>
                <div><dt className="text-xs text-subtle">Mobile</dt><dd>{formatPhone(me.phone)}</dd></div>
                <div><dt className="text-xs text-subtle">Role</dt><dd><Badge tone="blue">{ROLE_LABEL[u.role]}</Badge></dd></div>
                <div><dt className="text-xs text-subtle">Company</dt><dd>{org.name}</dd></div>
                <div><dt className="text-xs text-subtle">Last sign-in</dt><dd>{fmtDateTime(me.lastLoginAt)}</dd></div>
              </dl>
            </Card>
            <SecuritySettings totpEnabled={me.totpEnabled} sessions={sessions} />
          </div>
        )}
        {tab === "organization" && admin && (
          <OrgForm initial={{ name: org.name, gstin: org.gstin ?? "", email: org.email ?? "", phone: org.phone ?? "", address: org.address ?? "", city: org.city ?? "", state: org.state ?? "" }} />
        )}
        {tab === "letterhead" && admin && (
          <LetterheadManager items={letterheads.map((l) => ({ id: l.id, version: l.version, active: l.active, url: signedFileUrl(l.attachmentId, 3600), createdAt: l.createdAt.toISOString() }))} />
        )}
      </div>
    </>
  );
}
