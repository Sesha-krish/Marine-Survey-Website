"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { run } from "@/server/action";
import { DomainError } from "@/server/errors";
import { purchasePackage } from "@/server/billing";

export async function buyPackageAction(packageId: string) {
  return run(["VENDOR_ADMIN"], async (u) => {
    const p = await purchasePackage(u, packageId);
    revalidatePath("/billing");
    return { number: p.number, credits: p.credits };
  });
}

export async function creditSettingsAction(input: { autoRenew: boolean; autoRenewPkgId: string | null; lowCreditAlert: number }) {
  return run(["VENDOR_ADMIN"], async (u) => {
    if (!Number.isInteger(input.lowCreditAlert) || input.lowCreditAlert < 0 || input.lowCreditAlert > 1000) throw new DomainError("Low-balance alert must be between 0 and 1000", { lowCreditAlert: "0–1000" });
    if (input.autoRenew && !input.autoRenewPkgId) throw new DomainError("Choose the package to auto-renew", { autoRenewPkgId: "Required" });
    await db.$transaction(async (tx) => {
      await tx.organization.update({ where: { id: u.orgId }, data: { autoRenew: input.autoRenew, autoRenewPkgId: input.autoRenewPkgId, lowCreditAlert: input.lowCreditAlert } });
      await audit(tx, u, { entityType: "ORGANIZATION", entityId: u.orgId, action: "USER_UPDATED", note: `Credit settings: auto-renew ${input.autoRenew ? "on" : "off"}, alert at ${input.lowCreditAlert}` });
    });
    revalidatePath("/billing");
  });
}
