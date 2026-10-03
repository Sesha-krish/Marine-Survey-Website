import Link from "next/link";
import { Anchor } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { NotificationBell, UserMenu } from "@/components/app/topbar";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { SwRegister } from "./sw-register";

export const metadata = { title: { default: "Surveyor", template: "%s · Surveyor" } };

/** Separate, mobile-first app for surveyors (in-house and independent). */
export default async function SurveyorLayout({ children }: { children: React.ReactNode }) {
  const u = await requireUser(["SURVEYOR"]);
  return (
    <div className="min-h-dvh bg-bg">
      <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-surface/95 px-3 backdrop-blur">
        <Link href="/s" className="flex items-center gap-2 font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-fg"><Anchor className="h-4 w-4" aria-hidden /></span>
          <span className="text-[15px]">Surveyor</span>
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <NotificationBell />
          <UserMenu user={{ name: u.name, orgName: u.name, role: u.role, email: u.email }} profileHref="/s/profile" />
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-3xl px-3 pb-24 pt-4 sm:px-6">{children}</main>
      <SwRegister />
    </div>
  );
}
