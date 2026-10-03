// End-to-end business workflow through the real services (owner requirements §1–14).
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { TEMPLATES } from "@/lib/templates/definitions";
import { makeContainer } from "@/lib/iso6346";
import { computeValue } from "@/lib/templates/validate";
import {
  acceptRfq, assignSurveyors, closeRfq, createRfq, respondToAssignment, reviewSurvey, saveSurveyProgress, startSurvey, submitSurvey, type Actor,
} from "@/server/workflow";
import { amendReport, issueReport, sendReport } from "@/server/reports";
import { createInvoice, markInvoiceSent, purchasePackage, recordPayment } from "@/server/billing";
import { DomainError } from "@/server/errors";

let vendor: Actor, other: Actor, svA: Actor, svB: Actor;
let customerId: string, cocId: string;
const container = makeContainer("MSKU", "123456");
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
const tomorrow = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(Date.now() + 86400e3));

const rfqInput = () => ({
  customerId,
  intake: { requestSource: "WHATSAPP", requestReceivedAt: new Date().toISOString(), contactPerson: "Mr. Test" },
  survey: { cargoName: "Empty containers", cargoQuantity: "1", lines: [{ surveyTypeId: cocId, quantity: 1, scope: ["Inspection of empty container prior to stuffing"] }] },
  details: { surveyArea: "YARD", areaName: "Test Yard", locationName: "Chennai Port", surveyDate: tomorrow, currency: "INR", estimatedRate: 2000, paymentTerms: "Net 15", jointInspection: false, jointInspectors: [] },
  agent: { companyName: "Test Agency", email: "agent@test.in", phone: "+914425330000", address: "Chennai", contacts: [] },
  files: { attachments: [] },
});

beforeAll(async () => {
  const cat = await db.surveyCategory.create({ data: { name: "Shore Based Survey" } });
  const sub = await db.surveySubCategory.create({ data: { categoryId: cat.id, name: "Container" } });
  const t = await db.surveyType.create({ data: { subCategoryId: sub.id, code: "COC", name: "Condition of Container", creditCost: 2 } });
  cocId = t.id;
  await db.surveyTemplate.create({ data: { surveyTypeId: t.id, version: 1, name: "COC", schema: JSON.stringify(TEMPLATES.COC), published: true } });
  const pkg = await db.package.create({ data: { name: "Gold", price: 200, credits: 5, validityDays: 30 } });

  const mkOrg = (name: string) => db.organization.create({ data: { name, kind: "VENDOR", state: "Tamil Nadu" } });
  const o1 = await mkOrg("Vendor One");
  const o2 = await mkOrg("Vendor Two");
  const mkUser = (orgId: string, email: string, role: string) => db.user.create({ data: { orgId, email, role, passwordHash: "x", firstName: email.split("@")[0] } });
  const u1 = await mkUser(o1.id, "v1@test.in", "VENDOR_ADMIN");
  const u2 = await mkUser(o2.id, "v2@test.in", "VENDOR_ADMIN");
  vendor = { id: u1.id, orgId: o1.id, name: "V1", role: "VENDOR_ADMIN", surveyorId: null };
  other = { id: u2.id, orgId: o2.id, name: "V2", role: "VENDOR_ADMIN", surveyorId: null };
  await purchasePackage(vendor, pkg.id);

  const mkSv = async (name: string, kind: string, orgId: string | null) => {
    const user = await mkUser(o1.id, `${name}@test.in`, "SURVEYOR");
    const s = await db.surveyor.create({ data: { name, kind, orgId, userId: user.id, email: `${name}@test.in`, phone: "+919800000000", capabilities: { create: [{ surveyTypeId: cocId }] } } });
    return { id: user.id, orgId: o1.id, name, role: "SURVEYOR" as const, surveyorId: s.id };
  };
  svA = await mkSv("alice", "IN_HOUSE", o1.id);
  svB = await mkSv("bob", "INDEPENDENT", null);
  customerId = (await db.customer.create({ data: { orgId: o1.id, customerType: "ENTERPRISE", organizationName: "Cust", email: "c@test.in", phone: "+914400000000", address1: "a", country: "IN", state: "Tamil Nadu", city: "Chennai" } })).id;
});

describe("vendor → surveyor → report workflow", () => {
  let rfqId: string, jobId: string, surveyId: string;

  it("creates an RFQ (NEW), generates its ID and charges credits", async () => {
    const rfq = await createRfq(vendor, rfqInput());
    rfqId = rfq.id;
    expect(rfq.number).toMatch(/^RFQ-\d{4}-00001$/);
    const r = await db.rfq.findUniqueOrThrow({ where: { id: rfq.id } });
    expect(r.status).toBe("NEW");
    expect(r.creditsCharged).toBe(2);
    expect((await db.organization.findUniqueOrThrow({ where: { id: vendor.orgId } })).creditBalance).toBe(3);
    expect(await db.auditLog.count({ where: { rfqId, action: "RFQ_CREATED" } })).toBe(1);
  });

  it("isolates tenants", async () => {
    await expect(acceptRfq(other, rfqId)).rejects.toThrow(/not found/i);
    await expect(createRfq(other, rfqInput())).rejects.toThrow(/customer/i);
  });

  it("rejects invalid container numbers on accept, then accepts", async () => {
    const line = await db.rfqLine.findFirstOrThrow({ where: { rfqId } });
    await expect(acceptRfq(vendor, rfqId, { [line.id]: ["ABCD1234567"] })).rejects.toBeInstanceOf(DomainError);
    expect(await acceptRfq(vendor, rfqId, { [line.id]: [container] })).toBe(1);
    const job = await db.jobOrder.findFirstOrThrow({ where: { rfqId }, include: { survey: true } });
    jobId = job.id;
    surveyId = job.survey!.id;
    expect(job.containerNumber).toBe(container);
  });

  it("surveyor rejection never rejects the RFQ, and keeps history for reassignment", async () => {
    const [a1] = await assignSurveyors(vendor, [jobId], [svA.surveyorId!]);
    expect((await db.rfq.findUniqueOrThrow({ where: { id: rfqId } })).status).toBe("ASSIGNED");
    await expect(respondToAssignment(svA, a1, false, "")).rejects.toThrow(/why/i);
    await respondToAssignment(svA, a1, false, "Unavailable");
    expect((await db.assignment.findUniqueOrThrow({ where: { id: a1 } })).status).toBe("REJECTED");
    expect((await db.jobOrder.findUniqueOrThrow({ where: { id: jobId } })).status).toBe("NEW");
    expect((await db.rfq.findUniqueOrThrow({ where: { id: rfqId } })).status).toBe("ACCEPTED");
    const vendorNotice = await db.notification.findFirst({ where: { userId: vendor.id, type: "ASSIGNMENT_REJECTED" } });
    expect(vendorNotice?.body).toBe("Unavailable");

    const [a2] = await assignSurveyors(vendor, [jobId], [svB.surveyorId!]);
    const asn2 = await db.assignment.findUniqueOrThrow({ where: { id: a2 } });
    expect(asn2.previousId).toBe(a1);
    expect(asn2.status).toBe("NEW");
    expect(await db.assignment.count({ where: { jobOrderId: jobId } })).toBe(2);
    // other surveyor can't act on it
    await expect(respondToAssignment(svA, a2, true)).rejects.toThrow(/not found/i);
    await respondToAssignment(svB, a2, true);
    await expect(startSurvey(svA, a2)).rejects.toThrow();
    expect(await startSurvey(svB, a2)).toBe(surveyId);
    expect((await db.rfq.findUniqueOrThrow({ where: { id: rfqId } })).status).toBe("IN_PROGRESS");
  });

  it("merges offline edits field-by-field on revision conflicts", async () => {
    const r1 = await saveSurveyProgress(svB, surveyId, { answers: { remarks: "first" }, baseRevision: 0 });
    const r2 = await saveSurveyProgress(svB, surveyId, { answers: { trailerNo: "TN01" }, changedKeys: ["trailerNo"], baseRevision: 0 });
    expect(r2.conflict).toBe(true);
    expect(r2.answers.remarks).toBe("first");
    expect(r2.revision).toBe(r1.revision + 1);
  });

  it("blocks submission until required data, photos and signature exist", async () => {
    await expect(submitSurvey(svB, surveyId)).rejects.toThrow(/need attention/);
    const fields = TEMPLATES.COC.sections.flatMap((s) => s.fields);
    const answers: Record<string, unknown> = {};
    for (const f of fields) {
      if (f.type === "select" || f.type === "radio") answers[f.id] = f.options[0];
      else if (f.type === "date") answers[f.id] = today;
      else if (f.type === "time") answers[f.id] = f.id === "inspectionEnd" ? "11:00" : "10:00";
      else if (f.type === "container") answers[f.id] = container;
      else if (f.type === "number") answers[f.id] = f.id === "grossWeight" ? 28000 : 3000;
      else if (f.type === "list") answers[f.id] = ["Sound condition"];
      else if (f.type !== "computed") answers[f.id] = "x";
    }
    answers.payload = computeValue(fields.find((f) => f.id === "payload") as never, answers);
    await saveSurveyProgress(svB, surveyId, { answers, baseRevision: 99, verdict: "FIT" });
    const att = await db.attachment.create({ data: { orgId: vendor.orgId, kind: "PHOTO", fileName: "p.png", mimeType: "image/png", size: 1, storageKey: "none", uploadedById: svB.id } });
    for (const s of [...TEMPLATES.COC.photoSlots.map((p) => p.id), "sig:surveyor"]) {
      await db.surveyPhoto.create({ data: { surveyId, slot: s, attachmentId: att.id, takenAt: new Date() } });
    }
    await submitSurvey(svB, surveyId);
    expect((await db.survey.findUniqueOrThrow({ where: { id: surveyId } })).status).toBe("SUBMITTED");
    expect((await db.jobOrder.findUniqueOrThrow({ where: { id: jobId } })).status).toBe("SUBMITTED");
    const stages = (await db.report.findMany({ where: { surveyId } })).map((r) => r.stage).sort();
    expect(stages).toEqual(["CERTIFICATE", "COMPLETION", "FORMAL"]);
  });

  it("vendor approves; issuing locks the report and produces a signed copy", async () => {
    await reviewSurvey(vendor, surveyId, true);
    expect((await db.rfq.findUniqueOrThrow({ where: { id: rfqId } })).status).toBe("COMPLETED");
    const formal = await db.report.findFirstOrThrow({ where: { surveyId, stage: "FORMAL" } });
    await expect(sendReport(vendor, formal.id, "c@test.in", "http://x")).rejects.toThrow(/Issue the report/);
    await issueReport(vendor, formal.id);
    const v1 = await db.reportVersion.findFirstOrThrow({ where: { reportId: formal.id, version: 1 } });
    expect(v1.locked).toBe(true);
    const signed = await db.report.findFirstOrThrow({ where: { surveyId, stage: "SIGNED" }, include: { versions: true } });
    expect(JSON.parse(signed.versions[0].snapshot).signedHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("amendments create a new immutable version and require re-issue", async () => {
    const formal = await db.report.findFirstOrThrow({ where: { surveyId, stage: "FORMAL" } });
    await expect(amendReport(vendor, formal.id, { changes: { linerSealNo: "NEW-1" }, reason: "" })).rejects.toThrow(/reason/);
    expect(await amendReport(vendor, formal.id, { changes: { linerSealNo: "NEW-1" }, reason: "Typo" })).toBe(2);
    const r = await db.report.findUniqueOrThrow({ where: { id: formal.id }, include: { versions: { orderBy: { version: "asc" } } } });
    expect(r.status).toBe("AMENDED");
    expect(JSON.parse(r.versions[0].snapshot).answers.linerSealNo).toBe("x"); // v1 untouched
    expect(JSON.parse(r.versions[1].snapshot).answers.linerSealNo).toBe("NEW-1");
    await issueReport(vendor, formal.id);
    expect((await db.report.findUniqueOrThrow({ where: { id: formal.id } })).status).toBe("REISSUED");
    const link = await sendReport(vendor, formal.id, "c@test.in", "http://x");
    expect(link).toMatch(/^http:\/\/x\/verify\//);
  });

  it("invoices with GST split and derives payment status", async () => {
    const inv = await createInvoice(vendor, { rfqId, dueDate: tomorrow, lines: [{ jobOrderId: jobId, description: "COC", sac: "998346", quantity: 1, unitPrice: 1000, taxRate: 18 }] });
    expect(inv.taxMode).toBe("CGST_SGST"); // vendor and customer both in Tamil Nadu
    expect(inv.total).toBe(1180);
    await markInvoiceSent(vendor, inv.id);
    await expect(recordPayment(vendor, inv.id, { amount: 5000, mode: "UPI", reference: "r", paidAt: today })).rejects.toThrow(/exceeds/);
    await recordPayment(vendor, inv.id, { amount: 500, mode: "UPI", reference: "r1", paidAt: today });
    expect((await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe("PARTIALLY_PAID");
    await recordPayment(vendor, inv.id, { amount: 680, mode: "UPI", reference: "r2", paidAt: today });
    expect((await db.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe("PAID");
  });

  it("declining a NEW RFQ refunds credits; insufficient credits block submission", async () => {
    const before = (await db.organization.findUniqueOrThrow({ where: { id: vendor.orgId } })).creditBalance;
    const rfq = await createRfq(vendor, rfqInput());
    await closeRfq(vendor, rfq.id, "DECLINED", "No capacity");
    expect((await db.organization.findUniqueOrThrow({ where: { id: vendor.orgId } })).creditBalance).toBe(before);
    await db.organization.update({ where: { id: vendor.orgId }, data: { creditBalance: 1 } });
    await expect(createRfq(vendor, rfqInput())).rejects.toThrow(/Not enough credits/);
  });

  it("records a complete activity timeline for the RFQ", async () => {
    const actions = (await db.auditLog.findMany({ where: { rfqId }, orderBy: { createdAt: "asc" } })).map((a) => a.action);
    for (const a of ["RFQ_CREATED", "RFQ_ACCEPTED", "JOB_CREATED", "ASSIGNMENT_CREATED", "ASSIGNMENT_REJECTED", "ASSIGNMENT_ACCEPTED", "SURVEY_STARTED", "SURVEY_SUBMITTED", "REPORT_GENERATED", "SURVEY_APPROVED", "REPORT_ISSUED", "REPORT_AMENDED", "REPORT_SENT", "INVOICE_CREATED", "PAYMENT_RECORDED"]) {
      expect(actions).toContain(a);
    }
  });
});
