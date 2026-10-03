import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { customerName, fmtDate } from "@/lib/format";
import { countryName } from "@/lib/countries";
import { REPORT_STAGE_LABEL, humanize, type ReportStage } from "@/lib/constants";
import { invoiceQuery, jobQuery, reportQuery, rfqQuery } from "@/server/queries";
import { toCsv, type SP } from "@/server/list";

const MAX = 10_000;

// CSV export of exactly the filtered view (or ?ids=… for selected rows). Tenant from the session only.
export async function GET(req: Request, { params }: { params: Promise<{ entity: string }> }) {
  const u = await getSession();
  if (!u || !["VENDOR_ADMIN", "VENDOR_STAFF"].includes(u.role)) return new Response("Unauthorized", { status: 401 });
  const { entity } = await params;
  const url = new URL(req.url);
  const sp: SP = {};
  url.searchParams.forEach((v, k) => (sp[k] = v));
  const ids = url.searchParams.get("ids")?.split(",").filter(Boolean).slice(0, 1000);
  let csv: string;

  switch (entity) {
    case "rfqs": {
      const { where, orderBy } = rfqQuery(u.orgId, sp);
      const rows = await db.rfq.findMany({ where: ids ? { orgId: u.orgId, id: { in: ids } } : where, orderBy, take: MAX, include: { customer: true, lines: { include: { surveyType: true } } } });
      csv = toCsv(
        ["RFQ ID", "Legacy ID", "Received", "Source", "Customer", "Survey area", "Area name", "Location", "Survey date", "Survey types", "Currency", "Estimated rate", "Status", "Credits charged"],
        rows.map((r) => [r.number, r.legacyNumber, fmtDate(r.createdAt), humanize(r.requestSource), customerName(r.customer), humanize(r.surveyArea), r.areaName, r.locationName, fmtDate(r.surveyDate), r.lines.map((l) => `${l.surveyType.name} x${l.quantity}`).join("; "), r.currency, r.estimatedRate, humanize(r.status), r.creditsCharged]),
      );
      break;
    }
    case "jobs": {
      const { where, orderBy } = jobQuery(u.orgId, sp);
      const rows = await db.jobOrder.findMany({ where: ids ? { orgId: u.orgId, id: { in: ids } } : where, orderBy, take: MAX, include: { rfq: { include: { customer: true } }, surveyType: true, assignments: { include: { surveyor: true } } } });
      csv = toCsv(
        ["Job ID", "RFQ ID", "Type of survey", "Container", "Requester", "Location", "Survey date", "Surveyor", "Assignment status", "Verdict", "Status"],
        rows.map((j) => {
          const a = j.assignments.find((x) => !["REJECTED", "CANCELLED"].includes(x.status));
          return [j.number, j.rfq.number, j.surveyType.name, j.containerNumber, customerName(j.rfq.customer), j.location, fmtDate(j.surveyDate), a?.surveyor.name, a ? humanize(a.status) : "", j.bulkVerdict, humanize(j.status)];
        }),
      );
      break;
    }
    case "reports": {
      const { where, orderBy } = reportQuery(u.orgId, sp);
      const rows = await db.report.findMany({ where, orderBy, take: MAX, include: { survey: { include: { jobOrder: { include: { rfq: true, surveyType: true } } } } } });
      csv = toCsv(
        ["Report", "Stage", "Version", "Survey", "RFQ", "Job", "Type", "Container", "Issued", "Sent to", "Status"],
        rows.map((r) => [r.number, REPORT_STAGE_LABEL[r.stage as ReportStage], r.currentVersion, r.survey.number, r.survey.jobOrder.rfq.number, r.survey.jobOrder.number, r.survey.jobOrder.surveyType.name, r.survey.jobOrder.containerNumber, fmtDate(r.issuedAt), r.sentTo, humanize(r.status)]),
      );
      break;
    }
    case "invoices": {
      const { where, orderBy } = invoiceQuery(u.orgId, sp);
      const rows = await db.invoice.findMany({ where, orderBy, take: MAX, include: { rfq: true, customer: true } });
      csv = toCsv(
        ["Invoice", "RFQ", "Customer", "Customer GSTIN", "Issued", "Due", "Currency", "Subtotal", "CGST", "SGST", "IGST", "Total", "Paid", "Balance", "Status"],
        rows.map((i) => [i.number, i.rfq.number, customerName(i.customer), i.customerGstin, fmtDate(i.issueDate), fmtDate(i.dueDate), i.currency, i.subtotal, i.cgst, i.sgst, i.igst, i.total, i.amountPaid, Math.round((i.total - i.amountPaid) * 100) / 100, humanize(i.status)]),
      );
      break;
    }
    case "customers": {
      const rows = await db.customer.findMany({ where: { orgId: u.orgId }, orderBy: { createdAt: "desc" }, take: MAX });
      csv = toCsv(
        ["Customer", "Type", "Email", "Mobile", "GSTIN / Tax ID", "Address", "City", "State", "Country", "Active"],
        rows.map((c) => [customerName(c), humanize(c.customerType), c.email, c.phone, c.taxId, [c.address1, c.address2].filter(Boolean).join(", "), c.city, c.state, countryName(c.country), c.active ? "Yes" : "No"]),
      );
      break;
    }
    default:
      return new Response("Not found", { status: 404 });
  }
  const stamp = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${entity}-${stamp}.csv"`, "Cache-Control": "no-store" },
  });
}
