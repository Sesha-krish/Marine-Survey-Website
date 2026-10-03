"use client";
import { useState } from "react";
import { EntityDrawer } from "./drawer";
import { Field, Textarea } from "./form";
import { Button, type buttonClass } from "./button";

type Variant = Parameters<typeof buttonClass>[0];

/**
 * Button that opens a confirmation modal. `reason` collects a mandatory note (decline, cancel, reject…).
 * `action` returns an error string to show, or nothing on success.
 */
export function ConfirmButton({
  label, title, description, confirmLabel = "Confirm", variant = "secondary", confirmVariant = "primary", reason, reasonLabel = "Reason", size = "md", action, icon, disabled,
}: {
  label: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  variant?: Variant;
  confirmVariant?: Variant;
  reason?: boolean;
  reasonLabel?: string;
  size?: "sm" | "md";
  icon?: React.ReactNode;
  disabled?: boolean;
  action: (reason: string) => Promise<string | void>;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (reason && !text.trim()) return setErr(`${reasonLabel} is required`);
    setBusy(true);
    const e = await action(text.trim());
    setBusy(false);
    if (e) setErr(e);
    else {
      setOpen(false);
      setText("");
    }
  };
  return (
    <>
      <Button variant={variant} size={size} onClick={() => { setErr(undefined); setOpen(true); }} disabled={disabled}>
        {icon}
        {label}
      </Button>
      <EntityDrawer
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        variant="modal"
        size="sm"
        dirty={!!text}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant={confirmVariant} onClick={submit} loading={busy}>{confirmLabel}</Button>
          </div>
        }
      >
        {description && <div className="mb-4 text-sm text-muted">{description}</div>}
        {reason && (
          <Field label={reasonLabel} required error={err}>
            {(p) => <Textarea id={p.id} aria-describedby={p.describedBy} invalid={p.invalid} value={text} onChange={(e) => { setText(e.target.value); setErr(undefined); }} rows={3} autoFocus />}
          </Field>
        )}
        {!reason && err && <p className="text-sm text-danger" role="alert">{err}</p>}
      </EntityDrawer>
    </>
  );
}
