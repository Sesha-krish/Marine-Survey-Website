import { Anchor, ShieldCheck, ShieldX } from "lucide-react";
import { db } from "@/lib/db";
import { verifyToken } from "@/lib/storage";
import { ReportDocument } from "@/components/app/report-document";
import { PrintButton } from "./print";
import type { ReportSnapshot } from "@/server/reports";
import { fmtDateTime } from "@/lib/format";

export const metadata = { title: "Verified survey report", robots: { index: false } };

/** Public, expiring, signed viewer for a specific report version. No login needed; nothing else is exposed. */
export default async function VerifyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const payload = verifyToken(decodeURIComponent(token));
  const [reportId, ver] = payload?.split(":") ?? [];
  const r = reportId ? await db.report.findUnique({ where: { id: reportId }, include: { versions: { where: { version: Number(ver) } } } }) : null;
  const v = r?.versions[0];

  if (!r || !v) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <div className="max-w-md rounded-xl border border-border bg-surface p-8 text-center shadow-card">
          <ShieldX className="mx-auto h-10 w-10 text-danger" aria-hidden />
          <h1 className="mt-3 text-lg font-semibold">This link is invalid or has expired</h1>
          <p className="mt-1 text-sm text-muted">Ask the survey company to send you a fresh link.</p>
        </div>
      </main>
    );
  }
  const snap = JSON.parse(v.snapshot) as ReportSnapshot;
  const superseded = r.currentVersion > v.version;
  return (
    <main className="min-h-dvh px-4 py-8">
      <div className="no-print mx-auto mb-6 flex max-w-[900px] flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-semibold"><Anchor className="h-4 w-4" aria-hidden /> Marine Survey Portal</span>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-xs font-semibold text-success">
            <ShieldCheck className="h-4 w-4" aria-hidden /> Authentic · {r.number} v{v.version} · issued {fmtDateTime(r.issuedAt)}
          </span>
          <PrintButton />
        </div>
      </div>
      {superseded && (
        <p className="no-print mx-auto mb-4 max-w-[900px] rounded-lg border border-warning/40 bg-warning-soft px-4 py-2 text-sm">
          A newer version (v{r.currentVersion}) of this report has been issued. Ask the survey company for the latest link.
        </p>
      )}
      <ReportDocument snap={snap} number={r.number} version={v.version} status="ISSUED" letterheadAttachmentId={snap.letterheadAttachmentId} narrative={v.narrative} ttl={3600} />
    </main>
  );
}
