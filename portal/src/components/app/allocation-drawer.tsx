"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, MapPin, Search, Star, UserPlus } from "lucide-react";
import { EntityDrawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/form";
import { Alert, Badge, Skeleton, StatusPill } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { formatPhone } from "@/lib/countries";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { allocateAction, allocationCandidates, type Candidate } from "@/app/actions/jobs";

/**
 * ONE allocation drawer for in-house AND independent surveyors: searchable and filterable,
 * multi-select across surveyors (joint inspection) and across jobs, with a confirmation summary.
 */
export function AllocationButton({ jobs, label = "Allocate", size = "sm", variant = "primary", autoOpen = false }: {
  jobs: { id: string; number: string; type: string; location: string }[];
  label?: string;
  size?: "sm" | "md";
  variant?: "primary" | "secondary" | "outline" | "ghost";
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(autoOpen);
  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)} disabled={!jobs.length}>
        <UserPlus className="h-4 w-4" aria-hidden /> {label}
      </Button>
      {open && <AllocationDrawer jobs={jobs} onClose={() => setOpen(false)} />}
    </>
  );
}

function AllocationDrawer({ jobs, onClose }: { jobs: { id: string; number: string; type: string; location: string }[]; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [cands, setCands] = useState<Candidate[] | null>(null);
  const [err, setErr] = useState<string>();
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"ALL" | "IN_HOUSE" | "INDEPENDENT">("ALL");
  const [onlyCapable, setOnlyCapable] = useState(true);
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [loc, setLoc] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [fee, setFee] = useState("");
  const [instructions, setInstructions] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const jobKey = jobs.map((j) => j.id).join(",");
  useEffect(() => {
    allocationCandidates(jobKey.split(",")).then((r) => (r.ok ? setCands(r.data) : setErr(r.error)));
  }, [jobKey]);

  const list = useMemo(() => {
    if (!cands) return [];
    const s = q.trim().toLowerCase();
    const l = loc.trim().toLowerCase();
    return cands
      .filter((c) => kind === "ALL" || c.kind === kind)
      .filter((c) => !onlyCapable || c.capable)
      .filter((c) => !onlyAvailable || c.availability === "AVAILABLE")
      .filter((c) => !s || `${c.name} ${c.email} ${c.phone}`.toLowerCase().includes(s))
      .filter((c) => !l || `${c.baseLocation} ${c.coverage}`.toLowerCase().includes(l))
      .sort((a, b) => Number(b.availability === "AVAILABLE") - Number(a.availability === "AVAILABLE") || a.workload - b.workload || b.rating - a.rating);
  }, [cands, q, kind, onlyCapable, onlyAvailable, loc]);

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const pickedC = picked.map((id) => cands?.find((c) => c.id === id)).filter(Boolean) as Candidate[];
  const allVisibleSelected = list.length > 0 && list.every((c) => picked.includes(c.id));

  const submit = async () => {
    setBusy(true);
    const r = await allocateAction(jobs.map((j) => j.id), picked, fee ? Number(fee) : null, instructions);
    setBusy(false);
    if (!r.ok) {
      toast.error(r.error);
      setConfirming(false);
      return;
    }
    toast.success(`${r.data} assignment${r.data === 1 ? "" : "s"} created — surveyors notified`);
    onClose();
    router.refresh();
  };

  return (
    <EntityDrawer
      open
      onClose={onClose}
      size="lg"
      title={`Allocate surveyor${jobs.length > 1 ? `s to ${jobs.length} jobs` : ` — ${jobs[0]?.number}`}`}
      description={`${[...new Set(jobs.map((j) => j.type))].join(", ")} · ${[...new Set(jobs.map((j) => j.location))].join(" · ")}`}
      dirty={picked.length > 0 && !busy}
      footer={
        confirming ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirming(false)}>Back</Button>
            <Button onClick={submit} loading={busy}>Confirm & notify</Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-muted" aria-live="polite">{picked.length ? `${picked.length} selected${picked.length > 1 ? " (joint inspection — first is lead)" : ""}` : "Select one or more surveyors"}</span>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={onClose}>Cancel</Button>
              <Button onClick={() => setConfirming(true)} disabled={!picked.length}>Review allocation</Button>
            </div>
          </div>
        )
      }
    >
      {err && <Alert tone="danger">{err}</Alert>}
      {confirming ? (
        <div className="space-y-4">
          <Alert tone="info" title="What happens next">
            Each surveyor gets a <strong>New</strong> assignment in their app and a notification. Job orders move to <strong>Assigned</strong>. If a surveyor rejects, you&apos;ll be notified and can reassign — the RFQ stays active.
          </Alert>
          <div>
            <p className="mb-2 text-sm font-semibold">Jobs ({jobs.length})</p>
            <ul className="space-y-1 text-sm">{jobs.map((j) => <li key={j.id}>{j.number} · <span className="text-muted">{j.type}</span></li>)}</ul>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold">Surveyors ({pickedC.length})</p>
            <ul className="space-y-1 text-sm">
              {pickedC.map((c, i) => (
                <li key={c.id}>{c.name} <Badge tone={c.kind === "IN_HOUSE" ? "blue" : "violet"}>{c.kind === "IN_HOUSE" ? "In-house" : "Independent"}</Badge>{i === 0 && <Badge tone="teal" className="ml-1">Lead</Badge>}</li>
              ))}
            </ul>
          </div>
          <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
            <Field label="Fee per job (₹)" help="Optional — what you pay the surveyor">
              {(p) => <Input id={p.id} aria-describedby={p.describedBy} type="number" min={0} value={fee} onChange={(e) => setFee(e.target.value)} />}
            </Field>
            <Field label="Instructions for the surveyor">
              {(p) => <Textarea id={p.id} rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Gate pass, contact on site, PPE, special photos…" />}
            </Field>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Surveyor type">
            {(["ALL", "IN_HOUSE", "INDEPENDENT"] as const).map((k) => (
              <button
                key={k}
                role="tab"
                aria-selected={kind === k}
                onClick={() => setKind(k)}
                className={cn("h-8 rounded-full border px-3 text-[13px] font-medium", kind === k ? "border-accent-strong bg-accent-soft text-accent-strong" : "border-border text-muted hover:text-text")}
              >
                {k === "ALL" ? "All surveyors" : k === "IN_HOUSE" ? "In-house" : "Independent (marketplace)"}
                {cands && <span className="ml-1.5 text-subtle">{cands.filter((c) => k === "ALL" || c.kind === k).length}</span>}
              </button>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
              <Input aria-label="Search surveyors" placeholder="Search name, mobile, email" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" aria-hidden />
              <Input aria-label="Filter by location or coverage" placeholder="Location / coverage (e.g. Ennore)" className="pl-9" value={loc} onChange={(e) => setLoc(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap gap-4">
            <Checkbox label="Qualified for these survey types" checked={onlyCapable} onChange={(e) => setOnlyCapable(e.target.checked)} />
            <Checkbox label="Available only" checked={onlyAvailable} onChange={(e) => setOnlyAvailable(e.target.checked)} />
          </div>

          {!cands ? (
            <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>
          ) : list.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border-strong px-4 py-8 text-center text-sm text-muted">No surveyors match. Try clearing a filter.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <div className="flex items-center gap-3 border-b border-border bg-surface-2 px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Select all visible surveyors"
                  className="h-4 w-4 accent-[var(--accent-strong)]"
                  checked={allVisibleSelected}
                  onChange={(e) => setPicked((p) => (e.target.checked ? [...new Set([...p, ...list.map((c) => c.id)])] : p.filter((id) => !list.some((c) => c.id === id))))}
                />
                <span className="text-xs font-semibold uppercase tracking-wide text-subtle">Surveyor</span>
              </div>
              <ul className="divide-y divide-border">
                {list.map((c) => (
                  <li key={c.id}>
                    <label className={cn("flex cursor-pointer items-start gap-3 px-3 py-3 hover:bg-surface-2", picked.includes(c.id) && "bg-accent-soft/60")}>
                      <input type="checkbox" className="mt-1 h-4 w-4 accent-[var(--accent-strong)]" checked={picked.includes(c.id)} onChange={() => toggle(c.id)} aria-label={`Select ${c.name}`} />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-semibold">{c.name}</span>
                          <Badge tone={c.kind === "IN_HOUSE" ? "blue" : "violet"}>{c.kind === "IN_HOUSE" ? "In-house" : "Independent"}</Badge>
                          <StatusPill status={c.availability} />
                          {!c.capable && <Badge tone="amber">Not listed for this type</Badge>}
                          {c.rejectedThese && <Badge tone="red">Rejected this job before</Badge>}
                        </span>
                        <span className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted">
                          <span><MapPin className="mr-0.5 inline h-3 w-3" aria-hidden />{c.baseLocation ?? "—"}</span>
                          <span>{c.workload} active job{c.workload === 1 ? "" : "s"}</span>
                          <span>{c.completed} completed</span>
                          <span><Star className="mr-0.5 inline h-3 w-3" aria-hidden />{c.rating.toFixed(1)}</span>
                          {c.rate != null && <span>Rate {fmtMoney(c.rate)}</span>}
                          <span>{formatPhone(c.phone)}</span>
                        </span>
                        {c.workload >= 3 && <span className="mt-1 flex items-center gap-1 text-xs text-warning"><AlertTriangle className="h-3 w-3" aria-hidden /> Heavy workload</span>}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {cands && <SelectKind count={list.length} />}
        </div>
      )}
    </EntityDrawer>
  );
}

function SelectKind({ count }: { count: number }) {
  return <p className="text-xs text-muted">{count} shown · sorted by availability, workload, then rating.</p>;
}

