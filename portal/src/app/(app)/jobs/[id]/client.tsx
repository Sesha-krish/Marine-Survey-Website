"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm";
import { EntityDrawer } from "@/components/ui/drawer";
import { Field, Input } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { toDateInput } from "@/lib/format";
import { validateContainer } from "@/lib/iso6346";
import { cancelAssignmentAction, cancelJobAction, preliminaryAction, reviewSurveyAction, updateJobAction } from "@/app/actions/jobs";

export function JobActions({ job }: { job: { id: string; status: string; containerNumber: string; surveyDate: string; location: string } }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ containerNumber: job.containerNumber, surveyDate: toDateInput(job.surveyDate), location: job.location });
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  if (["COMPLETED", "CANCELLED"].includes(job.status)) return null;

  const save = async () => {
    if (v.containerNumber.trim()) {
      const c = validateContainer(v.containerNumber);
      if (!c.ok) return setErr({ containerNumber: c.error });
    }
    setBusy(true);
    const r = await updateJobAction(job.id, v);
    setBusy(false);
    if (!r.ok) return setErr(r.fieldErrors ?? { _form: r.error });
    toast.success("Job order updated — assigned surveyors were notified of date/location changes");
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}><Pencil className="h-4 w-4" aria-hidden /> Edit</Button>
      <ConfirmButton
        label="Cancel job"
        title="Cancel this job order?"
        description="Active assignments are withdrawn and the surveyors notified. The RFQ stays open for its other jobs."
        reason
        confirmVariant="danger"
        confirmLabel="Cancel job"
        action={async (reason) => {
          const r = await cancelJobAction(job.id, reason);
          if (!r.ok) return r.error;
          toast.success("Job order cancelled");
          router.refresh();
        }}
      />
      <EntityDrawer open={open} onClose={() => setOpen(false)} title="Edit job order" onSubmit={save} submitting={busy} submitLabel="Save" dirty variant="modal" size="sm">
        <div className="space-y-4">
          {err._form && <p className="text-sm text-danger" role="alert">{err._form}</p>}
          <Field label="Container number" error={err.containerNumber} help="ISO 6346 with check digit">
            {(p) => <Input id={p.id} aria-describedby={p.describedBy} invalid={p.invalid} className="font-mono" value={v.containerNumber} onChange={(e) => { setV({ ...v, containerNumber: e.target.value.toUpperCase() }); setErr({}); }} />}
          </Field>
          <Field label="Date of survey">{(p) => <Input id={p.id} type="date" value={v.surveyDate} onChange={(e) => setV({ ...v, surveyDate: e.target.value })} />}</Field>
          <Field label="Location">{(p) => <Input id={p.id} value={v.location} onChange={(e) => setV({ ...v, location: e.target.value })} />}</Field>
        </div>
      </EntityDrawer>
    </>
  );
}

export function WithdrawAssignment({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const toast = useToast();
  return (
    <ConfirmButton
      size="sm"
      variant="ghost"
      label="Withdraw"
      title={`Withdraw assignment from ${name}?`}
      description="The surveyor is notified. If no one else is assigned, the job returns to New for reallocation."
      reason
      confirmVariant="danger"
      confirmLabel="Withdraw"
      action={async (reason) => {
        const r = await cancelAssignmentAction(id, reason);
        if (!r.ok) return r.error;
        toast.success("Assignment withdrawn");
        router.refresh();
      }}
    />
  );
}

export function ReviewSurvey({ surveyId, status }: { surveyId: string; status: string }) {
  const router = useRouter();
  const toast = useToast();
  return (
    <>
      {status === "IN_PROGRESS" && (
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            const r = await preliminaryAction(surveyId);
            if (!r.ok) return toast.error(r.error);
            toast.success("Preliminary report generated from the data captured so far");
            router.refresh();
          }}
        >
          Generate preliminary report
        </Button>
      )}
      {status === "SUBMITTED" && (
        <>
          <ConfirmButton
            size="sm"
            label="Return to surveyor"
            title="Return the survey for corrections?"
            reason
            reasonLabel="What needs fixing"
            confirmLabel="Return survey"
            action={async (note) => {
              const r = await reviewSurveyAction(surveyId, false, note);
              if (!r.ok) return r.error;
              toast.success("Returned — the surveyor has been notified");
              router.refresh();
            }}
          />
          <ConfirmButton
            size="sm"
            variant="accent"
            label="Approve survey"
            title="Approve the survey data?"
            description="The job order becomes Completed. You can then issue the certificate and formal report."
            confirmLabel="Approve"
            action={async () => {
              const r = await reviewSurveyAction(surveyId, true, "");
              if (!r.ok) return r.error;
              toast.success("Survey approved — job completed");
              router.refresh();
            }}
          />
        </>
      )}
    </>
  );
}
