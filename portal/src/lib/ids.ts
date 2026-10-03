import type { Tx } from "./db";

// One consistent ID scheme: PREFIX-YYYY-00001, sequence per prefix per year.
export type IdPrefix = "RFQ" | "JOB" | "ASN" | "SVY" | "RPT" | "INV" | "PUR" | "TKT";

export async function nextId(tx: Tx, prefix: IdPrefix, at = new Date()): Promise<string> {
  const key = `${prefix}-${at.getFullYear()}`;
  const row = await tx.counter.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `${key}-${String(row.value).padStart(5, "0")}`;
}
