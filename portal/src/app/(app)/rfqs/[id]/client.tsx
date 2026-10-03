"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ClipboardPaste, Undo2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { EntityDrawer } from "@/components/ui/drawer";
import { Field, Select, Textarea } from "@/components/ui/form";
import { Alert, Card, CardHeader } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { AllocationButton } from "@/components/app/allocation-drawer";
import { ATTACHMENT_KINDS, UPLOAD_LIMITS, humanize } from "@/lib/constants";
import { validateContainer } from "@/lib/iso6346";
import { cn } from "@/lib/cn";
import { acceptRfqAction, closeRfqAction, saveBulkSurveyAction, uploadRfqFileAction } from "@/app/actions/rfqs";

export function RfqActions({ rfq, lines }: { rfq: { id: string; number: string; status: string; creditsCharged: number }; lines: { id: string; name: string; quantity: number; containerized: boolean }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [accepting, setAccepting] = useState(false);
  const [containers, setContainers] = useState<Record<string, string>>({});
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const accept = async () => {
    const map: Record<string, string[]> = {};
    const local: Record<string, string> = {};
    for (const l of lines) {
      const nums = (containers[l.id] ?? "").split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);
      if (nums.length > l.quantity) local[l.id] = `Only ${l.quantity} container(s) on this line — you entered ${nums.length}`;
      const bad = nums.map((n) => ({ n, r: validateContainer(n) })).filter((x) => !x.r.ok);
      if (bad.length) local[l.id] = bad.map((b) => `${b.n}: ${(b.r as { error: string }).error}`).join("; ");
      map[l.id] = nums;
    }
    setErrs(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    const r = await acceptRfqAction(rfq.id, map);
    setBusy(false);
    if (!r.ok) {
      toast.error(r.error);
      if (r.fieldErrors) setErrs(Object.fromEntries(Object.entries(r.fieldErrors).map(([k, v]) => [k.split(".")[0], v])));
      return;
    }
    toast.success(`Accepted — ${r.data} job order(s) created`);
    setAccepting(false);
    router.push(`/rfqs/${rfq.id}?tab=allocation`);
    router.refresh();
  };

  const close = (kind: "DECLINED" | "CANCELLED") => async (reason: string) => {
    const r = await closeRfqAction(rfq.id, kind, reason);
    if (!r.ok) return r.error;
    toast.success(kind === "DECLINED" ? "RFQ declined" : "RFQ cancelled");
    router.refresh();
  };

  if (["COMPLETED", "DECLINED", "CANCELLED"].includes(rfq.status)) return null;
  return (
    <>
      {rfq.status === "NEW" && (
        <>
          <ConfirmButton label="Decline" title={`Decline ${rfq.number}?`} description={`The customer's request is declined (e.g. no capacity, out of area). ${rfq.creditsCharged ? `${rfq.creditsCharged} credit(s) will be refunded.` : ""}`} reason confirmVariant="danger" confirmLabel="Decline RFQ" action={close("DECLINED")} />
          <Button onClick={() => setAccepting(true)}><CheckCircle2 className="h-4 w-4" aria-hidden /> Accept & create jobs</Button>
        </>
      )}
      {rfq.status !== "NEW" && (
        <ConfirmButton label="Cancel RFQ" title={`Cancel ${rfq.number}?`} description="All open job orders and assignments are cancelled and surveyors notified. Not possible once survey work has started." reason confirmVariant="danger" confirmLabel="Cancel RFQ" action={close("CANCELLED")} />
      )}
      <EntityDrawer
        open={accepting}
        onClose={() => setAccepting(false)}
        title={`Accept ${rfq.number}`}
        description="One job order is created per unit on each line. Container numbers are optional now — you can add them later."
        submitLabel="Accept & create job orders"
        onSubmit={accept}
        submitting={busy}
        dirty={Object.values(containers).some(Boolean)}
      >
        <div className="space-y-5">
          {lines.map((l) => (
            <div key={l.id} className="rounded-lg border border-border p-4">
              <p className="text-sm font-semibold">{l.name} <span className="font-normal text-muted">× {l.quantity} → {l.quantity} job order{l.quantity === 1 ? "" : "s"}</span></p>
              {l.containerized && (
                <Field label="Container numbers (one per line, optional)" error={errs[l.id]} help="ISO 6346 — spaces are fine, the check digit is verified." className="mt-3">
                  {(p) => <Textarea id={p.id} aria-describedby={p.describedBy} invalid={p.invalid} rows={Math.min(6, l.quantity + 1)} className="font-mono" value={containers[l.id] ?? ""} onChange={(e) => setContainers({ ...containers, [l.id]: e.target.value })} placeholder={"MSKU 123456 5\nTGHU 765432 1"} />}
                </Field>
              )}
            </div>
          ))}
        </div>
      </EntityDrawer>
    </>
  );
}

export function JobsAllocateBar({ jobs }: { jobs: { id: string; number: string; type: string; location: string }[] }) {
  if (!jobs.length) return null;
  return <AllocationButton jobs={jobs} label={`Allocate all unassigned (${jobs.length})`} size="md" />;
}

export function AttachmentUpload({ rfqId }: { rfqId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [kind, setKind] = useState("OTHER");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-2">
      <Select aria-label="Document type" className="h-8 w-40 text-[13px]" value={kind} onChange={(e) => setKind(e.target.value)}>
        {ATTACHMENT_KINDS.map((k) => <option key={k} value={k}>{humanize(k)}</option>)}
      </Select>
      <Button size="sm" variant="outline" loading={busy} onClick={() => ref.current?.click()} title={UPLOAD_LIMITS.document.label}>
        <Upload className="h-4 w-4" aria-hidden /> Upload
      </Button>
      <input
        ref={ref}
        type="file"
        hidden
        accept={UPLOAD_LIMITS.document.mime.join(",")}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setBusy(true);
          const fd = new FormData();
          fd.set("file", f);
          fd.set("kind", kind);
          fd.set("rfqId", rfqId);
          const r = await uploadRfqFileAction(fd);
          setBusy(false);
          if (!r.ok) return toast.error(r.error);
          toast.success("Attachment added");
          router.refresh();
        }}
      />
    </div>
  );
}

type BulkRow = { jobId: string; number: string; type: string; surveyor: string; containerNumber: string; verdict: "" | "FIT" | "UNFIT"; locked: boolean };

/** Bulk Survey: keyboard-navigable grid, paste a column of container numbers, inline FIT/UNFIT, save + undo. */
export function BulkSurveyGrid({ rfqId, rows: initial }: { rfqId: string; rows: BulkRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState(initial);
  const [history, setHistory] = useState<BulkRow[][]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const dirty = JSON.stringify(rows) !== JSON.stringify(initial);

  const change = (next: BulkRow[]) => {
    setHistory((h) => [...h.slice(-30), rows]);
    setRows(next);
  };
  const set = (i: number, patch: Partial<BulkRow>) => change(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const onPaste = (i: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    const vals = text.split(/\r?\n/).map((x) => x.split("\t")[0].trim()).filter(Boolean);
    if (vals.length <= 1) return;
    e.preventDefault();
    let k = 0;
    change(rows.map((r, j) => (j >= i && !r.locked && k < vals.length ? { ...r, containerNumber: vals[k++] } : r)));
    toast.success(`Pasted ${k} container number${k === 1 ? "" : "s"}`);
  };

  const save = async () => {
    const local: Record<string, string> = {};
    for (const r of rows) if (r.containerNumber.trim()) { const v = validateContainer(r.containerNumber); if (!v.ok) local[r.jobId] = v.error; }
    setErrors(local);
    if (Object.keys(local).length) return toast.error("Fix the highlighted container numbers");
    setBusy(true);
    const r = await saveBulkSurveyAction(rfqId, rows.filter((x) => !x.locked).map(({ jobId, containerNumber, verdict }) => ({ jobId, containerNumber, verdict })));
    setBusy(false);
    if (!r.ok) {
      setErrors(r.fieldErrors ?? {});
      return toast.error(r.error);
    }
    toast.success(`${r.data} job order(s) saved`);
    setHistory([]);
    router.refresh();
  };

  const fitAll = (v: "FIT" | "UNFIT") => change(rows.map((r) => (r.locked ? r : { ...r, verdict: v })));

  return (
    <Card>
      <CardHeader
        title="Bulk survey"
        description="Tab/Enter moves down the container column. Paste a column from Excel into any cell to fill downwards."
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => fitAll("FIT")}>All FIT</Button>
            <Button variant="ghost" size="sm" onClick={() => { const prev = history[history.length - 1]; if (prev) { setRows(prev); setHistory((h) => h.slice(0, -1)); } }} disabled={!history.length}>
              <Undo2 className="h-4 w-4" aria-hidden /> Undo
            </Button>
            <Button size="sm" onClick={save} loading={busy} disabled={!dirty}>Save</Button>
          </>
        }
      />
      {dirty && <Alert tone="warning" className="m-4 mb-0">Unsaved changes.</Alert>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Bulk survey grid</caption>
          <thead>
            <tr className="bg-surface-2 text-left text-xs uppercase tracking-wide text-subtle">
              <th scope="col" className="px-4 py-2">Job</th>
              <th scope="col" className="px-4 py-2">Surveyor</th>
              <th scope="col" className="px-4 py-2"><span className="inline-flex items-center gap-1"><ClipboardPaste className="h-3.5 w-3.5" aria-hidden /> Container number</span></th>
              <th scope="col" className="px-4 py-2">Verdict</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.jobId} className="border-t border-border">
                <td className="whitespace-nowrap px-4 py-2 font-medium">{r.number}<span className="block text-xs font-normal text-subtle">{r.type}</span></td>
                <td className="px-4 py-2 text-muted">{r.surveyor}</td>
                <td className="px-4 py-2">
                  <input
                    ref={(el) => { inputs.current[i] = el; }}
                    aria-label={`Container number for ${r.number}`}
                    aria-invalid={!!errors[r.jobId] || undefined}
                    disabled={r.locked}
                    value={r.containerNumber}
                    onChange={(e) => set(i, { containerNumber: e.target.value.toUpperCase() })}
                    onPaste={(e) => onPaste(i, e)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === "ArrowDown") { e.preventDefault(); inputs.current[i + 1]?.focus(); }
                      if (e.key === "ArrowUp") { e.preventDefault(); inputs.current[i - 1]?.focus(); }
                    }}
                    className={cn("h-8 w-44 rounded-md border bg-surface px-2 font-mono text-[13px] focus:outline-none focus:ring-2 focus:ring-ring/40", errors[r.jobId] ? "border-danger" : "border-border-strong")}
                    placeholder="MSKU1234565"
                  />
                  {errors[r.jobId] && <p className="mt-0.5 text-xs text-danger">{errors[r.jobId]}</p>}
                </td>
                <td className="px-4 py-2">
                  <div role="radiogroup" aria-label={`Verdict for ${r.number}`} className="flex gap-1">
                    {(["FIT", "UNFIT"] as const).map((v) => (
                      <label key={v} className={cn("inline-flex h-8 cursor-pointer items-center rounded-md border px-3 text-xs font-semibold", r.verdict === v ? (v === "FIT" ? "tone-green border-transparent" : "tone-red border-transparent") : "border-border-strong text-muted", r.locked && "cursor-not-allowed opacity-60")}>
                        <input type="radio" className="sr-only" name={`v-${r.jobId}`} checked={r.verdict === v} disabled={r.locked} onChange={() => set(i, { verdict: v })} />
                        {v}
                      </label>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
