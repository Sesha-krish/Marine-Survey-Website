"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EntityDrawer } from "@/components/ui/drawer";
import { ErrorSummary, Field, Input, RequiredLegend, Select, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { PRIORITIES, SUPPORT_TYPES, TICKET_STATUSES, UPLOAD_LIMITS, humanize } from "@/lib/constants";
import { createTicketAction, replyTicketAction, ticketStatusAction } from "@/app/actions/support";

export function NewTicketButton() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  return (
    <>
      <Button onClick={() => { setErrors({}); setDirty(false); setOpen(true); }}><Plus className="h-4 w-4" aria-hidden /> New ticket</Button>
      <EntityDrawer open={open} onClose={() => setOpen(false)} title="New support ticket" formId="ticket-form" submitLabel="Submit ticket" submitting={busy} dirty={dirty}>
        <form
          id="ticket-form"
          className="space-y-5"
          noValidate
          onChange={() => setDirty(true)}
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const r = await createTicketAction(new FormData(e.currentTarget));
            setBusy(false);
            if (!r.ok) return setErrors(r.fieldErrors && Object.keys(r.fieldErrors).length ? r.fieldErrors : { _form: r.error });
            toast.success(`Ticket ${r.data.number} raised`);
            setOpen(false);
            router.push(`/support/${r.data.id}`);
          }}
        >
          <RequiredLegend />
          <ErrorSummary errors={errors} />
          <Field label="Topic" required error={errors.topic}>{(p) => <Input id={p.id} name="topic" invalid={p.invalid} />}</Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Priority" required>{(p) => <Select id={p.id} name="priority" defaultValue="MEDIUM">{PRIORITIES.map((x) => <option key={x} value={x}>{humanize(x)}</option>)}</Select>}</Field>
            <Field label="Support type" required>{(p) => <Select id={p.id} name="supportType" defaultValue="TECHNICAL">{SUPPORT_TYPES.map((x) => <option key={x} value={x}>{humanize(x)}</option>)}</Select>}</Field>
          </div>
          <Field label="Description" required error={errors.description}>{(p) => <Textarea id={p.id} name="description" rows={6} invalid={p.invalid} placeholder="What happened, what you expected, and the RFQ / job ID if relevant" />}</Field>
          <Field label="Screenshot or document" help={`Optional — ${UPLOAD_LIMITS.document.label}`} error={errors.file}>
            {(p) => <Input id={p.id} aria-describedby={p.describedBy} name="file" type="file" accept={UPLOAD_LIMITS.document.mime.join(",")} className="py-1.5" />}
          </Field>
        </form>
      </EntityDrawer>
    </>
  );
}

export function ReplyBox({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const toast = useToast();
  const ref = useRef<HTMLFormElement>(null);
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);
  return (
    <form
      ref={ref}
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const r = await replyTicketAction(ticketId, new FormData(e.currentTarget));
        setBusy(false);
        if (!r.ok) return setErr(r.fieldErrors?.body ?? r.fieldErrors?.file ?? r.error);
        ref.current?.reset();
        setErr(undefined);
        toast.success("Reply sent");
        router.refresh();
      }}
    >
      <Field label="Reply" error={err}>{(p) => <Textarea id={p.id} name="body" rows={4} invalid={p.invalid} />}</Field>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input name="file" type="file" aria-label="Attach a file" accept={UPLOAD_LIMITS.document.mime.join(",")} className="max-w-xs py-1.5" />
        <Button type="submit" loading={busy}><Send className="h-4 w-4" aria-hidden /> Send</Button>
      </div>
    </form>
  );
}

export function TicketStatus({ ticketId, status, staff }: { ticketId: string; status: string; staff: boolean }) {
  const router = useRouter();
  const options = staff ? TICKET_STATUSES : status === "CLOSED" ? ["CLOSED", "OPEN"] : [status, "CLOSED"];
  return (
    <Select
      aria-label="Ticket status"
      className="w-52"
      value={status}
      onChange={async (e) => {
        const r = await ticketStatusAction(ticketId, e.target.value);
        if (r.ok) router.refresh();
      }}
    >
      {[...new Set(options)].map((s) => <option key={s} value={s}>{humanize(s)}{!staff && s === "CLOSED" && status !== "CLOSED" ? " (close ticket)" : ""}</option>)}
    </Select>
  );
}
