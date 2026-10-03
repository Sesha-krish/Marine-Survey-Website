// One-off fix for databases seeded before the seed backdated job/report timestamps.
// Aligns demo jobs' updatedAt and reports' issuedAt with each RFQ's (demo) lifetime. Non-destructive.
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const rfqs = await db.rfq.findMany({ where: { isDemo: true } });
for (const r of rfqs) {
  const age = Math.max(1, Math.min(10, (Date.now() - r.createdAt.getTime()) / 86400e3));
  const at = new Date(r.createdAt.getTime() + age * 86400e3);
  await db.jobOrder.updateMany({ where: { rfqId: r.id }, data: { updatedAt: at } });
  await db.report.updateMany({ where: { survey: { jobOrder: { rfqId: r.id } }, issuedAt: { not: null } }, data: { issuedAt: at } });
}
console.log(`backdated ${rfqs.length} demo RFQs`);
await db.$disconnect();
