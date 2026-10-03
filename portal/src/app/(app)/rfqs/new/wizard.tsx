"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CloudOff, Loader2, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/misc";
import { ErrorSummary } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { agentSchema, attachmentsStepSchema, flattenErrors, intakeSchema, surveyDetailsSchema, surveyTypesStepSchema } from "@/lib/schemas";
import { deleteDraftAction, saveDraftAction, submitRfqAction } from "@/app/actions/rfqs";
import { AgentStep, AttachmentsStep, CustomerStep, DetailsStep, ReviewStep, SurveyStep } from "./steps";

export type Taxonomy = {
  id: string;
  name: string;
  subs: { id: string; name: string; quantityLabel: string; types: { id: string; name: string; creditCost: number; scope: string[] }[] }[];
}[];

export type PickedCustomer = { id: string; displayName: string; email: string; phone: string; city: string; customerType: string };
export type Line = { key: string; surveyTypeId: string; quantity: number; scope: string[]; scopeOther?: string };

export type WizardData = {
  customer: PickedCustomer | null;
  intake: { requestSource: string; requestReceivedAt: string; contactPerson?: string; contactDetails?: string; initialNotes?: string };
  survey: { cargoName: string; cargoQuantity: string; lines: Line[] };
  details: {
    surveyArea: string; areaName: string; locationName: string; lat?: number | null; lng?: number | null; surveyDate: string;
    currency: "INR" | "USD"; estimatedRate: string; paymentTerms: string; actingOnBehalfOf?: string; piClub?: string;
    jointInspection: boolean; jointInspectors: { name: string; onBehalfOf: string; role: string }[];
  };
  agent: { agentId?: string; companyName: string; email: string; phone: string; address: string; contacts: { name: string; phone?: string; email?: string }[] };
  files: { attachments: { id: string; kind: string; fileName: string; size?: number }[] };
};

const STEPS = ["Customer & request", "Survey types", "Survey details", "Agent details", "Attachments", "Review & submit"];

function nowLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function initial(home: "INR" | "USD", pre: PickedCustomer | null): WizardData {
  return {
    customer: pre,
    intake: { requestSource: "PHONE", requestReceivedAt: nowLocal() },
    survey: { cargoName: "", cargoQuantity: "", lines: [] },
    details: { surveyArea: "", areaName: "", locationName: "", surveyDate: "", currency: home, estimatedRate: "", paymentTerms: "", jointInspection: false, jointInspectors: [] },
    agent: { companyName: "", email: "", phone: "", address: "", contacts: [] },
    files: { attachments: [] },
  };
}

/** Per-step validation, prefixing keys so errors map to fields. */
export function validateStep(step: number, d: WizardData): Record<string, string> {
  const pref = (p: string, e: Record<string, string>) => Object.fromEntries(Object.entries(e).map(([k, v]) => [`${p}.${k}`, v]));
  switch (step) {
    case 0: {
      const e: Record<string, string> = {};
      if (!d.customer) e.customer = "Select an existing customer or add a new one";
      const r = intakeSchema.safeParse(d.intake);
      return { ...e, ...(r.success ? {} : pref("intake", flattenErrors(r.error))) };
    }
    case 1: {
      const r = surveyTypesStepSchema.safeParse(d.survey);
      return r.success ? {} : pref("survey", flattenErrors(r.error));
    }
    case 2: {
      const r = surveyDetailsSchema.safeParse(d.details);
      const e = r.success ? {} : pref("details", flattenErrors(r.error));
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
      if (d.details.surveyDate && d.details.surveyDate < today) e["details.surveyDate"] = "Date of survey can't be in the past";
      return e;
    }
    case 3: {
      const r = agentSchema.safeParse(d.agent);
      return r.success ? {} : pref("agent", flattenErrors(r.error));
    }
    case 4: {
      const r = attachmentsStepSchema.safeParse(d.files);
      return r.success ? {} : pref("files", flattenErrors(r.error));
    }
    default:
      return {};
  }
}

export function RfqWizard({
  taxonomy, homeCurrency, draft, preCustomer,
}: {
  taxonomy: Taxonomy;
  homeCurrency: "INR" | "USD";
  draft: { id: string; step: number; data: WizardData & { maxStep?: number } } | null;
  preCustomer: PickedCustomer | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<WizardData>(() => {
    if (!draft) return initial(homeCurrency, preCustomer);
    const base = initial(homeCurrency, null);
    return { ...base, ...draft.data, customer: draft.data.customer ?? preCustomer };
  });
  const [step, setStep] = useState(draft?.step ?? 0);
  const [maxStep, setMaxStep] = useState(draft?.data.maxStep ?? draft?.step ?? 0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showSummary, setShowSummary] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(draft?.id ?? null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(draft ? "saved" : "idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const dirtyRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Autosave: debounce changes into a server-side draft.
  const persist = useCallback(
    async (d: WizardData, s: number, m: number) => {
      setSaveState("saving");
      const r = await saveDraftAction(draftId, s, { ...d, maxStep: m });
      if (r.ok) {
        setDraftId(r.data.id);
        setSavedAt(r.data.savedAt);
        setSaveState("saved");
        dirtyRef.current = false;
        if (!draftId) window.history.replaceState(null, "", `/rfqs/new?draft=${r.data.id}`);
      } else setSaveState("error");
    },
    [draftId],
  );

  useEffect(() => {
    if (!dirtyRef.current) return;
    const t = setTimeout(() => persist(data, step, maxStep), 1200);
    return () => clearTimeout(t);
  }, [data, step, maxStep, persist]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  const update = useCallback(<K extends keyof WizardData>(k: K, v: WizardData[K]) => {
    dirtyRef.current = true;
    setData((d) => {
      const next = { ...d, [k]: v };
      // Clear errors as soon as they're corrected
      setErrors((old) => {
        if (!Object.keys(old).length) return old;
        const fresh = validateStep(step, next);
        return Object.fromEntries(Object.entries(old).filter(([key]) => fresh[key])) as Record<string, string>;
      });
      return next;
    });
  }, [step]);

  const stepStatus = useMemo(() => STEPS.map((_, i) => (i <= maxStep && i < 5 ? (Object.keys(validateStep(i, data)).length ? "error" : "done") : "todo")), [data, maxStep]);

  const go = (target: number) => {
    setStep(target);
    setErrors({});
    setShowSummary(false);
    dirtyRef.current = true;
    requestAnimationFrame(() => headingRef.current?.focus());
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const next = () => {
    const e = validateStep(step, data);
    setErrors(e);
    setShowSummary(true);
    if (Object.keys(e).length) return;
    const n = Math.min(5, step + 1);
    setMaxStep((m) => Math.max(m, n));
    go(n);
  };

  const submit = async () => {
    // Re-validate every step; jump to the first broken one
    for (let i = 0; i < 5; i++) {
      const e = validateStep(i, data);
      if (Object.keys(e).length) {
        go(i);
        setErrors(e);
        setShowSummary(true);
        toast.error(`Step ${i + 1} (${STEPS[i]}) needs attention`);
        return;
      }
    }
    setSubmitting(true);
    const payload = {
      customerId: data.customer!.id,
      intake: { ...data.intake, requestReceivedAt: new Date(data.intake.requestReceivedAt).toISOString() },
      survey: { ...data.survey, lines: data.survey.lines.map((l) => ({ surveyTypeId: l.surveyTypeId, quantity: l.quantity, scope: l.scope, scopeOther: l.scopeOther })) },
      details: { ...data.details, estimatedRate: Number(data.details.estimatedRate) },
      agent: data.agent,
      files: data.files,
    };
    const r = await submitRfqAction(draftId, payload);
    setSubmitting(false);
    if (!r.ok) {
      toast.error(r.error);
      if (r.fieldErrors) {
        setErrors(r.fieldErrors);
        setShowSummary(true);
      }
      return;
    }
    dirtyRef.current = false;
    toast.success(`RFQ ${r.data.number} created`);
    router.push(`/rfqs/${r.data.id}?created=1`);
  };

  const discard = async () => {
    if (draftId) await deleteDraftAction(draftId);
    dirtyRef.current = false;
    router.push("/rfqs/new");
    router.refresh();
  };

  const Step = [CustomerStep, SurveyStep, DetailsStep, AgentStep, AttachmentsStep, ReviewStep][step];

  return (
    <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
      <nav aria-label="RFQ steps" className="min-w-0 lg:sticky lg:top-20 lg:self-start">
        <ol className="relative flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-1">
          {STEPS.map((label, i) => {
            const reachable = i <= maxStep;
            const st = stepStatus[i];
            return (
              <li key={label} className="shrink-0">
                <button
                  disabled={!reachable}
                  onClick={() => reachable && go(i)}
                  aria-current={i === step ? "step" : undefined}
                  title={!reachable ? "Complete the earlier steps first" : undefined}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                    i === step ? "bg-accent-soft font-semibold text-text" : reachable ? "text-text hover:bg-surface-2" : "cursor-not-allowed text-subtle",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                      st === "done" && i !== step && "border-success bg-success text-white dark:text-[#04200d]",
                      st === "error" && i !== step && "border-danger text-danger",
                      i === step && "border-accent-strong bg-accent-strong text-white dark:text-[#04201c]",
                      st === "todo" && i !== step && "border-border-strong",
                    )}
                    aria-hidden
                  >
                    {st === "done" && i !== step ? <Check className="h-3.5 w-3.5" /> : st === "error" && i !== step ? "!" : i + 1}
                  </span>
                  <span className="whitespace-nowrap">{label}</span>
                  <span className="sr-only">{st === "done" ? "(complete)" : st === "error" ? "(needs attention)" : reachable ? "" : "(locked)"}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <div className="mt-3 hidden items-center gap-2 px-3 text-xs text-muted lg:flex" aria-live="polite">
          {saveState === "saving" && (<><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving draft…</>)}
          {saveState === "saved" && (<><Save className="h-3.5 w-3.5" /> Draft saved{savedAt ? ` ${new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}</>)}
          {saveState === "error" && (<><CloudOff className="h-3.5 w-3.5 text-danger" /> Couldn&apos;t save draft</>)}
        </div>
        {draftId && (
          <button onClick={discard} className="mt-2 hidden items-center gap-1.5 px-3 text-xs text-danger hover:underline lg:flex">
            <Trash2 className="h-3.5 w-3.5" aria-hidden /> Discard draft
          </button>
        )}
      </nav>

      <Card className="min-w-0">
        <div className="border-b border-border px-5 py-4 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Step {step + 1} of {STEPS.length}</p>
          <h2 ref={headingRef} tabIndex={-1} className="mt-0.5 text-lg font-semibold outline-none">{STEPS[step]}</h2>
        </div>
        <div className="space-y-6 px-5 py-6 sm:px-6">
          {showSummary && <ErrorSummary errors={errors} />}
          <Step data={data} update={update} errors={errors} taxonomy={taxonomy} goTo={go} />
        </div>
        <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-b-xl border-t border-border bg-surface px-5 py-3 sm:px-6">
          <Button variant="secondary" onClick={() => go(Math.max(0, step - 1))} disabled={step === 0}>Back</Button>
          <span className="text-xs text-muted lg:hidden" aria-live="polite">{saveState === "saving" ? "Saving…" : saveState === "saved" ? "Draft saved" : ""}</span>
          {step < 5 ? (
            <Button onClick={next}>Save & continue</Button>
          ) : (
            <ReviewSubmitButton data={data} submitting={submitting} onSubmit={submit} taxonomy={taxonomy} />
          )}
        </div>
      </Card>
    </div>
  );
}

function ReviewSubmitButton({ data, taxonomy, submitting, onSubmit }: { data: WizardData; taxonomy: Taxonomy; submitting: boolean; onSubmit: () => void }) {
  const cost = data.survey.lines.reduce((s, l) => s + (taxonomy.flatMap((c) => c.subs.flatMap((x) => x.types)).find((t) => t.id === l.surveyTypeId)?.creditCost ?? 1), 0);
  return (
    <Button variant="accent" onClick={onSubmit} loading={submitting}>
      Submit RFQ ({cost} credit{cost === 1 ? "" : "s"})
    </Button>
  );
}
