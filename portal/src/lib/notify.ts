import type { Tx } from "./db";

export type NotifyInput = { type: string; title: string; body?: string; link?: string };

/** In-app notification (persisted history). Email/push dispatch hooks in here later. */
export async function notifyUsers(tx: Tx, userIds: (string | null | undefined)[], n: NotifyInput) {
  const ids = [...new Set(userIds.filter((x): x is string => !!x))];
  if (!ids.length) return;
  await tx.notification.createMany({ data: ids.map((userId) => ({ userId, ...n })) });
}

/** Notify every active vendor admin/staff of an org. */
export async function notifyVendor(tx: Tx, orgId: string, n: NotifyInput) {
  const users = await tx.user.findMany({
    where: { orgId, active: true, role: { in: ["VENDOR_ADMIN", "VENDOR_STAFF"] } },
    select: { id: true },
  });
  await notifyUsers(tx, users.map((u) => u.id), n);
}
