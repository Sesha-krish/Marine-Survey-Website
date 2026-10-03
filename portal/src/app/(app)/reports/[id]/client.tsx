"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Download, PenLine, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { EntityDrawer } from "@/components/ui/drawer";
import { ErrorSummary, Field, Input, RadioGroup, Select, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { amendReportAction, issueReportAction, letterheadForReportAction, reviewReportAction, sendReportAction } from "@/app/actions/reports";

type Editable = { id: string; label: string; type: string; options?: string[]; value: unknown };

export function ReportActions({
  report, letterheads, editable, verdict, verdictReason, narrative,
}: {
  report: { id: string; stage: string; status: string; letterheadId: string | null; customerEmail: string };
  letterheads: { id: string; label: string }[];
  editable: Editable[];
  verdict: string | null;
  verdictReason: string | null;
  narrative: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const issued = ["ISSUED", "REISSUED"].includes(report.status);
  const done = (msg: string) => { toast.success(msg); router.refresh(); };

  return (
    <>
      <Button variant="outline" onClick={() => window.print()} title="Print or save as PDF">
        <Download className="h-4 w-4" aria-hidden /> Download PDF
      </Button>
      {!issued && report.stage !== "SIGNED" && letterheads.length > 0 && (
        <Select
          aria-label="Report letterhead"
          className="w-48"
          value={report.letterheadId ?? ""}
          onChange={async (e) => {
            const r = await letterheadForReportAction(report.id, e.target.value || null);
            if (!r.ok) return toast.error(r.error);
            done("Letterhead changed");
          }}
        >
          <option value="">Default letterhead</option>
          {letterheads.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
        </Select>
      )}
      {["GENERATED", "AMENDED"].includes(report.status) && report.stage !== "SIGNED" && (
        <ConfirmButton label="Send for review" title="Send for internal review?" confirmLabel="Send for review" action={async () => { const r = await reviewReportAction(report.id); if (!r.ok) return r.error; done("Marked as under review"); }} />
      )}
      {["GENERATED", "UNDER_REVIEW", "AMENDED"].includes(report.status) && report.stage !== "SIGNED" && (
        <ConfirmButton
          variant="accent"
          label={report.status === "AMENDED" ? "Re-issue" : "Issue report"}
          title={report.status === "AMENDED" ? "Re-issue the amended report?" : "Issue this report?"}
          description={<>Issuing <strong>locks</strong> this version permanently. Later corrections create a new tracked version.{report.stage === "FORMAL" ? " A Signed Report with a tamper-evident hash is produced automatically." : ""}</>}
          confirmLabel="Issue & lock"
          action={async () => { const r = await issueReportAction(report.id); if (!r.ok) return r.error; done("Report issued and locked"); }}
        />
      )}
      {report.stage !== "SIGNED" && <AmendButton reportId={report.id} issued={issued} editable={editable} verdict={verdict} verdictReason={verdictReason} narrative={narrative} />}
      {issued && <SendButton reportId={report.id} defaultTo={report.customerEmail} />}
    </>
  );
}

function AmendButton({ reportId, issued, editable, verdict, verdictReason, narrative }: { reportId: string; issued: boolean; editable: Editable[]; verdict: string | null; verdictReason: string | null; narrative: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState<Record<string, unknown>>({});
  const [v, setV] = useState(verdict);
  const [vr, setVr] = useState(verdictReason ?? "");
  const [nar, setNar] = useState(narrative ?? "");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");

  const submit = async () => {
    setBusy(true);
    const r = await amendReportAction(reportId, { changes: vals, verdict: v, verdictReason: vr || null, narrative: nar || null, reason });
    setBusy(false);
    if (!r.ok) return setErrors(r.fieldErrors && Object.keys(r.fieldErrors).length ? r.fieldErrors : { _form: r.error });
    toast.success(`Version ${r.data} created${issued ? " — re-issue to lock it" : ""}`);
    setOpen(false);
    setVals({});
    router.refresh();
  };

  const shown = editable.filter((f) => !filter || f.label.toLowerCase().includes(filter.toLowerCase()));
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}><PenLine className="h-4 w-4" aria-hidden /> {issued ? "Amend" : "Correct values"}</Button>
      <EntityDrawer open={open} onClose={() => setOpen(false)} size="lg" title="Tracked amendment" description="Change structured values only. A new version is created; earlier versions stay immutable and the change is recorded in the audit log." dirty={Object.keys(vals).length > 0 || !!reason} onSubmit={submit} submitting={busy} submitLabel="Create new version">
        <div className="space-y-5">
          <ErrorSummary errors={errors} />
          <Alert tone="warning">Survey reports are evidence. Every amendment shows an “Amended on … by …” banner on the document.</Alert>
          <Field label="Reason for amendment" required error={errors.reason}>
            {(p) => <Textarea id={p.id} invalid={p.invalid} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Typo in liner seal number reported by the surveyor" />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Verdict">{() => <RadioGroup name="verdict" options={["FIT", "UNFIT"]} value={v} onChange={setV} />}</Field>
            {v === "UNFIT" && <Field label="UNFIT reason" required error={errors.__verdictReason}>{(p) => <Input id={p.id} value={vr} onChange={(e) => setVr(e.target.value)} />}</Field>}
          </div>
          <Input aria-label="Find a field" placeholder="Find a field…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <div className="grid gap-4 sm:grid-cols-2">
            {shown.map((f) => {
              const cur = (f.id in vals ? vals[f.id] : f.value) as string;
              return (
                <Field key={f.id} label={<>{f.label}{f.id in vals && <span className="ml-1 text-xs text-warning">(changed)</span>}</>} error={errors[f.id]}>
                  {(p) =>
                    f.options ? (
                      <Select id={p.id} invalid={p.invalid} value={String(cur ?? "")} onChange={(e) => setVals({ ...vals, [f.id]: e.target.value })}>
                        {f.options.map((o) => <option key={o}>{o}</option>)}
                      </Select>
                    ) : f.type === "textarea" ? (
                      <Textarea id={p.id} invalid={p.invalid} rows={2} value={String(cur ?? "")} onChange={(e) => setVals({ ...vals, [f.id]: e.target.value })} />
                    ) : (
                      <Input id={p.id} invalid={p.invalid} type={f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "time" ? "time" : "text"} value={String(cur ?? "")} onChange={(e) => setVals({ ...vals, [f.id]: f.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value })} />
                    )
                  }
                </Field>
              );
            })}
          </div>
          <Field label="Narrative (plain text, optional)" help="No HTML, images or links — the narrative is printed as text.">
            {(p) => <Textarea id={p.id} aria-describedby={p.describedBy} rows={4} value={nar} onChange={(e) => setNar(e.target.value)} />}
          </Field>
        </div>
      </EntityDrawer>
    </>
  );
}

function SendButton({ reportId, defaultTo }: { reportId: string; defaultTo: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(defaultTo);
  const [link, setLink] = useState<string | null>(null);
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button onClick={() => { setLink(null); setOpen(true); }}><Send className="h-4 w-4" aria-hidden /> Send to requester</Button>
      <EntityDrawer
        open={open}
        onClose={() => setOpen(false)}
        variant="modal"
        size="sm"
        title="Send to requester"
        description="Creates a secure link to this exact version, valid for 30 days."
        footer={
          link ? (
            <div className="flex justify-end"><Button onClick={() => setOpen(false)}>Done</Button></div>
          ) : (
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
              <Button
                loading={busy}
                onClick={async () => {
                  setBusy(true);
                  const r = await sendReportAction(reportId, to);
                  setBusy(false);
                  if (!r.ok) return setErr(r.error);
                  setLink(r.data);
                  toast.success("Report sent — link recorded on the timeline");
                  router.refresh();
                }}
              >
                Send
              </Button>
            </div>
          )
        }
      >
        {link ? (
          <div className="space-y-3">
            <Alert tone="success" title="Link created">Email delivery is not configured in this environment — copy the link into your email to {to}.</Alert>
            <div className="flex gap-2">
              <Input readOnly value={link} aria-label="Secure report link" onFocus={(e) => e.target.select()} />
              <Button variant="outline" size="icon" aria-label="Copy link" onClick={() => { navigator.clipboard?.writeText(link); toast.success("Copied"); }}><Copy className="h-4 w-4" /></Button>
            </div>
          </div>
        ) : (
          <Field label="Requester email" required error={err}>
            {(p) => <Input id={p.id} invalid={p.invalid} type="email" value={to} onChange={(e) => { setTo(e.target.value); setErr(undefined); }} />}
          </Field>
        )}
      </EntityDrawer>
    </>
  );
}
