"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Camera, CheckCircle2, CloudOff, CloudUpload, ImagePlus, Loader2, Plus, RotateCcw, Trash2, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, RadioGroup, Select, Textarea } from "@/components/ui/form";
import { Alert, Badge, Card, StatusPill } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { fmtDate } from "@/lib/format";
import { formatContainer, normalizeContainer } from "@/lib/iso6346";
import { allFields, computeValue, validateField, validateSurvey } from "@/lib/templates/validate";
import type { Answers, Field as TField, TemplateSchema } from "@/lib/templates/types";
import { clearLocal, compressImage, currentPosition, dequeuePhoto, loadLocal, queuePhoto, queuedPhotos, saveLocal } from "@/lib/offline";
import { submitSurveyAction } from "@/app/actions/surveyor";

type Photo = { slot: string; url: string; takenAt: string; queued?: boolean };
type SyncState = "synced" | "pending" | "syncing" | "offline" | "error";

export function SurveyForm({
  survey, job, schema, photos: initialPhotos, returnNote,
}: {
  survey: { id: string; number: string; status: string; revision: number; answers: Answers; verdict: string | null; verdictReason: string | null; completionNotes: string | null };
  job: { number: string; type: string; container: string | null; location: string; surveyDate: string; assignmentId: string | null };
  schema: TemplateSchema;
  photos: Photo[];
  returnNote: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const readOnly = survey.status !== "IN_PROGRESS";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

  // Restore device draft (if newer than server) else server data, with sensible prefills.
  const [state, setState] = useState(() => {
    const local = typeof window !== "undefined" && !readOnly ? loadLocal(survey.id) : null;
    const base: Answers = { ...survey.answers };
    if (!readOnly) {
      if (base.containerNo === undefined && job.container && allFields(schema).some((f) => f.id === "containerNo")) base.containerNo = job.container;
      if (base.inspectionDate === undefined) base.inspectionDate = job.surveyDate.slice(0, 10) <= today ? job.surveyDate.slice(0, 10) : today;
      if (base.placeOfInspection === undefined) base.placeOfInspection = job.location;
    }
    if (local && local.baseRevision >= survey.revision - 0 && local.dirtyKeys.length) {
      return { answers: { ...base, ...Object.fromEntries(local.dirtyKeys.map((k) => [k, local.answers[k]])) }, dirty: new Set(local.dirtyKeys), verdict: local.verdict ?? survey.verdict, verdictReason: local.verdictReason ?? survey.verdictReason ?? "", notes: local.completionNotes ?? survey.completionNotes ?? "" };
    }
    const prefilled = Object.keys(base).filter((k) => survey.answers[k] === undefined);
    return { answers: base, dirty: new Set<string>(prefilled), verdict: survey.verdict, verdictReason: survey.verdictReason ?? "", notes: survey.completionNotes ?? "" };
  });
  const [revision, setRevision] = useState(survey.revision);
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [sync, setSync] = useState<SyncState>("synced");
  const [online, setOnline] = useState(true);
  const [submitErrors, setSubmitErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [section, setSection] = useState(0);
  const metaDirty = useRef(false);
  const inflight = useRef(false);

  const answers = state.answers;

  // Persist every change to the device immediately.
  useEffect(() => {
    if (readOnly) return;
    saveLocal(survey.id, { answers, dirtyKeys: [...state.dirty], baseRevision: revision, verdict: state.verdict, verdictReason: state.verdictReason, completionNotes: state.notes, savedAt: new Date().toISOString() });
  }, [state, revision, readOnly, survey.id, answers]);

  const flush = useCallback(async () => {
    if (readOnly || inflight.current) return;
    if (!navigator.onLine) return setSync("offline");
    inflight.current = true;
    try {
      // 1) answers
      if (state.dirty.size || metaDirty.current) {
        setSync("syncing");
        const keys = [...state.dirty];
        const r = await fetch(`/api/surveys/${survey.id}/sync`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ answers: Object.fromEntries(keys.map((k) => [k, answers[k] ?? null])), changedKeys: keys, baseRevision: revision, verdict: state.verdict, verdictReason: state.verdictReason, completionNotes: state.notes }),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "sync failed");
        const d = (await r.json()) as { revision: number; answers: Answers; conflict: boolean };
        setRevision(d.revision);
        metaDirty.current = false;
        setState((s) => {
          const stillDirty = new Set([...s.dirty].filter((k) => JSON.stringify(s.answers[k]) !== JSON.stringify(answers[k])));
          // Server merge wins for keys we didn't touch since sending.
          const merged = { ...d.answers, ...Object.fromEntries([...stillDirty].map((k) => [k, s.answers[k]])) };
          return { ...s, answers: merged, dirty: stillDirty };
        });
        if (d.conflict) toast.success("Merged with changes made on another device");
      }
      // 2) queued photos
      const q = await queuedPhotos(survey.id);
      for (const p of q) {
        setSync("syncing");
        const fd = new FormData();
        fd.set("file", new File([p.blob], `${p.slot}.jpg`, { type: "image/jpeg" }));
        fd.set("slot", p.slot);
        fd.set("takenAt", p.takenAt);
        if (p.lat != null) fd.set("lat", String(p.lat));
        if (p.lng != null) fd.set("lng", String(p.lng));
        const r = await fetch(`/api/surveys/${survey.id}/photos`, { method: "POST", body: fd });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "photo upload failed");
        const d = await r.json();
        await dequeuePhoto(p.key);
        setPhotos((ph) => [...ph.filter((x) => !(x.slot === p.slot && (!p.slot.startsWith("extra:") || x.queued))), { slot: p.slot, url: d.url, takenAt: p.takenAt }]);
      }
      setSync("synced");
    } catch (e) {
      setSync(navigator.onLine ? "error" : "offline");
      if (navigator.onLine) console.warn(e);
    } finally {
      inflight.current = false;
    }
  }, [readOnly, state, answers, revision, survey.id, toast]);

  // Debounced sync after edits; retry loop; react to connectivity.
  useEffect(() => {
    if (readOnly) return;
    if (state.dirty.size || metaDirty.current) setSync((s) => (s === "syncing" ? s : navigator.onLine ? "pending" : "offline"));
    const t = setTimeout(flush, 1500);
    return () => clearTimeout(t);
  }, [state, flush, readOnly]);
  useEffect(() => {
    if (readOnly) return;
    const up = () => { setOnline(true); flush(); };
    const down = () => { setOnline(false); setSync("offline"); };
    setOnline(navigator.onLine);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    const t = setInterval(flush, 20000);
    // Show photos captured offline on a previous visit.
    queuedPhotos(survey.id).then((q) => q.length && setPhotos((ph) => [...ph, ...q.map((p) => ({ slot: p.slot, url: URL.createObjectURL(p.blob), takenAt: p.takenAt, queued: true }))]));
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (id: string, v: unknown) => setState((s) => ({ ...s, answers: { ...s.answers, [id]: v }, dirty: new Set(s.dirty).add(id) }));
  const setMeta = (patch: Partial<{ verdict: string | null; verdictReason: string; notes: string }>) => {
    metaDirty.current = true;
    setState((s) => ({ ...s, ...patch }));
  };
  const err = (f: TField) => (touched[f.id] || submitErrors[f.id] ? validateField(f, answers, !!submitErrors[f.id]) ?? (f.id === "inspectionEnd" || f.id === "grossWeight" ? ruleError(f.id) : null) : null);
  const ruleError = (id: string) => validateSurvey(schema, answers, { final: false })[id] ?? null;

  const capture = async (slot: string, file: File | Blob) => {
    const blob = await compressImage(file);
    const pos = await currentPosition();
    const takenAt = new Date().toISOString();
    const key = `${survey.id}:${slot}:${Date.now()}`;
    const ok = await queuePhoto({ key, surveyId: survey.id, slot, blob, takenAt, lat: pos?.lat ?? null, lng: pos?.lng ?? null });
    setPhotos((ph) => [...ph.filter((x) => slot.startsWith("extra:") || x.slot !== slot), { slot, url: URL.createObjectURL(blob), takenAt, queued: true }]);
    if (!ok) toast.error("Couldn't store the photo on this device — keep the app open until it uploads");
    flush();
  };
  const removePhoto = async (slot: string) => {
    for (const q of await queuedPhotos(survey.id)) if (q.slot === slot) await dequeuePhoto(q.key);
    setPhotos((ph) => ph.filter((x) => x.slot !== slot));
    if (navigator.onLine) await fetch(`/api/surveys/${survey.id}/photos?slot=${encodeURIComponent(slot)}`, { method: "DELETE" });
  };

  const submit = async () => {
    await flush();
    const slots = new Set(photos.filter((p) => !p.slot.startsWith("sig:")).map((p) => p.slot));
    const sigs = new Set(photos.filter((p) => p.slot.startsWith("sig:")).map((p) => p.slot.slice(4)));
    const e = validateSurvey(schema, answers, { final: true, photoSlots: slots, signatures: sigs, verdict: state.verdict, verdictReason: state.verdictReason });
    setSubmitErrors(e);
    if (Object.keys(e).length) {
      toast.error(`${Object.keys(e).length} item(s) need attention`);
      document.getElementById("submit-errors")?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    if (photos.some((p) => p.queued) || state.dirty.size) {
      toast.error("Some changes are still uploading — connect to the internet and try again");
      return;
    }
    setSubmitting(true);
    const r = await submitSurveyAction(survey.id);
    setSubmitting(false);
    if (!r.ok) {
      setSubmitErrors(r.fieldErrors ?? {});
      return toast.error(r.error);
    }
    clearLocal(survey.id);
    toast.success("Survey submitted — the survey company has been notified");
    router.push("/s?tab=completed");
  };

  const sections = [...schema.sections.map((s) => s.title), "Photos", "Verdict & submit"];
  const photoBySlot = (slot: string) => photos.filter((p) => p.slot === slot).slice(-1)[0];
  const extras = photos.filter((p) => p.slot.startsWith("extra:"));
  const sectionErrorCount = (i: number) => {
    if (!Object.keys(submitErrors).length) return 0;
    if (i < schema.sections.length) return schema.sections[i].fields.filter((f) => submitErrors[f.id]).length;
    if (i === schema.sections.length) return Object.keys(submitErrors).filter((k) => k.startsWith("photo:")).length;
    return Object.keys(submitErrors).filter((k) => k.startsWith("__") || k.startsWith("sig:")).length;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Link href={job.assignmentId ? `/s/assignments/${job.assignmentId}` : "/s"} className="inline-flex items-center gap-1 text-sm text-muted hover:text-text"><ArrowLeft className="h-4 w-4" aria-hidden /> Back</Link>
        {!readOnly && <SyncChip state={sync} online={online} onRetry={flush} />}
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-subtle">{job.type} · {survey.number}</p>
        <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">{job.number} <StatusPill status={survey.status} /></h1>
        <p className="text-sm text-muted">{job.container ? `${formatContainer(job.container)} · ` : ""}{job.location} · {fmtDate(job.surveyDate)}</p>
      </div>
      {returnNote && <Alert tone="warning" title="Returned by the survey company">{returnNote}</Alert>}
      {readOnly && <Alert tone="info" title="Read only">This survey has been submitted and can no longer be edited.</Alert>}

      <nav className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1" aria-label="Survey sections">
        {sections.map((t, i) => (
          <button key={t} onClick={() => setSection(i)} aria-current={i === section ? "step" : undefined} className={cn("inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium", i === section ? "border-accent-strong bg-accent-soft text-accent-strong" : "border-border bg-surface text-muted")}>
            {t}
            {sectionErrorCount(i) > 0 && <span className="rounded-full bg-danger px-1.5 text-[10px] font-bold text-white dark:text-[#2a0705]">{sectionErrorCount(i)}</span>}
          </button>
        ))}
      </nav>

      <fieldset disabled={readOnly} className="min-w-0">
        {section < schema.sections.length && (
          <Card className="p-4 sm:p-5">
            <h2 className="mb-4 text-base font-semibold">{schema.sections[section].title}</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
              {schema.sections[section].fields.map((f) => (
                <div key={f.id} className={cn(f.width === "third" ? "sm:col-span-2" : f.width === "half" ? "sm:col-span-3" : "sm:col-span-6", (f.type === "radio" || f.type === "table" || f.type === "list") && "sm:col-span-6", f.type === "radio" && f.width === "half" && "sm:col-span-3")}>
                  <FieldInput f={f} answers={answers} set={set} error={err(f) ?? undefined} onBlur={() => setTouched((t) => ({ ...t, [f.id]: true }))} today={today} />
                </div>
              ))}
            </div>
          </Card>
        )}

        {section === schema.sections.length && (
          <Card className="p-4 sm:p-5">
            <h2 className="mb-1 text-base font-semibold">Photos</h2>
            <p className="mb-4 text-[13px] text-muted">Every required angle needs a photo. Photos are compressed on your phone, stamped with time and location, and upload automatically when you have signal.</p>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {schema.photoSlots.map((s) => (
                <li key={s.id}>
                  <PhotoSlot label={s.label} required={s.required} photo={photoBySlot(s.id)} error={submitErrors[`photo:${s.id}`]} onFile={(f) => capture(s.id, f)} onRemove={() => removePhoto(s.id)} disabled={readOnly} />
                </li>
              ))}
              {extras.map((p, i) => (
                <li key={p.slot + i}>
                  <PhotoSlot label={`Additional ${i + 1}`} required={false} photo={p} onFile={(f) => capture(p.slot, f)} onRemove={() => removePhoto(p.slot)} disabled={readOnly} />
                </li>
              ))}
              {schema.additionalPhotos && !readOnly && (
                <li>
                  <label className="flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-border-strong text-sm text-muted hover:bg-surface-2">
                    <Plus className="h-5 w-5" aria-hidden /> Add photo
                    <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) capture(`extra:${Date.now()}`, f); }} />
                  </label>
                </li>
              )}
            </ul>
          </Card>
        )}

        {section === schema.sections.length + 1 && (
          <div className="space-y-4">
            <Card className="space-y-4 p-4 sm:p-5">
              <h2 className="text-base font-semibold">Verdict</h2>
              <Field label="Overall verdict" required={schema.verdict.required} error={submitErrors.__verdict}>
                {() => (
                  <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Verdict">
                    {(["FIT", "UNFIT"] as const).map((v) => (
                      <label key={v} className={cn("flex h-14 cursor-pointer items-center justify-center rounded-xl border-2 text-lg font-bold tracking-wide", state.verdict === v ? (v === "FIT" ? "tone-green border-transparent" : "tone-red border-transparent") : "border-border-strong text-muted")}>
                        <input type="radio" className="sr-only" name="verdict" checked={state.verdict === v} onChange={() => setMeta({ verdict: v })} />
                        {v}
                      </label>
                    ))}
                  </div>
                )}
              </Field>
              {state.verdict === "UNFIT" && (
                <Field label="Reason for UNFIT" required error={submitErrors.__verdictReason}>
                  {(p) => <Textarea id={p.id} invalid={p.invalid} rows={3} value={state.verdictReason} onChange={(e) => setMeta({ verdictReason: e.target.value })} />}
                </Field>
              )}
              <Field label="Completion notes">
                {(p) => <Textarea id={p.id} rows={3} value={state.notes} onChange={(e) => setMeta({ notes: e.target.value })} placeholder="Anything the survey company should know" />}
              </Field>
            </Card>
            <Card className="space-y-4 p-4 sm:p-5">
              <h2 className="text-base font-semibold">Signatures</h2>
              {schema.signatures.map((s) => (
                <SignaturePad key={s.id} label={s.label} required={s.required} existing={photoBySlot(`sig:${s.id}`)} error={submitErrors[`sig:${s.id}`]} disabled={readOnly} onSave={(blob) => capture(`sig:${s.id}`, blob)} onClear={() => removePhoto(`sig:${s.id}`)} />
              ))}
            </Card>
            {Object.keys(submitErrors).length > 0 && (
              <div id="submit-errors" role="alert" className="rounded-lg border border-danger/40 bg-danger-soft p-4 text-sm">
                <p className="font-semibold text-danger">Fix these before submitting</p>
                <ul className="mt-2 space-y-1">
                  {Object.entries(submitErrors).slice(0, 20).map(([k, v]) => {
                    const target = k.startsWith("photo:") ? schema.sections.length : k.startsWith("__") || k.startsWith("sig:") ? schema.sections.length + 1 : schema.sections.findIndex((s) => s.fields.some((f) => f.id === k));
                    return <li key={k}><button className="text-left text-text underline-offset-2 hover:underline" onClick={() => setSection(Math.max(0, target))}>{v}</button></li>;
                  })}
                </ul>
              </div>
            )}
            {!readOnly && (
              <Button size="lg" variant="accent" className="w-full" onClick={submit} loading={submitting}>
                <CheckCircle2 className="h-5 w-5" aria-hidden /> Complete & submit survey
              </Button>
            )}
          </div>
        )}
      </fieldset>

      <div className="flex justify-between">
        <Button variant="secondary" onClick={() => setSection((s) => Math.max(0, s - 1))} disabled={section === 0}>Previous</Button>
        {section < sections.length - 1 && <Button onClick={() => { setTouched((t) => ({ ...t, ...Object.fromEntries((schema.sections[section]?.fields ?? []).map((f) => [f.id, true])) })); setSection((s) => s + 1); window.scrollTo({ top: 0 }); }}>Next</Button>}
      </div>
    </div>
  );
}

function SyncChip({ state, online, onRetry }: { state: SyncState; online: boolean; onRetry: () => void }) {
  const m = {
    synced: { icon: <CheckCircle2 className="h-3.5 w-3.5" />, text: "All changes synced", cls: "tone-green" },
    pending: { icon: <CloudUpload className="h-3.5 w-3.5" />, text: "Saved on device", cls: "tone-blue" },
    syncing: { icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />, text: "Syncing…", cls: "tone-blue" },
    offline: { icon: <CloudOff className="h-3.5 w-3.5" />, text: "Offline — saved on device", cls: "tone-amber" },
    error: { icon: <RotateCcw className="h-3.5 w-3.5" />, text: "Sync failed — tap to retry", cls: "tone-red" },
  }[online ? state : "offline"];
  return (
    <button onClick={onRetry} className={cn("inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold", m.cls)} aria-live="polite">
      {online ? m.icon : <CloudOff className="h-3.5 w-3.5" />} {m.text} {online && state === "synced" && <Wifi className="h-3 w-3 opacity-60" aria-hidden />}
    </button>
  );
}

function FieldInput({ f, answers, set, error, onBlur, today }: { f: TField; answers: Answers; set: (id: string, v: unknown) => void; error?: string; onBlur: () => void; today: string }) {
  const v = answers[f.id];
  if (f.type === "computed") {
    const c = computeValue(f, answers);
    return (
      <Field label={f.label}>
        {(p) => <Input id={p.id} readOnly value={c == null ? "" : `${c}${f.unit ? ` ${f.unit}` : ""}`} className="bg-surface-2" aria-readonly />}
      </Field>
    );
  }
  return (
    <Field label={<>{f.label}{"unit" in f && f.unit && f.type === "number" ? <span className="text-subtle"> ({f.unit})</span> : null}</>} required={f.required} error={error} help={f.help}>
      {(p) => {
        const common = { id: p.id, "aria-describedby": p.describedBy, invalid: p.invalid, onBlur };
        switch (f.type) {
          case "text":
            return <Input {...common} value={String(v ?? "")} onChange={(e) => set(f.id, e.target.value)} />;
          case "textarea":
            return <Textarea {...common} rows={3} value={String(v ?? "")} onChange={(e) => set(f.id, e.target.value)} />;
          case "number":
            return <Input {...common} type="number" inputMode="decimal" step="any" min={f.min} max={f.max} value={v === undefined || v === null ? "" : String(v)} onChange={(e) => set(f.id, e.target.value === "" ? "" : Number(e.target.value))} />;
          case "date":
            return <Input {...common} type="date" max={f.notFuture ? today : undefined} value={String(v ?? "")} onChange={(e) => set(f.id, e.target.value)} />;
          case "time":
            return <Input {...common} type="time" value={String(v ?? "")} onChange={(e) => set(f.id, e.target.value)} />;
          case "container":
            return <Input {...common} className="font-mono uppercase" autoCapitalize="characters" value={String(v ?? "")} onChange={(e) => set(f.id, normalizeContainer(e.target.value))} placeholder="MSKU1234565" />;
          case "select":
            return (
              <Select {...common} value={String(v ?? "")} onChange={(e) => set(f.id, e.target.value)} placeholder="Select">
                {f.options.map((o) => <option key={o}>{o}</option>)}
              </Select>
            );
          case "radio":
            return <RadioGroup name={f.id} options={f.options} value={v as string} onChange={(x) => set(f.id, x)} invalid={p.invalid} describedBy={p.describedBy} />;
          case "boolean":
            return <RadioGroup name={f.id} options={["Yes", "No"]} value={v === true ? "Yes" : v === false ? "No" : undefined} onChange={(x) => set(f.id, x === "Yes")} />;
          case "list":
            return <ListInput value={(v as string[]) ?? []} onChange={(x) => set(f.id, x)} />;
          case "table":
            return <TableInput f={f} value={(v as Record<string, unknown>[]) ?? []} onChange={(x) => set(f.id, x)} />;
          default:
            return <span />;
        }
      }}
    </Field>
  );
}

function ListInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const items = value.length ? value : [""];
  return (
    <ol className="space-y-2">
      {items.map((x, i) => (
        <li key={i} className="flex items-start gap-2">
          <span className="mt-2 w-5 text-right text-sm text-subtle">{i + 1}.</span>
          <Textarea rows={2} aria-label={`Comment ${i + 1}`} value={x} onChange={(e) => onChange(items.map((y, j) => (j === i ? e.target.value : y)))} />
          <Button variant="ghost" size="icon" aria-label={`Remove comment ${i + 1}`} onClick={() => onChange(items.filter((_, j) => j !== i))} disabled={items.length === 1}><Trash2 className="h-4 w-4" /></Button>
        </li>
      ))}
      <li><Button variant="outline" size="sm" onClick={() => onChange([...items, ""])}><Plus className="h-4 w-4" aria-hidden /> Add comment</Button></li>
    </ol>
  );
}

function TableInput({ f, value, onChange }: { f: Extract<TField, { type: "table" }>; value: Record<string, unknown>[]; onChange: (v: Record<string, unknown>[]) => void }) {
  const rows = value.length ? value : [{}];
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="rounded-lg border border-border p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-subtle">Row {i + 1}</span>
            <Button variant="ghost" size="sm" aria-label={`Remove row ${i + 1}`} onClick={() => onChange(rows.filter((_, j) => j !== i))} disabled={rows.length === 1}><Trash2 className="h-4 w-4" /></Button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {f.columns.map((c) => (
              <label key={c.id} className="text-xs text-muted">
                {c.label}
                <Input className="mt-1" type={c.type === "number" ? "number" : "text"} inputMode={c.type === "number" ? "decimal" : undefined} value={String(r[c.id] ?? "")} onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, [c.id]: c.type === "number" && e.target.value !== "" ? Number(e.target.value) : e.target.value } : x)))} />
              </label>
            ))}
          </div>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={() => onChange([...rows, {}])}><Plus className="h-4 w-4" aria-hidden /> Add row</Button>
    </div>
  );
}

function PhotoSlot({ label, required, photo, error, onFile, onRemove, disabled }: { label: string; required: boolean; photo?: Photo; error?: string; onFile: (f: File) => void; onRemove: () => void; disabled?: boolean }) {
  return (
    <figure className={cn("overflow-hidden rounded-lg border", error ? "border-danger" : "border-border")}>
      {photo ? (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.url} alt={label} className="aspect-[4/3] w-full object-cover" />
          {photo.queued && <Badge tone="amber" className="absolute left-1.5 top-1.5">Queued</Badge>}
        </div>
      ) : (
        <label className={cn("flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 bg-surface-2 text-xs text-muted", !disabled && "cursor-pointer hover:bg-surface-3")}>
          <Camera className="h-6 w-6" aria-hidden />
          Take photo
          <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={disabled} aria-label={`Take photo: ${label}`} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }} />
        </label>
      )}
      <figcaption className="flex items-center justify-between gap-1 px-2 py-1.5">
        <span className="min-w-0 text-xs font-medium">{label}{required && <span className="text-danger"> *</span>}</span>
        {photo && !disabled && (
          <span className="flex shrink-0">
            <label className="cursor-pointer rounded p-1 text-muted hover:bg-surface-2" title="Retake">
              <ImagePlus className="h-4 w-4" aria-hidden />
              <input type="file" accept="image/*" capture="environment" className="sr-only" aria-label={`Retake photo: ${label}`} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }} />
            </label>
            <button className="rounded p-1 text-muted hover:bg-surface-2" onClick={onRemove} aria-label={`Remove photo: ${label}`}><Trash2 className="h-4 w-4" /></button>
          </span>
        )}
      </figcaption>
      {error && <p className="px-2 pb-1.5 text-[11px] font-medium text-danger">{error}</p>}
    </figure>
  );
}

function SignaturePad({ label, required, existing, error, disabled, onSave, onClear }: { label: string; required: boolean; existing?: Photo; error?: string; disabled?: boolean; onSave: (b: Blob) => void; onClear: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);
  const [editing, setEditing] = useState(!existing);

  useEffect(() => {
    const c = ref.current;
    if (!c || !editing) return;
    const ctx = c.getContext("2d")!;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio;
    c.height = c.offsetHeight * ratio;
    ctx.scale(ratio, ratio);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#0b2545";
  }, [editing]);

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };

  return (
    <div>
      <p className="mb-1.5 text-[13px] font-medium">{label}{required && <span className="text-danger"> *</span>}</p>
      {!editing && existing ? (
        <div className="flex items-end gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={existing.url} alt={label} className="h-24 w-64 rounded-lg border border-border bg-white object-contain" />
          {!disabled && <Button variant="outline" size="sm" onClick={() => { onClear(); setEditing(true); setHasInk(false); }}>Re-sign</Button>}
        </div>
      ) : (
        <>
          <canvas
            ref={ref}
            aria-label={`${label} — draw your signature`}
            className={cn("h-32 w-full touch-none rounded-lg border bg-white", error ? "border-danger" : "border-border-strong")}
            onPointerDown={(e) => { if (disabled) return; drawing.current = true; const [x, y] = pos(e); const ctx = ref.current!.getContext("2d")!; ctx.beginPath(); ctx.moveTo(x, y); ref.current!.setPointerCapture(e.pointerId); }}
            onPointerMove={(e) => { if (!drawing.current) return; const [x, y] = pos(e); const ctx = ref.current!.getContext("2d")!; ctx.lineTo(x, y); ctx.stroke(); setHasInk(true); }}
            onPointerUp={() => { drawing.current = false; }}
          />
          <div className="mt-2 flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => { const c = ref.current!; const ctx = c.getContext("2d")!; ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); setHasInk(false); }}>Clear</Button>
            <Button size="sm" disabled={!hasInk || disabled} onClick={() => ref.current!.toBlob((b) => { if (b) { onSave(b); setEditing(false); } }, "image/png")}>Save signature</Button>
          </div>
        </>
      )}
      {error && <p className="mt-1 text-xs font-medium text-danger" role="alert">{error}</p>}
    </div>
  );
}
