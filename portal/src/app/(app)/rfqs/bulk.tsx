"use client";
import { useRouter } from "next/navigation";
import { CheckCheck, Download, XCircle } from "lucide-react";
import { BulkBar } from "@/components/app/bulk-bar";
import { ConfirmButton } from "@/components/ui/confirm";
import { buttonClass } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { bulkRfqAction } from "@/app/actions/rfqs";

export function RfqBulkBar() {
  const router = useRouter();
  const toast = useToast();
  const go = async (ids: string[], op: "ACCEPT" | "DECLINED" | "CANCELLED", reason: string, clear: () => void) => {
    const r = await bulkRfqAction(ids, op, reason);
    if (!r.ok) return r.error;
    if (r.data.done) toast.success(`${r.data.done} RFQ${r.data.done === 1 ? "" : "s"} updated`);
    r.data.failed.slice(0, 3).forEach((f) => toast.error(f));
    clear();
    router.refresh();
  };
  return (
    <BulkBar formId="bulk-rfqs">
      {(ids, clear) => (
        <>
          <ConfirmButton size="sm" variant="secondary" icon={<CheckCheck className="h-4 w-4" aria-hidden />} label="Accept" title={`Accept ${ids.length} RFQ(s)?`} description="Job orders are generated from each RFQ's survey lines. Only RFQs in New are accepted; others are skipped." confirmLabel="Accept" action={(reason) => go(ids, "ACCEPT", reason, clear)} />
          <ConfirmButton size="sm" variant="secondary" icon={<XCircle className="h-4 w-4" aria-hidden />} label="Decline" title={`Decline ${ids.length} RFQ(s)?`} reason reasonLabel="Reason (shared on each RFQ's timeline)" confirmVariant="danger" confirmLabel="Decline" action={(reason) => go(ids, "DECLINED", reason, clear)} />
          <ConfirmButton size="sm" variant="secondary" label="Cancel" title={`Cancel ${ids.length} RFQ(s)?`} description="Credits are refunded where no survey work has started." reason confirmVariant="danger" confirmLabel="Cancel RFQs" action={(reason) => go(ids, "CANCELLED", reason, clear)} />
          <a className={buttonClass("secondary", "sm")} href={`/api/export/rfqs?ids=${ids.join(",")}`} download>
            <Download className="h-4 w-4" aria-hidden /> Export selected
          </a>
        </>
      )}
    </BulkBar>
  );
}
