"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Building2, Crosshair, FileUp, MapPin, Pencil, Plus, Search, Trash2, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, RadioGroup, Select, Textarea } from "@/components/ui/form";
import { PhoneInput } from "@/components/ui/phone-input";
import { Alert, Badge, DescList } from "@/components/ui/misc";
import { CustomerDrawer } from "@/components/app/customer-form";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { ACTING_ON_BEHALF_OF, ATTACHMENT_KINDS, CURRENCY_SYMBOL, REQUEST_SOURCES, SURVEY_AREAS, SURVEY_AREA_NAME_LABEL, UPLOAD_LIMITS, humanize } from "@/lib/constants";
import { formatPhone } from "@/lib/countries";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/format";
import { searchPlaces } from "@/lib/ports";
import { searchCustomers } from "@/app/actions/customers";
import { creditPreviewAction, searchAgentsAction, uploadRfqFileAction } from "@/app/actions/rfqs";
import type { Line, Taxonomy, WizardData } from "./wizard";

type StepProps = {
  data: WizardData;
  update: <K extends keyof WizardData>(k: K, v: WizardData[K]) => void;
  errors: Record<string, string>;
  taxonomy: Taxonomy;
  goTo: (n: number) => void;
};

const SOURCE_LABEL: Record<string, string> = { PHONE: "Phone call", EMAIL: "Email", WHATSAPP: "WhatsApp", WEBSITE: "Website", OTHER: "Other" };

// ═════════════════════ Step 1 — Customer & request intake ═════════════════════
export function CustomerStep({ data, update, errors }: StepProps) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; displayName: string; email: string; phone: string; city: string; customerType: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [n, setN] = useState(0);

  useEffect(() => {
    if (data.customer) return;
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await searchCustomers(q);
      setLoading(false);
      if (r.ok) setResults(r.data);
    }, 250);
    return () => clearTimeout(t);
  }, [q, data.customer]);

  const intake = data.intake;
  const setIntake = (patch: Partial<WizardData["intake"]>) => update("intake", { ...intake, ...patch });

  return (
    <>
      <section aria-labelledby="cust-h" className="space-y-3">
        <h3 id="cust-h" className="text-sm font-semibold">Customer <span className="text-danger">*</span></h3>
        {data.customer ? (
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-accent-strong/40 bg-accent-soft p-4">
            <div className="flex items-start gap-3">
              <Building2 className="mt-0.5 h-5 w-5 text-accent-strong" aria-hidden />
              <div>
                <p className="font-semibold">{data.customer.displayName}</p>
                <p className="text-[13px] text-muted">{data.customer.email} · {formatPhone(data.customer.phone)} · {data.customer.city}</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => update("customer", null)}>Change customer</Button>
          </div>
        ) : (
          <>
            <p className="text-[13px] text-muted">Search your customers first. If they&apos;re new, add them — the record is saved to Customers and reused next time.</p>
            <div className="flex flex-wrap gap-2">
              <div className="relative min-w-[240px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
                <Input aria-label="Search customers" placeholder="Name, email or mobile" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" invalid={!!errors.customer} autoFocus />
              </div>
              <Button variant="outline" onClick={() => { setN((x) => x + 1); setAdding(true); }}>
                <UserPlus className="h-4 w-4" aria-hidden /> Add new customer
              </Button>
            </div>
            {errors.customer && <p className="text-xs font-medium text-danger" role="alert">{errors.customer}</p>}
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border" aria-busy={loading}>
              {results.length === 0 && !loading && (
                <li className="px-4 py-6 text-center text-sm text-muted">
                  No customer matches{q ? ` “${q}”` : ""}.{" "}
                  <button className="font-medium text-accent-strong hover:underline" onClick={() => { setN((x) => x + 1); setAdding(true); }}>Add them as a new customer</button>
                </li>
              )}
              {results.map((c) => (
                <li key={c.id}>
                  <button className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-surface-2" onClick={() => update("customer", c)}>
                    <span>
                      <span className="block text-sm font-medium">{c.displayName}</span>
                      <span className="block text-xs text-muted">{c.email} · {formatPhone(c.phone)} · {c.city}</span>
                    </span>
                    <span className="text-xs font-medium text-accent-strong">Select</span>
                  </button>
                </li>
              ))}
            </ul>
            <CustomerDrawer
              key={n}
              open={adding}
              onClose={() => setAdding(false)}
              initial={q && !q.includes("@") ? { organizationName: q } : q.includes("@") ? { email: q } : undefined}
              onSaved={async (c) => {
                const r = await searchCustomers(c.name);
                const hit = r.ok ? r.data.find((x) => x.id === c.id) : undefined;
                update("customer", hit ? { id: hit.id, displayName: hit.displayName, email: hit.email, phone: hit.phone, city: hit.city, customerType: hit.customerType } : { id: c.id, displayName: c.name, email: "", phone: "", city: "", customerType: "ENTERPRISE" });
              }}
            />
          </>
        )}
      </section>

      <section aria-labelledby="intake-h" className="space-y-4 border-t border-border pt-6">
        <div>
          <h3 id="intake-h" className="text-sm font-semibold">How did this request come in?</h3>
          <p className="text-[13px] text-muted">Recorded on the RFQ and its activity timeline.</p>
        </div>
        <Field label="Request source" required error={errors["intake.requestSource"]}>
          {() => <RadioGroup name="source" options={REQUEST_SOURCES} labels={SOURCE_LABEL} value={intake.requestSource} onChange={(v) => setIntake({ requestSource: v })} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Received at" required error={errors["intake.requestReceivedAt"]}>
            {(p) => <Input id={p.id} type="datetime-local" invalid={p.invalid} value={intake.requestReceivedAt} max={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)} onChange={(e) => setIntake({ requestReceivedAt: e.target.value })} />}
          </Field>
          <Field label="Contact person">
            {(p) => <Input id={p.id} value={intake.contactPerson ?? ""} onChange={(e) => setIntake({ contactPerson: e.target.value })} placeholder="Who called / wrote" />}
          </Field>
          <Field label="Contact details">
            {(p) => <Input id={p.id} value={intake.contactDetails ?? ""} onChange={(e) => setIntake({ contactDetails: e.target.value })} placeholder="Phone / email / WhatsApp" />}
          </Field>
        </div>
        <Field label="Initial request notes">
          {(p) => <Textarea id={p.id} value={intake.initialNotes ?? ""} onChange={(e) => setIntake({ initialNotes: e.target.value })} placeholder="What the customer asked for, in their words" />}
        </Field>
      </section>
    </>
  );
}

// ═════════════════════ Step 2 — Survey types & cargo ═════════════════════
function findType(tax: Taxonomy, typeId: string) {
  for (const c of tax) for (const s of c.subs) for (const t of s.types) if (t.id === typeId) return { cat: c, sub: s, type: t };
  return null;
}

export function SurveyStep({ data, update, errors, taxonomy }: StepProps) {
  const s = data.survey;
  const empty = { catId: "", subId: "", typeId: "", quantity: "1", scope: [] as string[], other: false, scopeOther: "" };
  const [ed, setEd] = useState(empty);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [lineErr, setLineErr] = useState<Record<string, string>>({});
  const cat = taxonomy.find((c) => c.id === ed.catId);
  const sub = cat?.subs.find((x) => x.id === ed.subId);
  const type = sub?.types.find((t) => t.id === ed.typeId);

  const setSurvey = (patch: Partial<WizardData["survey"]>) => update("survey", { ...s, ...patch });

  const commit = () => {
    const e: Record<string, string> = {};
    if (!ed.catId) e.cat = "Category is required";
    if (!ed.subId) e.sub = "Sub category is required";
    if (!ed.typeId) e.type = "Type of survey is required";
    if (!(Number(ed.quantity) >= 1)) e.quantity = "Quantity must be at least 1";
    if (ed.typeId && !ed.scope.length && !(ed.other && ed.scopeOther.trim())) e.scope = "Choose at least one scope item, or describe a custom scope";
    setLineErr(e);
    if (Object.keys(e).length) return;
    const line: Line = { key: editingKey ?? crypto.randomUUID(), surveyTypeId: ed.typeId, quantity: Number(ed.quantity), scope: ed.scope, scopeOther: ed.other ? ed.scopeOther.trim() : undefined };
    setSurvey({ lines: editingKey ? s.lines.map((l) => (l.key === editingKey ? line : l)) : [...s.lines, line] });
    setEd(empty);
    setEditingKey(null);
  };

  const edit = (l: Line) => {
    const f = findType(taxonomy, l.surveyTypeId);
    if (!f) return;
    setEditingKey(l.key);
    setEd({ catId: f.cat.id, subId: f.sub.id, typeId: f.type.id, quantity: String(l.quantity), scope: l.scope, other: !!l.scopeOther, scopeOther: l.scopeOther ?? "" });
    setLineErr({});
  };

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Cargo name" required error={errors["survey.cargoName"]}>
          {(p) => <Input id={p.id} invalid={p.invalid} value={s.cargoName} onChange={(e) => setSurvey({ cargoName: e.target.value })} placeholder="e.g. Granite slabs" />}
        </Field>
        <Field label="Cargo quantity" required error={errors["survey.cargoQuantity"]}>
          {(p) => <Input id={p.id} invalid={p.invalid} value={s.cargoQuantity} onChange={(e) => setSurvey({ cargoQuantity: e.target.value })} placeholder="e.g. 12 containers / 450 MT" />}
        </Field>
      </div>

      <section className="rounded-xl border border-border bg-surface-2/50 p-4" aria-labelledby="line-h">
        <h3 id="line-h" className="mb-3 text-sm font-semibold">{editingKey ? "Edit survey line" : "Add a survey line"}</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Category" required error={lineErr.cat}>
            {(p) => (
              <Select id={p.id} invalid={p.invalid} value={ed.catId} onChange={(e) => setEd({ ...empty, catId: e.target.value })} placeholder="Select category">
                {taxonomy.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Sub category" required error={lineErr.sub}>
            {(p) => (
              <Select id={p.id} invalid={p.invalid} value={ed.subId} disabled={!cat} onChange={(e) => setEd({ ...ed, subId: e.target.value, typeId: "", scope: [] })} placeholder={cat ? "Select sub category" : "Choose a category first"}>
                {cat?.subs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Type of survey" required error={lineErr.type} help={type ? `${type.creditCost} credit${type.creditCost === 1 ? "" : "s"} per line` : undefined}>
            {(p) => (
              <Select id={p.id} invalid={p.invalid} aria-describedby={p.describedBy} value={ed.typeId} disabled={!sub} onChange={(e) => setEd({ ...ed, typeId: e.target.value, scope: [] })} placeholder={sub ? "Select type" : "Choose a sub category first"}>
                {sub?.types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            )}
          </Field>
          <Field label={sub?.quantityLabel ?? "Quantity"} required error={lineErr.quantity}>
            {(p) => <Input id={p.id} invalid={p.invalid} type="number" min={1} inputMode="numeric" value={ed.quantity} onChange={(e) => setEd({ ...ed, quantity: e.target.value })} />}
          </Field>
        </div>
        {type && (
          <fieldset className="mt-4" aria-describedby={lineErr.scope ? "scope-err" : undefined}>
            <legend className="mb-2 text-[13px] font-medium">Scope of survey <span className="text-danger">*</span></legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {type.scope.map((item) => (
                <Checkbox key={item} label={item} checked={ed.scope.includes(item)} onChange={(e) => setEd({ ...ed, scope: e.target.checked ? [...ed.scope, item] : ed.scope.filter((x) => x !== item) })} />
              ))}
              <Checkbox label="Other (please specify)" checked={ed.other} onChange={(e) => setEd({ ...ed, other: e.target.checked })} />
            </div>
            {ed.other && <Textarea className="mt-2" aria-label="Custom scope" placeholder="Enter your custom scope…" value={ed.scopeOther} onChange={(e) => setEd({ ...ed, scopeOther: e.target.value })} />}
            {lineErr.scope && <p id="scope-err" className="mt-1 text-xs font-medium text-danger" role="alert">{lineErr.scope}</p>}
          </fieldset>
        )}
        <div className="mt-4 flex gap-2">
          <Button variant="primary" size="sm" onClick={commit}>
            {editingKey ? "Update line" : (<><Plus className="h-4 w-4" aria-hidden /> Add line</>)}
          </Button>
          {editingKey && <Button variant="ghost" size="sm" onClick={() => { setEd(empty); setEditingKey(null); }}>Cancel edit</Button>}
        </div>
      </section>

      <section aria-labelledby="lines-h">
        <h3 id="lines-h" className="mb-2 text-sm font-semibold">Survey lines <span className="text-danger">*</span></h3>
        {errors["survey.lines"] && <p className="mb-2 text-xs font-medium text-danger" role="alert">{errors["survey.lines"]}</p>}
        {s.lines.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border-strong px-4 py-6 text-center text-sm text-muted">No lines yet — add at least one above.</p>
        ) : (
          <ul className="space-y-2">
            {s.lines.map((l, i) => {
              const f = findType(taxonomy, l.surveyTypeId);
              const scopeAll = [...l.scope, ...(l.scopeOther ? [`Other: ${l.scopeOther}`] : [])];
              return (
                <li key={l.key} className={cn("rounded-lg border border-border bg-surface p-3", editingKey === l.key && "ring-2 ring-ring/40")}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{i + 1}. {f?.type.name ?? "Unknown type"} <span className="font-normal text-muted">× {l.quantity}</span></p>
                      <p className="text-xs text-subtle">{f?.cat.name} → {f?.sub.name}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => edit(l)} aria-label={`Edit line ${i + 1}`}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => setSurvey({ lines: s.lines.filter((x) => x.key !== l.key) })} aria-label={`Delete line ${i + 1}`}><Trash2 className="h-4 w-4 text-danger" /></Button>
                    </div>
                  </div>
                  <details className="mt-1.5 text-[13px] text-muted">
                    <summary className="cursor-pointer select-none">{scopeAll.length} scope item{scopeAll.length === 1 ? "" : "s"}: <span className="text-text">{scopeAll[0]}</span>{scopeAll.length > 1 ? "…" : ""}</summary>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5">{scopeAll.map((x) => <li key={x}>{x}</li>)}</ul>
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

// ═════════════════════ Step 3 — Survey details ═════════════════════
export function DetailsStep({ data, update, errors }: StepProps) {
  const d = data.details;
  const set = (patch: Partial<WizardData["details"]>) => update("details", { ...d, ...patch });
  const [placeQ, setPlaceQ] = useState(d.locationName);
  const [showSug, setShowSug] = useState(false);
  const [ji, setJi] = useState({ name: "", onBehalfOf: "", role: "" });
  const [jiErr, setJiErr] = useState("");
  const sugs = useMemo(() => searchPlaces(placeQ), [placeQ]);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const sym = CURRENCY_SYMBOL[d.currency];
  const areaLabel = d.surveyArea ? SURVEY_AREA_NAME_LABEL[d.surveyArea as keyof typeof SURVEY_AREA_NAME_LABEL] : "Area / spot name";

  const useMyLocation = () => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => set({ lat: Number(pos.coords.latitude.toFixed(5)), lng: Number(pos.coords.longitude.toFixed(5)), locationName: d.locationName || `Pinned location (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)})` }),
      () => undefined,
    );
  };

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Survey area / spot" required error={errors["details.surveyArea"]}>
          {() => <RadioGroup name="area" options={SURVEY_AREAS} labels={{ YARD: "Yard", CFS: "CFS", TERMINAL: "Terminal", FACTORY: "Factory", VESSEL: "Vessel" }} value={d.surveyArea} onChange={(v) => set({ surveyArea: v })} invalid={!!errors["details.surveyArea"]} />}
        </Field>
        <Field label={areaLabel} required error={errors["details.areaName"]}>
          {(p) => <Input id={p.id} invalid={p.invalid} value={d.areaName} onChange={(e) => set({ areaName: e.target.value })} />}
        </Field>
      </div>

      <Field label="Location of survey" required error={errors["details.locationName"]} help="Ports, terminals and ICDs are suggested first. You can also type any address.">
        {(p) => (
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
            <Input
              id={p.id}
              aria-describedby={p.describedBy}
              invalid={p.invalid}
              className="pl-9"
              value={placeQ}
              autoComplete="off"
              role="combobox"
              aria-expanded={showSug}
              aria-controls="place-list"
              onFocus={() => setShowSug(true)}
              onBlur={() => setTimeout(() => setShowSug(false), 150)}
              onChange={(e) => {
                setPlaceQ(e.target.value);
                set({ locationName: e.target.value, lat: null, lng: null });
                setShowSug(true);
              }}
            />
            {showSug && sugs.length > 0 && (
              <ul id="place-list" role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-pop">
                {sugs.map((pl) => (
                  <li key={pl.name} role="option" aria-selected={false}>
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-surface-2"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        const name = `${pl.name}, ${pl.city}`;
                        setPlaceQ(name);
                        set({ locationName: name, lat: pl.lat, lng: pl.lng });
                        setShowSug(false);
                      }}
                    >
                      <span>{pl.name}<span className="block text-xs text-muted">{pl.city}, {pl.state}</span></span>
                      <Badge tone="teal">{pl.kind}</Badge>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Field>
      <div className="flex flex-wrap items-center gap-3 text-[13px] text-muted">
        <Button variant="outline" size="sm" onClick={useMyLocation}><Crosshair className="h-4 w-4" aria-hidden /> Use my current location</Button>
        {d.lat != null && d.lng != null ? <span>Pinned at {d.lat.toFixed(4)}, {d.lng.toFixed(4)}</span> : <span>No map pin yet (optional)</span>}
      </div>
      {d.lat != null && d.lng != null && (
        <iframe
          title="Map preview of the survey location"
          className="h-56 w-full rounded-lg border border-border"
          loading="lazy"
          src={`https://www.openstreetmap.org/export/embed.html?bbox=${d.lng - 0.02}%2C${d.lat - 0.012}%2C${d.lng + 0.02}%2C${d.lat + 0.012}&layer=mapnik&marker=${d.lat}%2C${d.lng}`}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Date of survey" required error={errors["details.surveyDate"]}>
          {(p) => <Input id={p.id} type="date" min={today} invalid={p.invalid} value={d.surveyDate} onChange={(e) => set({ surveyDate: e.target.value })} />}
        </Field>
        <Field label="Currency" required>
          {() => <RadioGroup name="currency" options={["INR", "USD"]} labels={{ INR: "₹ INR", USD: "$ USD" }} value={d.currency} onChange={(v) => set({ currency: v as "INR" | "USD" })} />}
        </Field>
        <Field label={`Estimated rate (${sym} ${d.currency})`} required error={errors["details.estimatedRate"]}>
          {(p) => (
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-subtle" aria-hidden>{sym}</span>
              <Input id={p.id} invalid={p.invalid} className="pl-7" type="number" min={0} step="0.01" inputMode="decimal" value={d.estimatedRate} onChange={(e) => set({ estimatedRate: e.target.value })} />
            </div>
          )}
        </Field>
      </div>
      <Field label="Payment terms" required error={errors["details.paymentTerms"]}>
        {(p) => <Textarea id={p.id} invalid={p.invalid} rows={4} value={d.paymentTerms} onChange={(e) => set({ paymentTerms: e.target.value })} placeholder={"1. 100% within 15 days of invoice\n2. Bank transfer"} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Acting on behalf of">
          {(p) => (
            <Select id={p.id} value={d.actingOnBehalfOf ?? ""} onChange={(e) => set({ actingOnBehalfOf: e.target.value })} placeholder="Select (optional)">
              {ACTING_ON_BEHALF_OF.map((x) => <option key={x}>{x}</option>)}
            </Select>
          )}
        </Field>
        <Field label="P&I Club">
          {(p) => <Input id={p.id} value={d.piClub ?? ""} onChange={(e) => set({ piClub: e.target.value })} placeholder="Optional" />}
        </Field>
      </div>

      <section className="space-y-3 border-t border-border pt-5">
        <Field label="Surveyor / joint inspection present?" error={errors["details.jointInspectors"]}>
          {() => <RadioGroup name="ji" options={["Yes", "No"]} value={d.jointInspection ? "Yes" : "No"} onChange={(v) => set({ jointInspection: v === "Yes", jointInspectors: v === "Yes" ? d.jointInspectors : [] })} />}
        </Field>
        {d.jointInspection && (
          <div className="rounded-lg border border-border p-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
              <Field label="Name">{(p) => <Input id={p.id} value={ji.name} onChange={(e) => setJi({ ...ji, name: e.target.value })} />}</Field>
              <Field label="On behalf of (company)">{(p) => <Input id={p.id} value={ji.onBehalfOf} onChange={(e) => setJi({ ...ji, onBehalfOf: e.target.value })} />}</Field>
              <Field label="Role">
                {(p) => (
                  <Select id={p.id} value={ji.role} onChange={(e) => setJi({ ...ji, role: e.target.value })} placeholder="Select role">
                    {ACTING_ON_BEHALF_OF.map((x) => <option key={x}>{x}</option>)}
                  </Select>
                )}
              </Field>
              <Button
                variant="secondary"
                onClick={() => {
                  if (!ji.name.trim() || !ji.onBehalfOf.trim() || !ji.role) return setJiErr("Name, company and role are all required");
                  setJiErr("");
                  set({ jointInspectors: [...d.jointInspectors, ji] });
                  setJi({ name: "", onBehalfOf: "", role: "" });
                }}
              >
                <Plus className="h-4 w-4" aria-hidden /> Add
              </Button>
            </div>
            {jiErr && <p className="mt-2 text-xs text-danger" role="alert">{jiErr}</p>}
            {d.jointInspectors.length > 0 && (
              <ul className="mt-3 divide-y divide-border text-sm">
                {d.jointInspectors.map((x, i) => (
                  <li key={i} className="flex items-center justify-between py-2">
                    <span>{x.name} · <span className="text-muted">{x.onBehalfOf} ({x.role})</span></span>
                    <Button variant="ghost" size="sm" aria-label={`Remove ${x.name}`} onClick={() => set({ jointInspectors: d.jointInspectors.filter((_, j) => j !== i) })}><X className="h-4 w-4" /></Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </>
  );
}

// ═════════════════════ Step 4 — Agent details (with autocomplete over past agents) ═════════════════════
type AgentHit = { id: string; companyName: string; email: string; phone: string; address: string; contacts: { name: string; phone: string | null; email: string | null }[] };

export function AgentStep({ data, update, errors }: StepProps) {
  const a = data.agent;
  const set = (patch: Partial<WizardData["agent"]>) => update("agent", { ...a, ...patch });
  const [hits, setHits] = useState<AgentHit[]>([]);
  const [show, setShow] = useState(false);
  const [c, setC] = useState({ name: "", phone: "", email: "" });
  const [cErr, setCErr] = useState("");

  useEffect(() => {
    if (!show) return;
    const t = setTimeout(async () => {
      const r = await searchAgentsAction(a.companyName);
      if (r.ok) setHits(r.data as AgentHit[]);
    }, 200);
    return () => clearTimeout(t);
  }, [a.companyName, show]);

  return (
    <>
      <Field label="Company name" required error={errors["agent.companyName"]} help="Start typing — agents from earlier RFQs are suggested and fill the rest in.">
        {(p) => (
          <div className="relative">
            <Input
              id={p.id}
              aria-describedby={p.describedBy}
              invalid={p.invalid}
              value={a.companyName}
              autoComplete="off"
              onFocus={() => setShow(true)}
              onBlur={() => setTimeout(() => setShow(false), 150)}
              onChange={(e) => set({ companyName: e.target.value, agentId: undefined })}
            />
            {show && hits.length > 0 && (
              <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-pop" role="listbox">
                {hits.map((h) => (
                  <li key={h.id} role="option" aria-selected={a.agentId === h.id}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-surface-2"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        set({ agentId: h.id, companyName: h.companyName, email: h.email, phone: h.phone, address: h.address, contacts: h.contacts.map((x) => ({ name: x.name, phone: x.phone ?? "", email: x.email ?? "" })) });
                        setShow(false);
                      }}
                    >
                      {h.companyName}
                      <span className="block text-xs text-muted">{h.email} · {formatPhone(h.phone)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company email" required error={errors["agent.email"]}>
          {(p) => <Input id={p.id} invalid={p.invalid} type="email" value={a.email} onChange={(e) => set({ email: e.target.value })} />}
        </Field>
        <Field label="Company phone number" required error={errors["agent.phone"]}>
          {(p) => <PhoneInput key={a.agentId ?? "manual"} id={p.id} invalid={p.invalid} value={a.phone} onChange={(v) => set({ phone: v })} />}
        </Field>
      </div>
      <Field label="Company address" required error={errors["agent.address"]}>
        {(p) => <Textarea id={p.id} invalid={p.invalid} rows={2} value={a.address} onChange={(e) => set({ address: e.target.value })} />}
      </Field>

      <section className="space-y-3 border-t border-border pt-5">
        <h3 className="text-sm font-semibold">Contact persons</h3>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <Field label="Name">{(p) => <Input id={p.id} value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} />}</Field>
          <Field label="Phone">{(p) => <Input id={p.id} type="tel" value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} />}</Field>
          <Field label="Email">{(p) => <Input id={p.id} type="email" value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} />}</Field>
          <Button
            variant="secondary"
            onClick={() => {
              if (!c.name.trim()) return setCErr("Contact name is required");
              if (c.email && !/^\S+@\S+\.\S+$/.test(c.email)) return setCErr("Contact email is not valid");
              setCErr("");
              set({ contacts: [...a.contacts, c] });
              setC({ name: "", phone: "", email: "" });
            }}
          >
            <Plus className="h-4 w-4" aria-hidden /> Add
          </Button>
        </div>
        {cErr && <p className="text-xs text-danger" role="alert">{cErr}</p>}
        {a.contacts.length > 0 && (
          <ul className="divide-y divide-border rounded-lg border border-border text-sm">
            {a.contacts.map((x, i) => (
              <li key={i} className="flex items-center justify-between px-3 py-2">
                <span>{x.name} <span className="text-muted">{[x.phone, x.email].filter(Boolean).join(" · ")}</span></span>
                <Button variant="ghost" size="sm" aria-label={`Remove ${x.name}`} onClick={() => set({ contacts: a.contacts.filter((_, j) => j !== i) })}><X className="h-4 w-4" /></Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

// ═════════════════════ Step 5 — Attachments (drag & drop, typed) ═════════════════════
export function AttachmentsStep({ data, update }: StepProps) {
  const toast = useToast();
  const [kind, setKind] = useState<string>("APPOINTMENT_LETTER");
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const files = data.files.attachments;

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    const added = [];
    for (const f of Array.from(list)) {
      if (!UPLOAD_LIMITS.document.mime.includes(f.type) || f.size > UPLOAD_LIMITS.document.maxBytes) {
        toast.error(`${f.name}: ${UPLOAD_LIMITS.document.label}`);
        continue;
      }
      const fd = new FormData();
      fd.set("file", f);
      fd.set("kind", kind);
      const r = await uploadRfqFileAction(fd);
      if (r.ok) added.push({ id: r.data.id, kind, fileName: r.data.fileName, size: r.data.size });
      else toast.error(r.error);
    }
    setBusy(false);
    if (added.length) update("files", { attachments: [...files, ...added] });
  };

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
        <Field label="Document type">
          {(p) => (
            <Select id={p.id} value={kind} onChange={(e) => setKind(e.target.value)}>
              {ATTACHMENT_KINDS.map((k) => <option key={k} value={k}>{humanize(k)}</option>)}
            </Select>
          )}
        </Field>
        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}
          className={cn("flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors", drag ? "border-accent-strong bg-accent-soft" : "border-border-strong")}
        >
          <FileUp className="h-7 w-7 text-subtle" aria-hidden />
          <p className="mt-2 text-sm">Drag files here or <button type="button" className="font-semibold text-accent-strong hover:underline" onClick={() => input.current?.click()}>browse</button></p>
          <p className="mt-1 text-xs text-muted">{UPLOAD_LIMITS.document.label}. Tagged as “{humanize(kind)}”.</p>
          <input ref={input} type="file" multiple hidden accept={UPLOAD_LIMITS.document.mime.join(",")} onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
          {busy && <p className="mt-2 text-xs text-muted" aria-live="polite">Uploading…</p>}
        </div>
      </div>
      {files.length === 0 ? (
        <Alert tone="info" title="No attachments yet">Attachments are optional, but the appointment letter keeps the legal paper trail with the RFQ.</Alert>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {files.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium">{f.fileName}</span>
                <span className="text-xs text-muted">{humanize(f.kind)}{f.size ? ` · ${(f.size / 1024).toFixed(0)} KB` : ""}</span>
              </span>
              <Button variant="ghost" size="sm" aria-label={`Remove ${f.fileName}`} onClick={() => update("files", { attachments: files.filter((x) => x.id !== f.id) })}><Trash2 className="h-4 w-4 text-danger" /></Button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

// ═════════════════════ Step 6 — Review & submit ═════════════════════
export function ReviewStep({ data, taxonomy, goTo }: StepProps) {
  const [credits, setCredits] = useState<{ cost: number; balance: number } | null>(null);
  useEffect(() => {
    creditPreviewAction(data.survey.lines.map((l) => l.surveyTypeId)).then((r) => r.ok && setCredits(r.data));
  }, [data.survey.lines]);
  const d = data.details;
  const Section = ({ title, step, children }: { title: string; step: number; children: React.ReactNode }) => (
    <section className="rounded-xl border border-border p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <Button variant="ghost" size="sm" onClick={() => goTo(step)}><Pencil className="h-3.5 w-3.5" aria-hidden /> Edit</Button>
      </div>
      {children}
    </section>
  );
  const totalUnits = data.survey.lines.reduce((s, l) => s + l.quantity, 0);
  return (
    <>
      {credits && (
        credits.cost > credits.balance ? (
          <Alert tone="danger" title={`This RFQ needs ${credits.cost} credits — you have ${credits.balance}`}>Buy a package under Packages & Credits, then come back; your draft is saved.</Alert>
        ) : (
          <Alert tone="info" title={`Submitting will use ${credits.cost} credit${credits.cost === 1 ? "" : "s"}`}>Balance after submission: {credits.balance - credits.cost} credits. Credits are refunded if the RFQ is declined or cancelled before work starts.</Alert>
        )
      )}
      <Section title="Customer & request" step={0}>
        <DescList items={[
          { label: "Customer", value: data.customer?.displayName },
          { label: "Request source", value: SOURCE_LABEL[data.intake.requestSource] },
          { label: "Received", value: data.intake.requestReceivedAt ? fmtDateTime(data.intake.requestReceivedAt) : "—" },
          { label: "Contact", value: [data.intake.contactPerson, data.intake.contactDetails].filter(Boolean).join(" · ") || "—" },
          { label: "Notes", value: data.intake.initialNotes || "—", wide: true },
        ]} />
      </Section>
      <Section title={`Survey lines (${data.survey.lines.length} lines · ${totalUnits} units)`} step={1}>
        <p className="mb-2 text-sm"><span className="text-muted">Cargo:</span> {data.survey.cargoName} — {data.survey.cargoQuantity}</p>
        <ul className="space-y-1 text-sm">
          {data.survey.lines.map((l, i) => {
            const f = findType(taxonomy, l.surveyTypeId);
            return <li key={l.key}>{i + 1}. <strong>{f?.type.name}</strong> × {l.quantity} <span className="text-muted">· {l.scope.length + (l.scopeOther ? 1 : 0)} scope items · {f?.type.creditCost ?? 1} credit</span></li>;
          })}
        </ul>
      </Section>
      <Section title="Survey details" step={2}>
        <DescList items={[
          { label: "Area / spot", value: `${humanize(d.surveyArea)} — ${d.areaName}` },
          { label: "Location", value: d.locationName },
          { label: "Date of survey", value: d.surveyDate ? fmtDate(d.surveyDate) : "—" },
          { label: "Estimated rate", value: d.estimatedRate ? fmtMoney(Number(d.estimatedRate), d.currency) : "—" },
          { label: "Acting on behalf of", value: d.actingOnBehalfOf || "—" },
          { label: "P&I Club", value: d.piClub || "—" },
          { label: "Joint inspection", value: d.jointInspection ? d.jointInspectors.map((x) => `${x.name} (${x.onBehalfOf})`).join(", ") : "No" },
          { label: "Payment terms", value: <span className="whitespace-pre-line">{d.paymentTerms}</span>, wide: true },
        ]} />
      </Section>
      <Section title="Agent" step={3}>
        <DescList items={[
          { label: "Company", value: data.agent.companyName },
          { label: "Email / phone", value: `${data.agent.email} · ${formatPhone(data.agent.phone)}` },
          { label: "Address", value: data.agent.address, wide: true },
          { label: "Contacts", value: data.agent.contacts.map((x) => x.name).join(", ") || "—", wide: true },
        ]} />
      </Section>
      <Section title={`Attachments (${data.files.attachments.length})`} step={4}>
        <p className="text-sm text-muted">{data.files.attachments.map((f) => `${f.fileName} (${humanize(f.kind)})`).join(", ") || "None"}</p>
      </Section>
    </>
  );
}
