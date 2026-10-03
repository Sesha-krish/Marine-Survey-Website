import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { saveUpload, signedFileUrl, UploadError } from "@/lib/storage";

// Photo / signature upload into a named slot of an in-progress survey (surveyor only).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSession();
  if (!u || u.role !== "SURVEYOR" || !u.surveyorId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const survey = await db.survey.findFirst({
    where: { id, status: "IN_PROGRESS", jobOrder: { assignments: { some: { surveyorId: u.surveyorId, status: "IN_PROGRESS" } } } },
    include: { jobOrder: true },
  });
  if (!survey) return NextResponse.json({ error: "Survey not open for editing" }, { status: 409 });

  const form = await req.formData();
  const file = form.get("file");
  const slot = String(form.get("slot") ?? "");
  if (!(file instanceof File) || !slot || slot.length > 80) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const takenAt = new Date(String(form.get("takenAt") ?? "")) ;
  const lat = form.get("lat") ? Number(form.get("lat")) : null;
  const lng = form.get("lng") ? Number(form.get("lng")) : null;
  try {
    // Files are owned by the vendor tenant that owns the job (independent surveyors upload into it).
    const a = await saveUpload({ file, kind: "photo", attachmentKind: slot.startsWith("sig:") ? "SIGNATURE" : "PHOTO", orgId: survey.jobOrder.orgId, userId: u.id });
    // Named slots hold one photo; replacing keeps the old file but unlinks it. "extra:*" slots accumulate.
    if (!slot.startsWith("extra:")) await db.surveyPhoto.deleteMany({ where: { surveyId: id, slot } });
    const p = await db.surveyPhoto.create({
      data: { surveyId: id, slot, attachmentId: a.id, takenAt: isNaN(+takenAt) || takenAt > new Date() ? new Date() : takenAt, lat: Number.isFinite(lat) ? lat : null, lng: Number.isFinite(lng) ? lng : null },
    });
    return NextResponse.json({ id: p.id, slot, url: signedFileUrl(a.id, 3600) });
  } catch (e) {
    if (e instanceof UploadError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[photo]", e);
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const u = await getSession();
  if (!u || u.role !== "SURVEYOR" || !u.surveyorId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const slot = new URL(req.url).searchParams.get("slot") ?? "";
  const ok = await db.survey.count({ where: { id, status: "IN_PROGRESS", jobOrder: { assignments: { some: { surveyorId: u.surveyorId, status: "IN_PROGRESS" } } } } });
  if (!ok) return NextResponse.json({ error: "Survey not open for editing" }, { status: 409 });
  await db.surveyPhoto.deleteMany({ where: { surveyId: id, slot } });
  return NextResponse.json({ ok: true });
}
