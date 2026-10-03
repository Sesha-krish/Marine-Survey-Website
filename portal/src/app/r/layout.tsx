import Link from "next/link";
import { Anchor } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { NotificationBell, UserMenu } from "@/components/app/topbar";
import { ThemeToggle } from "@/components/app/theme-toggle";

export const metadata = { title: { default: "Requester", template: "%s · Requester" } };

export default async function RequesterLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser(["REQUESTER"]);
  return (
    <div className="min-h-dvh">
      <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-surface/95 px-4 backdrop-blur">
        <Link href="/r" className="flex items-center gap-2 font-semibold"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-fg"><Anchor className="h-4 w-4" aria-hidden /></span>My surveys</Link>
        <div className="ml-auto flex items-center gap-1"><ThemeToggle /><NotificationBell /><UserMenu user={{ name: u.name, orgName: u.orgName, role: u.role, email: u.email }} profileHref="/r" /></div>
      </header>
      <main id="main" className="mx-auto w-full max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
