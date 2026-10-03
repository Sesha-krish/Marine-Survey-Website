import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/ui/misc";
import { TicketList } from "@/components/app/ticket-list";
import type { SP } from "@/server/list";

export const metadata = { title: "Support Queue" };

export default async function AdminSupport({ searchParams }: { searchParams: Promise<SP> }) {
  await requireUser(["PLATFORM_ADMIN"]);
  const sp = await searchParams;
  return (
    <>
      <PageHeader title="Support Queue" description="Tickets from every tenant, with SLA status." />
      <TicketList orgId={null} sp={sp} showOrg />
    </>
  );
}
