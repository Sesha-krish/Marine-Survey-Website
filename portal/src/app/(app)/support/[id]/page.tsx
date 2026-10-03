import Link from "next/link";
import { notFound } from "next/navigation";
import { Paperclip } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Badge, Card, CardHeader, PageHeader, StatusPill } from "@/components/ui/misc";
import { humanize } from "@/lib/constants";
import { fmtDateTime, fmtRelative, initials } from "@/lib/format";
import { signedFileUrl } from "@/lib/storage";
import { cn } from "@/lib/cn";
import { ReplyBox, TicketStatus } from "../client";

export const metadata = { title: "Ticket" };

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(["VENDOR_ADMIN", "VENDOR_STAFF", "PLATFORM_ADMIN"]);
  const { id } = await params;
  const staff = u.role === "PLATFORM_ADMIN";
  const t = await db.supportTicket.findFirst({ where: { id, ...(staff ? {} : { orgId: u.orgId }) }, include: { org: true, messages: { orderBy: { createdAt: "asc" } } } });
  if (!t) notFound();
  const authors = await db.user.findMany({ where: { id: { in: t.messages.map((m) => m.authorId) } }, select: { id: true, firstName: true, lastName: true, role: true } });
  const atts = await db.attachment.findMany({ where: { id: { in: t.messages.map((m) => m.attachmentId).filter(Boolean) as string[] } } });
  const breached = t.slaDueAt < new Date() && !["RESOLVED", "CLOSED"].includes(t.status);
  return (
    <>
      <PageHeader
        breadcrumb={<Link href={staff ? "/admin/support" : "/support"} className="hover:underline">{staff ? "Support Queue" : "Support"}</Link>}
        title={<span className="flex flex-wrap items-center gap-2">{t.number} <StatusPill status={t.status} /><StatusPill status={t.priority} /></span>}
        description={`${t.topic} · ${humanize(t.supportType)}${staff ? ` · ${t.org.name}` : ""}`}
        actions={<TicketStatus ticketId={t.id} status={t.status} staff={staff} />}
      />
      {!["RESOLVED", "CLOSED"].includes(t.status) && (
        <p className={cn("mb-4 text-sm", breached ? "font-medium text-danger" : "text-muted")}>SLA {breached ? "breached" : "due"} {fmtRelative(t.slaDueAt)} ({fmtDateTime(t.slaDueAt)})</p>
      )}
      <Card>
        <CardHeader title="Conversation" />
        <ol className="space-y-4 p-5">
          {t.messages.map((m) => {
            const a = authors.find((x) => x.id === m.authorId);
            const fromStaff = a?.role === "PLATFORM_ADMIN";
            const file = atts.find((x) => x.id === m.attachmentId);
            const name = a ? `${a.firstName} ${a.lastName ?? ""}`.trim() : "Unknown";
            return (
              <li key={m.id} className={cn("flex gap-3", fromStaff && "flex-row-reverse text-right")}>
                <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold", fromStaff ? "bg-accent-strong text-white dark:text-[#04201c]" : "bg-primary text-primary-fg")}>{initials(name)}</span>
                <div className={cn("max-w-[80%] rounded-xl px-4 py-3", fromStaff ? "bg-accent-soft" : "bg-surface-2")}>
                  <p className="text-xs text-muted">{name} {fromStaff && <Badge tone="teal">Support</Badge>} · {fmtDateTime(m.createdAt)}</p>
                  <p className="mt-1 whitespace-pre-line text-left text-sm">{m.body}</p>
                  {file && <a href={signedFileUrl(file.id)} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent-strong hover:underline"><Paperclip className="h-3.5 w-3.5" aria-hidden />{file.fileName}</a>}
                </div>
              </li>
            );
          })}
        </ol>
        {t.status !== "CLOSED" && <div className="border-t border-border p-5"><ReplyBox ticketId={t.id} /></div>}
      </Card>
    </>
  );
}
