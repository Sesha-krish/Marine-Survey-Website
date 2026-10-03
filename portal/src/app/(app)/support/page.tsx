import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/misc";
import { TicketList } from "@/components/app/ticket-list";
import type { SP } from "@/server/list";
import { NewTicketButton } from "./client";

export const metadata = { title: "Support" };

export default async function SupportPage({ searchParams }: { searchParams: Promise<SP> }) {
  const u = await requireUser(["VENDOR_ADMIN", "VENDOR_STAFF"]);
  const sp = await searchParams;
  return (
    <>
      <PageHeader title="Support" description="SLA by priority: Urgent 2h · High 8h · Medium 24h · Low 72h." actions={<NewTicketButton />} />
      <TicketList orgId={u.orgId} sp={sp} />
    </>
  );
}
