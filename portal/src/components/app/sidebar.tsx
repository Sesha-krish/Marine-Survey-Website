"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Anchor, Building, Building2, ChevronsLeft, ChevronsRight, ClipboardList, Coins, FileCheck2, FileText, HardHat, History, LayoutDashboard,
  LayoutTemplate, LifeBuoy, Network, ReceiptIndianRupee, Settings, ShieldCheck, Users,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { NavItem } from "./nav";

const ICONS = { Anchor, Building, Building2, ClipboardList, Coins, FileCheck2, FileText, HardHat, History, LayoutDashboard, LayoutTemplate, LifeBuoy, Network, ReceiptIndianRupee, Settings, ShieldCheck, Users };

export function Sidebar({ items, mobileOpen, onNavigate }: { items: NavItem[]; mobileOpen: boolean; onNavigate: () => void }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("msp-sidebar") === "1");
    } catch {
      /* default expanded */
    }
  }, []);
  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem("msp-sidebar", c ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !c;
    });
  };

  const isActive = (href: string) => pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`));

  return (
    <aside
      className={cn(
        "no-print fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border bg-surface transition-[width,transform] duration-200 lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0",
        collapsed ? "lg:w-[68px]" : "lg:w-60",
        mobileOpen ? "w-64 translate-x-0" : "w-64 -translate-x-full",
      )}
      aria-label="Main navigation"
    >
      <div className="flex h-14 items-center gap-2.5 border-b border-border px-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-fg">
          <Anchor className="h-4 w-4" aria-hidden />
        </span>
        {!collapsed && <span className="truncate text-[15px] font-semibold tracking-tight">Marine Survey</span>}
      </div>
      <nav className="flex-1 overflow-y-auto px-2.5 py-3">
        <ul className="space-y-0.5">
          {items.map((it) => {
            const Icon = ICONS[it.icon as keyof typeof ICONS] ?? FileText;
            const active = isActive(it.href);
            return (
              <li key={it.href + it.label}>
                <Link
                  href={it.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  title={collapsed ? it.label : undefined}
                  className={cn(
                    "flex h-9 items-center gap-3 rounded-lg px-2.5 text-sm font-medium transition-colors duration-150",
                    active ? "bg-accent-soft text-accent-strong" : "text-muted hover:bg-surface-2 hover:text-text",
                    collapsed && "lg:justify-center lg:px-0",
                  )}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
                  <span className={cn("truncate", collapsed && "lg:sr-only")}>{it.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <button
        onClick={toggle}
        className="hidden h-10 items-center gap-2 border-t border-border px-4 text-[13px] text-muted hover:bg-surface-2 hover:text-text lg:flex"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? <ChevronsRight className="mx-auto h-4 w-4" /> : (<><ChevronsLeft className="h-4 w-4" /> Collapse</>)}
      </button>
    </aside>
  );
}
