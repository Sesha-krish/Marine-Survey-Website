"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { run, VENDOR } from "@/server/action";
import { amendReport, issueReport, sendForReview, sendReport, setReportLetterhead } from "@/server/reports";
import type { Answers } from "@/lib/templates/types";

const reval = (id: string) => {
  revalidatePath(`/reports/${id}`);
  revalidatePath("/reports");
};

export async function reviewReportAction(id: string) {
  return run(VENDOR, async (u) => {
    await sendForReview(u, id);
    reval(id);
  });
}

export async function issueReportAction(id: string) {
  return run(VENDOR, async (u) => {
    await issueReport(u, id);
    reval(id);
  });
}

export async function amendReportAction(id: string, input: { changes: Answers; verdict?: string | null; verdictReason?: string | null; narrative?: string | null; reason: string }) {
  return run(VENDOR, async (u) => {
    const v = await amendReport(u, id, input);
    reval(id);
    return v;
  });
}

export async function letterheadForReportAction(id: string, letterheadId: string | null) {
  return run(VENDOR, async (u) => {
    await setReportLetterhead(u, id, letterheadId);
    reval(id);
  });
}

export async function sendReportAction(id: string, to: string) {
  return run(VENDOR, async (u) => {
    const h = await headers();
    const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
    const link = await sendReport(u, id, to, origin);
    reval(id);
    return link;
  });
}
