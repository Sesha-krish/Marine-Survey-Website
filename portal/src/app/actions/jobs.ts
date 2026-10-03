"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { ACTIVE_ASSIGNMENT_STATUSES } from "@/lib/constants";
import { run, VENDOR } from "@/server/action";
import { NotFound } from "@/server/errors";
import { assignSurveyors, cancelAssignment, cancelJob, reviewSurvey, updateJob } from "@/server/workflow";
import { generatePreliminary } from "@/server/reports";

export type Candidate = {
  id: string;
  name: string;
  kind: string;
  phone: string;
  email: string;
  availability: string;
  baseLocation: string | null;
  coverage: string | null;
  rating: number;
  workload: number;
  capable: boolean;
  rate: number | null;
  completed: number;
  rejectedThese: boolean;
};

/** Surveyors offered in the allocation drawer: own in-house + own independents + marketplace independents. */
export async function allocationCandidates(jobIds: string[]) {
  return run(VENDOR, async (u) => {
    const jobs = await db.jobOrder.findMany({ where: { id: { in: jobIds }, orgId: u.orgId }, include: { assignments: true } });
    if (jobs.length !== jobIds.length) throw new NotFound("Job order");
    const typeIds = [...new Set(jobs.map((j) => j.surveyTypeId))];
    const rejectedBy = new Set(jobs.flatMap((j) => j.assignments.filter((a) => a.status === "REJECTED").map((a) => a.surveyorId)));
    const surveyors = await db.surveyor.findMany({
      where: { active: true, availability: { not: "INACTIVE" }, OR: [{ orgId: u.orgId }, { orgId: null, kind: "INDEPENDENT" }] },
      include: {
        capabilities: true,
        rates: { where: { surveyTypeId: { in: typeIds } }, orderBy: { effectiveFrom: "desc" } },
        _count: { select: { assignments: { where: { status: { in: ACTIVE_ASSIGNMENT_STATUSES } } } } },
        assignments: { where: { status: "COMPLETED" }, select: { id: true } },
      },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
    });
    return surveyors.map<Candidate>((s) => ({
      id: s.id,
      name: s.name,
      kind: s.kind,
      phone: s.phone,
      email: s.email,
      availability: s.availability,
      baseLocation: s.baseLocation,
      coverage: s.coverage,
      rating: s.rating,
      workload: s._count.assignments,
      capable: typeIds.every((t) => s.capabilities.some((c) => c.surveyTypeId === t)),
      rate: s.rates[0]?.amount ?? null,
      completed: s.assignments.length,
      rejectedThese: rejectedBy.has(s.id),
    }));
  });
}

export async function allocateAction(jobIds: string[], surveyorIds: string[], fee: number | null, instructions: string) {
  return run(VENDOR, async (u) => {
    const ids = await assignSurveyors(u, jobIds, surveyorIds, { fee: fee ?? undefined, instructions: instructions.trim() || undefined });
    revalidatePath("/jobs");
    revalidatePath("/rfqs");
    return ids.length;
  });
}

export async function cancelAssignmentAction(assignmentId: string, reason: string) {
  return run(VENDOR, async (u) => {
    await cancelAssignment(u, assignmentId, reason);
    revalidatePath("/jobs");
  });
}

export async function cancelJobAction(jobId: string, reason: string) {
  return run(VENDOR, async (u) => {
    await cancelJob(u, jobId, reason);
    revalidatePath("/jobs");
  });
}

export async function updateJobAction(jobId: string, data: { containerNumber?: string; surveyDate?: string; location?: string }) {
  return run(VENDOR, async (u) => {
    await updateJob(u, jobId, data);
    revalidatePath(`/jobs/${jobId}`);
  });
}

export async function reviewSurveyAction(surveyId: string, approve: boolean, note: string) {
  return run(VENDOR, async (u) => {
    await reviewSurvey(u, surveyId, approve, note);
    revalidatePath("/jobs");
  });
}

export async function preliminaryAction(surveyId: string) {
  return run(VENDOR, async (u) => {
    await generatePreliminary(u, surveyId);
    revalidatePath("/reports");
  });
}
