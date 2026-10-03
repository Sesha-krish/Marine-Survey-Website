import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { signedFileUrl } from "@/lib/storage";
import type { TemplateSchema } from "@/lib/templates/types";
import { SurveyForm } from "./survey-form";

export const metadata = { title: "Survey capture" };

export default async function SurveyCapturePage({ params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser(["SURVEYOR"]);
  const { id } = await params;
  const s = await db.survey.findFirst({
    where: { id, jobOrder: { assignments: { some: { surveyorId: u.surveyorId ?? "__none__", status: { in: ["IN_PROGRESS", "COMPLETED"] } } } } },
    include: { template: true, photos: true, jobOrder: { include: { surveyType: true, rfq: true, assignments: { where: { surveyorId: u.surveyorId ?? "" } } } } },
  });
  if (!s) notFound();
  const returned = await db.auditLog.findFirst({ where: { entityId: s.id, action: "SURVEY_RETURNED" }, orderBy: { createdAt: "desc" } });
  return (
    <SurveyForm
      survey={{
        id: s.id,
        number: s.number,
        status: s.status,
        revision: s.revision,
        answers: JSON.parse(s.answers),
        verdict: s.verdict,
        verdictReason: s.verdictReason,
        completionNotes: s.completionNotes,
      }}
      job={{ number: s.jobOrder.number, type: s.jobOrder.surveyType.name, container: s.jobOrder.containerNumber, location: s.jobOrder.location, surveyDate: s.jobOrder.surveyDate.toISOString(), assignmentId: s.jobOrder.assignments[0]?.id ?? null }}
      schema={JSON.parse(s.template.schema) as TemplateSchema}
      photos={s.photos.map((p) => ({ slot: p.slot, url: signedFileUrl(p.attachmentId, 4 * 3600), takenAt: p.takenAt.toISOString() }))}
      returnNote={s.status === "IN_PROGRESS" && returned ? returned.note : null}
    />
  );
}
