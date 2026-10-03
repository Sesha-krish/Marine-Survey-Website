import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { saveSurveyProgress } from "@/server/workflow";
import { DomainError } from "@/server/errors";

// Offline sync endpoint for the surveyor PWA. Field-level merge on revision conflicts.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSession();
  if (!u || u.role !== "SURVEYOR") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body.answers !== "object" || typeof body.baseRevision !== "number") return NextResponse.json({ error: "bad request" }, { status: 400 });
  try {
    const r = await saveSurveyProgress(u, id, {
      answers: body.answers,
      changedKeys: Array.isArray(body.changedKeys) ? body.changedKeys.slice(0, 500) : undefined,
      baseRevision: body.baseRevision,
      verdict: body.verdict,
      verdictReason: body.verdictReason,
      completionNotes: body.completionNotes,
    });
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof DomainError) return NextResponse.json({ error: e.message }, { status: 409 });
    console.error("[sync]", e);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}
