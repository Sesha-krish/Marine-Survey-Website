import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppShell } from "@/components/app/app-shell";
import { NAV } from "@/components/app/nav";

// Shell for vendor staff and platform admins. Surveyors (/s) and requesters (/r) have their own apps.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser(["VENDOR_ADMIN", "VENDOR_STAFF", "PLATFORM_ADMIN"]);
  const org = await db.organization.findUniqueOrThrow({ where: { id: user.orgId } });
  const items = NAV.filter((n) => n.roles.includes(user.role));
  return (
    <AppShell
      user={{ name: user.name, orgName: user.orgName, role: user.role, email: user.email }}
      items={items}
      credits={org.kind === "VENDOR" ? org.creditBalance : null}
      lowCreditAt={org.lowCreditAlert}
      demo={org.isDemo}
    >
      {children}
    </AppShell>
  );
}
