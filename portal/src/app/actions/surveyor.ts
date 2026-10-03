"use server";
import { revalidatePath } from "next/cache";
import { run } from "@/server/action";
import { respondToAssignment, startSurvey, submitSurvey } from "@/server/workflow";

export async function respondAction(assignmentId: string, accept: boolean, reason: string) {
  return run(["SURVEYOR"], async (u) => {
    await respondToAssignment(u, assignmentId, accept, reason);
    revalidatePath("/s");
  });
}

export async function startSurveyAction(assignmentId: string) {
  return run(["SURVEYOR"], async (u) => {
    const id = await startSurvey(u, assignmentId);
    revalidatePath("/s");
    return id;
  });
}

export async function submitSurveyAction(surveyId: string) {
  return run(["SURVEYOR"], async (u) => {
    await submitSurvey(u, surveyId);
    revalidatePath("/s");
  });
}
