import "server-only";
import type { Prisma } from "@prisma/client";
import { normalizeContainer } from "@/lib/iso6346";
import { ASSIGNMENT_STATUSES, INVOICE_STATUSES, JOB_STATUSES, REPORT_STAGES, REPORT_STATUSES, RFQ_STATUSES } from "@/lib/constants";
import { dateRange, listParams, multi, str, type SP } from "./list";

// Where-clause builders shared by list pages AND CSV export, so an export is exactly the filtered view.
// orgId ALWAYS comes from the session — never from the URL.

export function rfqQuery(orgId: string, sp: SP) {
  const lp = listParams(sp, { sortable: ["number", "createdAt", "surveyDate", "estimatedRate", "status"], defaultSort: "createdAt" });
  const status = multi(sp, "status", RFQ_STATUSES);
  const source = multi(sp, "source", ["PHONE", "EMAIL", "WHATSAPP", "WEBSITE", "OTHER"]);
  const typeId = str(sp, "type");
  const createdBy = str(sp, "createdBy");
  const q = lp.q;
  const where: Prisma.RfqWhereInput = {
    orgId,
    ...(status.length ? { status: { in: status } } : {}),
    ...(source.length ? { requestSource: { in: source } } : {}),
    ...(typeId ? { lines: { some: { surveyTypeId: typeId } } } : {}),
    ...(createdBy ? { createdById: createdBy } : {}),
    ...(dateRange(lp.from, lp.to) ? { createdAt: dateRange(lp.from, lp.to) } : {}),
    ...(q
      ? {
          OR: [
            { number: { contains: q.toUpperCase() } },
            { legacyNumber: { contains: q.toUpperCase() } },
            { customer: { organizationName: { contains: q } } },
            { customer: { firstName: { contains: q } } },
            { locationName: { contains: q } },
            { areaName: { contains: q } },
            { jobOrders: { some: { containerNumber: { contains: normalizeContainer(q) } } } },
          ],
        }
      : {}),
  };
  const orderBy: Prisma.RfqOrderByWithRelationInput = { [lp.sortKey]: lp.dir };
  return { lp, where, orderBy };
}

export function jobQuery(orgId: string, sp: SP) {
  const lp = listParams(sp, { sortable: ["number", "createdAt", "surveyDate", "status"], defaultSort: "createdAt" });
  const status = multi(sp, "status", JOB_STATUSES);
  const typeId = str(sp, "type");
  const surveyorId = str(sp, "surveyor");
  const rejected = str(sp, "rejected") === "1";
  const q = lp.q;
  const where: Prisma.JobOrderWhereInput = {
    orgId,
    ...(status.length ? { status: { in: status } } : {}),
    ...(typeId ? { surveyTypeId: typeId } : {}),
    ...(surveyorId ? { assignments: { some: { surveyorId, status: { in: ["NEW", "ACCEPTED", "IN_PROGRESS", "COMPLETED"] } } } } : {}),
    ...(rejected ? { assignments: { some: { status: "REJECTED" } } } : {}),
    ...(dateRange(lp.from, lp.to) ? { surveyDate: dateRange(lp.from, lp.to) } : {}),
    ...(q
      ? {
          OR: [
            { number: { contains: q.toUpperCase() } },
            { legacyNumber: { contains: q.toUpperCase() } },
            { containerNumber: { contains: normalizeContainer(q) } },
            { rfq: { number: { contains: q.toUpperCase() } } },
            { rfq: { customer: { organizationName: { contains: q } } } },
          ],
        }
      : {}),
  };
  return { lp, where, orderBy: { [lp.sortKey]: lp.dir } as Prisma.JobOrderOrderByWithRelationInput };
}

export function reportQuery(orgId: string, sp: SP) {
  const lp = listParams(sp, { sortable: ["number", "createdAt", "issuedAt", "status"], defaultSort: "createdAt" });
  const status = multi(sp, "status", REPORT_STATUSES);
  const stage = multi(sp, "stage", REPORT_STAGES);
  const q = lp.q;
  const where: Prisma.ReportWhereInput = {
    orgId,
    ...(status.length ? { status: { in: status } } : {}),
    ...(stage.length ? { stage: { in: stage } } : {}),
    ...(dateRange(lp.from, lp.to) ? { createdAt: dateRange(lp.from, lp.to) } : {}),
    ...(q
      ? {
          OR: [
            { number: { contains: q.toUpperCase() } },
            { survey: { number: { contains: q.toUpperCase() } } },
            { survey: { jobOrder: { number: { contains: q.toUpperCase() } } } },
            { survey: { jobOrder: { containerNumber: { contains: normalizeContainer(q) } } } },
            { survey: { jobOrder: { rfq: { number: { contains: q.toUpperCase() } } } } },
          ],
        }
      : {}),
  };
  return { lp, where, orderBy: { [lp.sortKey]: lp.dir } as Prisma.ReportOrderByWithRelationInput };
}

export function invoiceQuery(orgId: string, sp: SP) {
  const lp = listParams(sp, { sortable: ["number", "issueDate", "dueDate", "total", "status"], defaultSort: "issueDate" });
  const status = multi(sp, "status", INVOICE_STATUSES);
  const q = lp.q;
  const where: Prisma.InvoiceWhereInput = {
    orgId,
    ...(status.length ? { status: { in: status } } : {}),
    ...(dateRange(lp.from, lp.to) ? { issueDate: dateRange(lp.from, lp.to) } : {}),
    ...(q ? { OR: [{ number: { contains: q.toUpperCase() } }, { rfq: { number: { contains: q.toUpperCase() } } }, { customer: { organizationName: { contains: q } } }] } : {}),
  };
  return { lp, where, orderBy: { [lp.sortKey]: lp.dir } as Prisma.InvoiceOrderByWithRelationInput };
}

export { ASSIGNMENT_STATUSES };
