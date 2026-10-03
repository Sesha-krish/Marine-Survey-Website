"use client";
import { Download } from "lucide-react";
import { BulkBar } from "@/components/app/bulk-bar";
import { AllocationButton } from "@/components/app/allocation-drawer";
import { buttonClass } from "@/components/ui/button";

export function JobBulkBar() {
  return (
    <BulkBar formId="bulk-jobs">
      {(ids) => (
        <>
          <AllocationButton jobs={ids.map((id) => ({ id, number: `${ids.length} jobs`, type: "Selected jobs", location: "" }))} label={`Allocate ${ids.length}`} />
          <a className={buttonClass("secondary", "sm")} href={`/api/export/jobs?ids=${ids.join(",")}`} download>
            <Download className="h-4 w-4" aria-hidden /> Export selected
          </a>
        </>
      )}
    </BulkBar>
  );
}
