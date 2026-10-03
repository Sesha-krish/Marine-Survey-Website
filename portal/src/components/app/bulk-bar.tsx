"use client";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Bulk-action bar for DataTable rows. Checkboxes are associated with <form id={formId}>,
 * so this component only needs to read the form's checked "ids".
 */
export function BulkBar({ formId, children }: { formId: string; children: (ids: string[], clear: () => void) => React.ReactNode }) {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    const read = () => {
      const boxes = Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="ids"][form="${formId}"]`));
      // Desktop table and mobile cards both render a checkbox per row; dedupe by value.
      setIds([...new Set(boxes.filter((b) => b.checked).map((b) => b.value))]);
    };
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t.dataset.selectAll === formId) {
        document.querySelectorAll<HTMLInputElement>(`input[name="ids"][form="${formId}"]:not(:disabled)`).forEach((b) => (b.checked = t.checked));
      } else if (t.name === "ids" && t.getAttribute("form") === formId) {
        document.querySelectorAll<HTMLInputElement>(`input[name="ids"][form="${formId}"][value="${CSS.escape(t.value)}"]`).forEach((b) => (b.checked = t.checked));
      } else return;
      read();
    };
    document.addEventListener("change", onChange);
    read();
    return () => document.removeEventListener("change", onChange);
  }, [formId]);

  const clear = () => {
    document.querySelectorAll<HTMLInputElement>(`input[name="ids"][form="${formId}"], input[data-select-all="${formId}"]`).forEach((b) => (b.checked = false));
    setIds([]);
  };

  return (
    <>
      <form id={formId} onSubmit={(e) => e.preventDefault()} hidden />
      {ids.length > 0 && (
        <div className="sticky top-14 z-20 flex flex-wrap items-center gap-2 border-b border-border bg-accent-soft px-4 py-2" role="region" aria-label="Bulk actions">
          <span className="text-sm font-semibold text-text">{ids.length} selected</span>
          <div className="flex flex-wrap items-center gap-2">{children(ids, clear)}</div>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={clear}>
            <X className="h-4 w-4" aria-hidden /> Clear
          </Button>
        </div>
      )}
    </>
  );
}
