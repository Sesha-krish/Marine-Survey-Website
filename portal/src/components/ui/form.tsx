"use client";
import { forwardRef, useId } from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/cn";

const control =
  "w-full rounded-lg border bg-surface px-3 text-sm text-text placeholder:text-subtle transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-ring disabled:bg-surface-2 disabled:text-subtle";

export function controlClass(invalid?: boolean, className?: string) {
  return cn(control, invalid ? "border-danger" : "border-border-strong", className);
}

/** Label + control + help + error, with proper aria wiring. Required marker is always "*" after the label. */
export function Field({
  label, required, error, help, children, className, htmlFor,
}: {
  label: React.ReactNode;
  required?: boolean;
  error?: string;
  help?: React.ReactNode;
  children: (ids: { id: string; describedBy?: string; invalid: boolean }) => React.ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  const auto = useId();
  const id = htmlFor ?? auto;
  const helpId = help ? `${id}-help` : undefined;
  const errId = error ? `${id}-err` : undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-[13px] font-medium text-text">
        {label}
        {required && <span className="ml-0.5 text-danger" aria-hidden>*</span>}
        {required && <span className="sr-only"> (required)</span>}
      </label>
      {children({ id, describedBy: [helpId, errId].filter(Boolean).join(" ") || undefined, invalid: !!error })}
      {help && !error && <p id={helpId} className="text-xs text-muted">{help}</p>}
      {error && (
        <p id={errId} className="flex items-start gap-1 text-xs font-medium text-danger" role="alert">
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden /> {error}
        </p>
      )}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input(
  { invalid, className, ...rest },
  ref,
) {
  return <input ref={ref} aria-invalid={invalid || undefined} className={controlClass(invalid, cn("h-9", className))} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(function Textarea(
  { invalid, className, rows = 3, ...rest },
  ref,
) {
  return <textarea ref={ref} rows={rows} aria-invalid={invalid || undefined} className={controlClass(invalid, cn("py-2 leading-relaxed", className))} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean; placeholder?: string }>(function Select(
  { invalid, className, children, placeholder, ...rest },
  ref,
) {
  return (
    <select ref={ref} aria-invalid={invalid || undefined} className={controlClass(invalid, cn("h-9 pr-8", className))} {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {children}
    </select>
  );
});

export function RequiredLegend() {
  return (
    <p className="text-xs text-muted">
      Fields marked <span className="text-danger">*</span> are required.
    </p>
  );
}

export function ErrorSummary({ errors, title = "Please fix the following" }: { errors: Record<string, string>; title?: string }) {
  const list = Object.entries(errors).filter(([k]) => k !== "_form");
  if (!list.length && !errors._form) return null;
  return (
    <div role="alert" className="rounded-lg border border-danger/40 bg-danger-soft p-3 text-sm text-danger">
      <p className="font-semibold">{errors._form ?? title}</p>
      {list.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          {list.slice(0, 8).map(([k, v]) => (
            <li key={k}>{v}</li>
          ))}
          {list.length > 8 && <li>…and {list.length - 8} more</li>}
        </ul>
      )}
    </div>
  );
}

export function Checkbox({ label, className, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode }) {
  return (
    <label className={cn("inline-flex cursor-pointer items-start gap-2 text-sm text-text", className)}>
      <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 rounded border-border-strong accent-[var(--accent-strong)]" {...rest} />
      <span>{label}</span>
    </label>
  );
}

export function RadioGroup({
  name, options, value, onChange, invalid, labels, inline = true, describedBy,
}: {
  name: string;
  options: readonly string[];
  value?: string | null;
  onChange: (v: string) => void;
  invalid?: boolean;
  labels?: Record<string, string>;
  inline?: boolean;
  describedBy?: string;
}) {
  return (
    <div role="radiogroup" aria-invalid={invalid || undefined} aria-describedby={describedBy} className={cn("flex gap-2", inline ? "flex-wrap" : "flex-col")}>
      {options.map((o) => {
        const checked = value === o;
        return (
          <label
            key={o}
            className={cn(
              "inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm transition-colors",
              checked ? "border-accent-strong bg-accent-soft font-medium text-text" : "border-border-strong bg-surface text-muted hover:bg-surface-2",
              invalid && !value && "border-danger",
            )}
          >
            <input type="radio" name={name} value={o} checked={checked} onChange={() => onChange(o)} className="h-4 w-4 accent-[var(--accent-strong)]" />
            {labels?.[o] ?? o}
          </label>
        );
      })}
    </div>
  );
}
