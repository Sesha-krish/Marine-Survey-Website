"use client";
import { useState } from "react";
import type { Role } from "@/lib/constants";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import type { NavItem } from "./nav";

export function AppShell({
  user, items, credits, lowCreditAt, demo, children,
}: {
  user: { name: string; orgName: string; role: Role; email: string };
  items: NavItem[];
  credits: number | null;
  lowCreditAt: number;
  demo: boolean;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="flex min-h-dvh">
      <a href="#main" className="sr-only z-50 rounded bg-primary px-3 py-2 text-primary-fg focus:not-sr-only focus:fixed focus:left-2 focus:top-2">
        Skip to content
      </a>
      <Sidebar items={items} mobileOpen={mobileOpen} onNavigate={() => setMobileOpen(false)} />
      {mobileOpen && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setMobileOpen(false)} aria-hidden />}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={user} credits={credits} lowCreditAt={lowCreditAt} onMenu={() => setMobileOpen(true)} showRfqButton={user.role === "VENDOR_ADMIN" || user.role === "VENDOR_STAFF"} />
        {demo && (
          <div className="no-print border-b border-border bg-[var(--surface-2)] px-5 py-1.5 text-center text-xs text-muted">
            Demo workspace — all customers, RFQs and surveys here are sample data.
          </div>
        )}
        <main id="main" className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
