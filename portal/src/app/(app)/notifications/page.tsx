import Link from "next/link";
import { Bell } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, EmptyState, PageHeader } from "@/components/ui/misc";
import { Pagination } from "@/components/app/data-table";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { listParams, type SP } from "@/server/list";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requireUser(["VENDOR_ADMIN", "VENDOR_STAFF", "PLATFORM_ADMIN"]);
  const sp = await searchParams;
  const lp = listParams(sp, { sortable: ["createdAt"], defaultSort: "createdAt", pageSize: 30 });
  const [total, rows] = await Promise.all([
    db.notification.count({ where: { userId: u.id } }),
    db.notification.findMany({ where: { userId: u.id }, orderBy: { createdAt: "desc" }, skip: lp.skip, take: lp.take }),
  ]);
  return (
    <>
      <PageHeader title="Notifications" description="Everything that needed your attention, kept as a history." />
      <Card>
        {rows.length === 0 ? <EmptyState icon={<Bell className="h-6 w-6" />} title="No notifications yet" /> : (
          <ul className="divide-y divide-border">
            {rows.map((n) => (
              <li key={n.id} className={cn("px-5 py-3", !n.readAt && "bg-accent-soft/40")}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  {n.link ? <Link href={n.link} className="text-sm font-medium text-accent-strong hover:underline">{n.title}</Link> : <span className="text-sm font-medium">{n.title}</span>}
                  <span className="text-xs text-subtle">{fmtDateTime(n.createdAt)}</span>
                </div>
                {n.body && <p className="mt-0.5 text-[13px] text-muted">{n.body}</p>}
              </li>
            ))}
          </ul>
        )}
        <Pagination page={lp.page} pageSize={lp.pageSize} total={total} searchParams={sp} />
      </Card>
    </>
  );
}
