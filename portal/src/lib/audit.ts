import type { Tx } from "./db";
import type { SessionUser } from "./auth";

export type AuditInput = {
  entityType: string;
  entityId: string;
  action: string;
  rfqId?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  note?: string | null;
  data?: unknown;
};

/** Append-only audit trail. Every state change in the app goes through here. */
export async function audit(tx: Tx, actor: Pick<SessionUser, "id" | "orgId" | "name"> | null, e: AuditInput) {
  await tx.auditLog.create({
    data: {
      orgId: actor?.orgId ?? null,
      actorId: actor?.id ?? null,
      actorName: actor?.name ?? "System",
      entityType: e.entityType,
      entityId: e.entityId,
      rfqId: e.rfqId ?? null,
      action: e.action,
      fromStatus: e.fromStatus ?? null,
      toStatus: e.toStatus ?? null,
      note: e.note ?? null,
      data: e.data === undefined ? null : JSON.stringify(e.data),
    },
  });
}

/** Human-readable sentence for an audit action code. */
export const AUDIT_LABEL: Record<string, string> = {
  CUSTOMER_CREATED: "Customer created",
  CUSTOMER_UPDATED: "Customer updated",
  CUSTOMER_DEACTIVATED: "Customer deactivated",
  RFQ_CREATED: "RFQ submitted & ID generated",
  RFQ_ACCEPTED: "RFQ accepted — job orders created",
  RFQ_DECLINED: "RFQ declined",
  RFQ_CANCELLED: "RFQ cancelled",
  RFQ_STATUS: "RFQ status changed",
  RFQ_ATTACHMENT_ADDED: "Attachment added",
  JOB_CREATED: "Job order created",
  JOB_UPDATED: "Job order updated",
  JOB_STATUS: "Job order status changed",
  JOB_CANCELLED: "Job order cancelled",
  BULK_VERDICT: "Bulk survey verdicts saved",
  ASSIGNMENT_CREATED: "Surveyor assigned",
  ASSIGNMENT_ACCEPTED: "Surveyor accepted assignment",
  ASSIGNMENT_REJECTED: "Surveyor rejected assignment",
  ASSIGNMENT_CANCELLED: "Assignment cancelled",
  SURVEY_STARTED: "Survey started",
  SURVEY_SAVED: "Survey progress saved",
  SURVEY_SUBMITTED: "Survey completed & submitted",
  SURVEY_APPROVED: "Survey approved by vendor",
  SURVEY_RETURNED: "Survey returned to surveyor",
  REPORT_GENERATED: "Report generated",
  REPORT_REVIEW: "Report sent for review",
  REPORT_ISSUED: "Report issued",
  REPORT_AMENDED: "Report amended (new version)",
  REPORT_SENT: "Report sent to requester",
  INVOICE_CREATED: "Invoice created",
  INVOICE_SENT: "Invoice sent",
  PAYMENT_RECORDED: "Payment recorded",
  INVOICE_CANCELLED: "Invoice cancelled",
  CREDITS_PURCHASED: "Credits purchased",
  CREDITS_CHARGED: "Credits charged",
  CREDITS_REFUNDED: "Credits refunded",
  USER_CREATED: "User created",
  USER_UPDATED: "User updated",
  USER_DEACTIVATED: "User deactivated",
  SURVEYOR_CREATED: "Surveyor added",
  SURVEYOR_UPDATED: "Surveyor updated",
  TICKET_CREATED: "Support ticket raised",
  TICKET_REPLY: "Ticket reply",
  TICKET_STATUS: "Ticket status changed",
  LETTERHEAD_UPLOADED: "Letterhead uploaded",
  LETTERHEAD_ACTIVATED: "Letterhead activated",
  LOGIN: "Signed in",
  TEMPLATE_PUBLISHED: "Survey template published",
  TAXONOMY_UPDATED: "Taxonomy updated",
};
