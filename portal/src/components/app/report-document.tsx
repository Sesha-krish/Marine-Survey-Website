import { REPORT_STAGE_LABEL, humanize, type ReportStage } from "@/lib/constants";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { formatContainer } from "@/lib/iso6346";
import { signedFileUrl } from "@/lib/storage";
import { fillCertificate } from "@/lib/templates/validate";
import type { ReportSnapshot } from "@/server/reports";
import { SurveyAnswersView } from "./survey-view";

/**
 * The document itself — rendered ONLY from a frozen version snapshot, never from live data.
 * Same component for the in-app view, print/PDF, and the public signed viewer.
 */
export function ReportDocument({
  snap, number, version, status, letterheadAttachmentId, amended, narrative, ttl = 900,
}: {
  snap: ReportSnapshot;
  number: string;
  version: number;
  status: string;
  letterheadAttachmentId: string | null;
  amended?: { at: Date | string; by: string; reason: string | null } | null;
  narrative?: string | null;
  ttl?: number;
}) {
  const stage = snap.stage as ReportStage;
  const a = snap.answers;
  const certificate = fillCertificate(snap.template.certificateText, {
    requester: snap.requester,
    area: `${snap.areaName} (${humanize(snap.surveyArea)})`,
    date: fmtDate(typeof a.inspectionDate === "string" ? a.inspectionDate : snap.surveyDate),
    container: snap.containerNumber ? formatContainer(snap.containerNumber) : "—",
    place: typeof a.placeOfInspection === "string" ? a.placeOfInspection : snap.locationName,
  });
  const draft = !["ISSUED", "REISSUED"].includes(status) && stage !== "SIGNED";

  return (
    <article className="print-page relative mx-auto max-w-[900px] rounded-xl border border-border bg-white p-6 text-[#0f172a] shadow-card sm:p-10" aria-label={`${REPORT_STAGE_LABEL[stage]} ${number}`}>
      {draft && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden" aria-hidden>
          <span className="-rotate-30 select-none text-[110px] font-black tracking-widest text-[#0f172a]/[0.05]">DRAFT</span>
        </div>
      )}
      {letterheadAttachmentId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={signedFileUrl(letterheadAttachmentId, ttl)} alt={`${snap.vendor.name} letterhead`} className="mb-6 w-full rounded" />
      ) : (
        <header className="mb-6 border-b-2 border-[#0b2545] pb-4">
          <p className="text-xl font-bold text-[#0b2545]">{snap.vendor.name}</p>
          <p className="text-xs text-[#475569]">{[snap.vendor.address, snap.vendor.phone, snap.vendor.email, snap.vendor.gstin && `GSTIN ${snap.vendor.gstin}`].filter(Boolean).join(" · ")}</p>
        </header>
      )}

      {amended && (
        <p className="mb-4 rounded-md border border-[#9a6700]/40 bg-[#fff4d6] px-3 py-2 text-xs text-[#5c3d00]">
          <strong>Amended</strong> on {fmtDateTime(amended.at)} by {amended.by}{amended.reason ? ` — ${amended.reason}` : ""}. Version {version}; earlier versions are retained.
        </p>
      )}

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[#2a9d8f]">{snap.template.name}</p>
          <h1 className="text-2xl font-bold">{stage === "CERTIFICATE" ? "Survey Certificate" : REPORT_STAGE_LABEL[stage]}</h1>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
          <dt className="text-[#64748b]">Report No</dt><dd className="font-semibold">{number} · v{version}</dd>
          <dt className="text-[#64748b]">Job ID</dt><dd>{snap.jobNumber}</dd>
          <dt className="text-[#64748b]">RFQ</dt><dd>{snap.rfqNumber}</dd>
          <dt className="text-[#64748b]">Survey</dt><dd>{snap.surveyNumber}</dd>
        </dl>
      </div>

      <p className="mb-6 text-sm leading-relaxed">{certificate}</p>

      <table className="mb-6 w-full border-collapse text-xs">
        <caption className="sr-only">Summary</caption>
        <tbody>
          <tr>
            {[
              ["Container No", snap.containerNumber ? formatContainer(snap.containerNumber) : "—"],
              ["Size", String(a.containerSize ?? "—")],
              ["Ship / Voyage", `${a.shipName ?? "—"} / ${a.voyageNo ?? "—"}`],
              ["Customs Seal", String(a.customsSealNo ?? "—")],
              ["Liner Seal", String(a.linerSealNo ?? "—")],
              ["Gross / Tare (kg)", `${a.grossWeight ?? "—"} / ${a.tareWeight ?? "—"}`],
              ["Verdict", snap.verdict ?? "—"],
            ].map(([k, v]) => (
              <td key={k} className="border border-[#cbd5e1] px-2 py-1.5 align-top">
                <span className="block text-[10px] uppercase tracking-wide text-[#64748b]">{k}</span>
                <span className={k === "Verdict" ? (v === "FIT" ? "font-bold text-[#14622c]" : v === "UNFIT" ? "font-bold text-[#a01b12]" : "") : "font-medium"}>{v}</span>
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      {stage === "CERTIFICATE" ? (
        <div className="space-y-3 text-sm">
          <p>Survey type: <strong>{snap.surveyType}</strong> · Requester: <strong>{snap.requester}</strong> · Surveyor: <strong>{snap.surveyor ?? "—"}</strong></p>
          {snap.verdictReason && <p>Reason: {snap.verdictReason}</p>}
          {Array.isArray(a.surveyorComments) && (
            <ol className="list-decimal pl-5">{(a.surveyorComments as string[]).map((c, i) => <li key={i}>{c}</li>)}</ol>
          )}
        </div>
      ) : (
        <div className="[&_.text-text]:text-[#0f172a] [&_.text-subtle]:text-[#64748b] [&_.border-border]:border-[#e2e8f0] [&_.bg-surface-2]:bg-[#f1f5f9]">
          <SurveyAnswersView schema={snap.template} answers={a} photos={snap.photos} verdict={snap.verdict} verdictReason={snap.verdictReason} ttl={ttl} />
        </div>
      )}

      {narrative && (
        <section className="mt-6">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-[#64748b]">Surveyor narrative</h2>
          <p className="whitespace-pre-line text-sm">{narrative}</p>
        </section>
      )}

      <footer className="mt-10 flex flex-wrap items-end justify-between gap-4 border-t border-[#e2e8f0] pt-4 text-xs text-[#475569]">
        <div>
          <p>Surveyed by <strong className="text-[#0f172a]">{snap.surveyor ?? "—"}</strong> for {snap.vendor.name}</p>
          <p>Generated {fmtDateTime(snap.generatedAt)}. This report is issued without prejudice.</p>
        </div>
        {snap.signedHash && (
          <div className="max-w-[340px] rounded-md border border-[#2a9d8f]/50 bg-[#e3f4f1] px-3 py-2 text-[#0f5e55]">
            <p className="font-semibold">Digitally issued by {snap.issuedBy}</p>
            <p className="break-all font-mono text-[10px]">SHA-256 {snap.signedHash}</p>
          </div>
        )}
      </footer>
    </article>
  );
}
