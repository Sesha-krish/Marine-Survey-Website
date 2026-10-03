"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Coins, LogOut, Menu, Plus, Search, User } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { fmtRelative, initials } from "@/lib/format";
import { ROLE_LABEL, type Role } from "@/lib/constants";
import { ThemeToggle } from "./theme-toggle";
import { CommandPalette } from "./command-palette";
import { logoutAction } from "@/app/actions/session";

type Notif = { id: string; title: string; body: string | null; link: string | null; readAt: string | null; createdAt: string };

export function Topbar({
  user, credits, lowCreditAt, onMenu, showRfqButton,
}: {
  user: { name: string; orgName: string; role: Role; email: string };
  credits: number | null;
  lowCreditAt: number;
  onMenu: () => void;
  showRfqButton: boolean;
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const low = credits !== null && credits <= lowCreditAt;

  return (
    <header className="no-print sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-surface/95 px-3 backdrop-blur sm:px-5">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenu} aria-label="Open navigation">
        <Menu className="h-5 w-5" />
      </Button>
      <button
        onClick={() => setPaletteOpen(true)}
        className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 text-sm text-subtle hover:border-border-strong sm:max-w-xs"
        aria-label="Search and jump (Ctrl+K)"
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden />
        <span className="truncate">Search RFQ, job, container…</span>
        <kbd className="ml-auto hidden rounded border border-border bg-surface px-1.5 text-[11px] font-medium sm:inline">Ctrl K</kbd>
      </button>
      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        {credits !== null && (
          <Link
            href="/billing?tab=ledger"
            className={cn(
              "hidden h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold sm:inline-flex",
              low ? "border-warning/50 bg-warning-soft text-warning" : "border-border bg-surface-2 text-text",
            )}
            title={low ? "Low credit balance — buy a package" : "Credit balance"}
          >
            <Coins className="h-4 w-4" aria-hidden />
            {credits} credits
            {low && <span className="sr-only">(low balance)</span>}
          </Link>
        )}
        {showRfqButton && (
          <ButtonLink href="/rfqs/new" size="sm" className="hidden sm:inline-flex">
            <Plus className="h-4 w-4" aria-hidden /> Submit RFQ
          </ButtonLink>
        )}
        <ThemeToggle />
        <NotificationBell />
        <UserMenu user={user} />
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </header>
  );
}

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/notifications", { cache: "no-store" });
      if (!r.ok) return;
      const d = await r.json();
      setItems(d.items);
      setUnread(d.unread);
    } catch {
      /* offline — keep last state */
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const markAll = async () => {
    await fetch("/api/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ all: true }) });
    load();
  };

  const openItem = async (n: Notif) => {
    setOpen(false);
    if (!n.readAt) await fetch("/api/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: [n.id] }) });
    load();
    if (n.link) router.push(n.link);
  };

  return (
    <div className="relative" ref={ref}>
      <Button variant="ghost" size="icon" onClick={() => setOpen((o) => !o)} aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} aria-expanded={open}>
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white dark:text-[#2a0705]">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(92vw,380px)] overflow-hidden rounded-xl border border-border bg-surface shadow-pop" role="dialog" aria-label="Notifications">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 && <button className="text-xs font-medium text-accent-strong hover:underline" onClick={markAll}>Mark all read</button>}
          </div>
          <ul className="max-h-[60vh] overflow-y-auto">
            {items.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted">You&apos;re all caught up.</li>}
            {items.map((n) => (
              <li key={n.id}>
                <button onClick={() => openItem(n)} className={cn("flex w-full gap-3 border-b border-border px-4 py-3 text-left hover:bg-surface-2", !n.readAt && "bg-accent-soft/50")}>
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-accent-strong")} aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-text">{n.title}</span>
                    {n.body && <span className="mt-0.5 block truncate text-[13px] text-muted">{n.body}</span>}
                    <span className="mt-0.5 block text-xs text-subtle">{fmtRelative(n.createdAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Link href="/notifications" onClick={() => setOpen(false)} className="block px-4 py-2.5 text-center text-[13px] font-medium text-accent-strong hover:bg-surface-2">
            View all
          </Link>
        </div>
      )}
    </div>
  );
}

export function UserMenu({ user, profileHref = "/settings" }: { user: { name: string; orgName: string; role: Role; email: string }; profileHref?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-lg p-1 hover:bg-surface-2" aria-label="Account menu" aria-expanded={open}>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-fg">{initials(user.name)}</span>
        <span className="hidden min-w-0 text-left md:block">
          <span className="block max-w-[160px] truncate text-[13px] font-semibold leading-tight">{user.orgName}</span>
          <span className="block text-[11px] leading-tight text-muted">{ROLE_LABEL[user.role]}</span>
        </span>
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-64 rounded-xl border border-border bg-surface p-1.5 shadow-pop" role="menu">
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
          <Link href={profileHref} role="menuitem" className="flex h-9 items-center gap-2 rounded-lg px-3 text-sm hover:bg-surface-2" onClick={() => setOpen(false)}>
            <User className="h-4 w-4" aria-hidden /> Profile & security
          </Link>
          <form action={logoutAction}>
            <button role="menuitem" className="flex h-9 w-full items-center gap-2 rounded-lg px-3 text-sm text-danger hover:bg-danger-soft">
              <LogOut className="h-4 w-4" aria-hidden /> Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
