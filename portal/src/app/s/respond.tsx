"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EntityDrawer } from "@/components/ui/drawer";
import { Field, RadioGroup, Textarea } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { respondAction, startSurveyAction } from "@/app/actions/surveyor";

const REASONS = ["Not available on that date", "Outside my coverage area", "Not qualified for this survey type", "Fee not acceptable", "Other"];

export function RespondButtons({ assignmentId, large }: { assignmentId: string; large?: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [preset, setPreset] = useState("");
  const [text, setText] = useState("");
  const [err, setErr] = useState<string>();
  const size = large ? "lg" : "md";

  const accept = async () => {
    setBusy(true);
    const r = await respondAction(assignmentId, true, "");
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success("Accepted — the survey company has been notified");
    router.refresh();
  };
  const reject = async () => {
    const reason = preset === "Other" || !preset ? text.trim() : `${preset}${text.trim() ? ` — ${text.trim()}` : ""}`;
    if (!reason) return setErr("Please give a reason");
    setBusy(true);
    const r = await respondAction(assignmentId, false, reason);
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    toast.success("Declined — the survey company will reassign the job");
    setRejecting(false);
    router.refresh();
  };

  return (
    <div className="grid grid-cols-2 gap-2">
      <Button variant="outline" size={size} onClick={() => setRejecting(true)} disabled={busy}><X className="h-4 w-4" aria-hidden /> Reject</Button>
      <Button variant="accent" size={size} onClick={accept} loading={busy}><Check className="h-4 w-4" aria-hidden /> Accept</Button>
      <EntityDrawer
        open={rejecting}
        onClose={() => setRejecting(false)}
        variant="modal"
        size="sm"
        title="Reject this assignment?"
        description="The job goes back to the survey company for reassignment. The RFQ is not affected."
        footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setRejecting(false)}>Cancel</Button><Button variant="danger" onClick={reject} loading={busy}>Reject assignment</Button></div>}
      >
        <div className="space-y-4">
          <Field label="Reason" required error={!preset && !text ? err : undefined}>
            {() => <RadioGroup name="reason" inline={false} options={REASONS} value={preset} onChange={(v) => { setPreset(v); setErr(undefined); }} />}
          </Field>
          <Field label={preset === "Other" ? "Tell the survey company why" : "Anything to add? (optional)"} error={preset === "Other" && !text ? err : undefined}>
            {(p) => <Textarea id={p.id} invalid={p.invalid} rows={3} value={text} onChange={(e) => { setText(e.target.value); setErr(undefined); }} />}
          </Field>
        </div>
      </EntityDrawer>
    </div>
  );
}

export function StartButton({ assignmentId, label = "Start survey" }: { assignmentId: string; label?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="lg"
      variant="accent"
      className="w-full"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        const r = await startSurveyAction(assignmentId);
        setBusy(false);
        if (!r.ok) return toast.error(r.error);
        router.push(`/s/surveys/${r.data}`);
      }}
    >
      <Play className="h-4 w-4" aria-hidden /> {label}
    </Button>
  );
}
