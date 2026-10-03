"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./button";

/**
 * The ONE form container: a native <dialog> (focus trap, aria-modal, inert background, ESC)
 * rendered as a right-side drawer or centred modal, with sticky header/footer,
 * Cancel + Submit, and an unsaved-changes guard.
 */
export function EntityDrawer({
  open, onClose, title, description, children, footer, dirty = false, size = "md", variant = "drawer", submitLabel, onSubmit, submitting, submitDisabled, formId,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  dirty?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  variant?: "drawer" | "modal";
  submitLabel?: string;
  onSubmit?: () => void;
  submitting?: boolean;
  submitDisabled?: boolean;
  formId?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      setConfirming(false);
    } else if (!open && d.open) d.close();
  }, [open]);

  const requestClose = () => {
    if (dirty && !confirming) {
      setConfirming(true);
      return;
    }
    onClose();
  };

  const widths = { sm: "sm:max-w-md", md: "sm:max-w-xl", lg: "sm:max-w-3xl", xl: "sm:max-w-5xl" };

  return (
    <dialog
      ref={ref}
      aria-modal="true"
      aria-labelledby="drawer-title"
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) requestClose();
      }}
      className={cn(
        "m-0 max-h-none max-w-none bg-transparent p-0 text-text backdrop:bg-[rgb(2_8_23/0.55)] backdrop:backdrop-blur-[2px]",
        variant === "drawer" ? "ml-auto h-dvh w-full" : "mx-auto my-auto h-auto w-[calc(100%-2rem)]",
        widths[size],
      )}
    >
      <div className={cn("flex flex-col bg-surface shadow-pop", variant === "drawer" ? "h-dvh border-l border-border" : "max-h-[90dvh] rounded-xl border border-border")}>
        <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-surface px-5 py-4">
          <div className="min-w-0">
            <h2 id="drawer-title" className="text-base font-semibold text-text">{title}</h2>
            {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
          </div>
          <Button variant="ghost" size="icon" aria-label="Close" onClick={requestClose}>
            <X className="h-4 w-4" />
          </Button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        <footer className="sticky bottom-0 border-t border-border bg-surface px-5 py-3">
          {confirming ? (
            <div className="flex flex-wrap items-center justify-between gap-2" role="alert">
              <p className="text-sm text-text">Discard unsaved changes?</p>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setConfirming(false)}>Keep editing</Button>
                <Button variant="danger" onClick={onClose}>Discard</Button>
              </div>
            </div>
          ) : (
            footer ?? (
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={requestClose}>Cancel</Button>
                {(onSubmit || formId) && (
                  <Button type={formId ? "submit" : "button"} form={formId} onClick={formId ? undefined : onSubmit} loading={submitting} disabled={submitDisabled}>
                    {submitLabel ?? "Save"}
                  </Button>
                )}
              </div>
            )
          )}
        </footer>
      </div>
    </dialog>
  );
}
