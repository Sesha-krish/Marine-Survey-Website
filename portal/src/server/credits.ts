import type { Tx } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { DomainError } from "./errors";

/** Credit cost of a set of RFQ lines for an org (tenant overrides beat the default rate card). */
export async function creditCost(tx: Tx, orgId: string, surveyTypeIds: string[]) {
  if (!surveyTypeIds.length) return 0;
  const types = await tx.surveyType.findMany({ where: { id: { in: [...new Set(surveyTypeIds)] } }, select: { id: true, creditCost: true } });
  const overrides = await tx.rateOverride.findMany({ where: { orgId, surveyTypeId: { in: types.map((t) => t.id) } } });
  const cost = new Map(types.map((t) => [t.id, t.creditCost]));
  for (const o of overrides) cost.set(o.surveyTypeId, o.creditCost);
  return surveyTypeIds.reduce((sum, id) => sum + (cost.get(id) ?? 1), 0);
}

/** Atomic ledger write. Positive delta = credit, negative = debit. Refuses to go below zero. */
export async function postCredits(
  tx: Tx,
  orgId: string,
  delta: number,
  reason: string,
  ref: { type?: string; id?: string; actor?: Pick<SessionUser, "id"> | null } = {},
) {
  if (delta === 0) return;
  const org = await tx.organization.findUniqueOrThrow({ where: { id: orgId }, select: { creditBalance: true } });
  const balanceAfter = org.creditBalance + delta;
  if (balanceAfter < 0) {
    throw new DomainError(`Not enough credits: this needs ${-delta} credit${-delta === 1 ? "" : "s"} and your balance is ${org.creditBalance}. Buy a package under Billing.`);
  }
  // Conditional update guards against concurrent spends.
  const res = await tx.organization.updateMany({
    where: { id: orgId, creditBalance: org.creditBalance },
    data: { creditBalance: balanceAfter },
  });
  if (res.count !== 1) throw new DomainError("Your credit balance changed while saving — please retry.");
  await tx.creditLedger.create({
    data: { orgId, delta, reason, balanceAfter, refType: ref.type, refId: ref.id, actorId: ref.actor?.id },
  });
}
