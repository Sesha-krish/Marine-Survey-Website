// Single source of truth for every enum-like value in the app.
// Schema stores these as strings; zod schemas and UI pickers read from here.

export const ROLES = ["PLATFORM_ADMIN", "VENDOR_ADMIN", "VENDOR_STAFF", "SURVEYOR", "REQUESTER"] as const;
export type Role = (typeof ROLES)[number];
export const ROLE_LABEL: Record<Role, string> = {
  PLATFORM_ADMIN: "Platform Admin",
  VENDOR_ADMIN: "Vendor Admin",
  VENDOR_STAFF: "Vendor Staff",
  SURVEYOR: "Surveyor",
  REQUESTER: "Requester",
};
export const VENDOR_ROLES: Role[] = ["VENDOR_ADMIN", "VENDOR_STAFF"];
// Roles a vendor admin may grant from User Management
export const ASSIGNABLE_ROLES: Role[] = ["VENDOR_ADMIN", "VENDOR_STAFF", "SURVEYOR"];

export const RFQ_STATUSES = ["NEW", "ACCEPTED", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "DECLINED", "CANCELLED"] as const;
export type RfqStatus = (typeof RFQ_STATUSES)[number];

export const JOB_STATUSES = ["NEW", "ASSIGNED", "IN_PROGRESS", "SUBMITTED", "COMPLETED", "CANCELLED"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const ASSIGNMENT_STATUSES = ["NEW", "ACCEPTED", "IN_PROGRESS", "COMPLETED", "REJECTED", "CANCELLED"] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];
export const ACTIVE_ASSIGNMENT_STATUSES: AssignmentStatus[] = ["NEW", "ACCEPTED", "IN_PROGRESS"];

export const SURVEY_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "COMPLETED"] as const;
export type SurveyStatus = (typeof SURVEY_STATUSES)[number];

export const REPORT_STATUSES = ["NOT_GENERATED", "GENERATED", "UNDER_REVIEW", "ISSUED", "AMENDED", "REISSUED"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_STAGES = ["CERTIFICATE", "PRELIMINARY", "COMPLETION", "FORMAL", "SIGNED"] as const;
export type ReportStage = (typeof REPORT_STAGES)[number];
export const REPORT_STAGE_LABEL: Record<ReportStage, string> = {
  CERTIFICATE: "Certificate",
  PRELIMINARY: "Preliminary Report",
  COMPLETION: "Completion Report",
  FORMAL: "Formal Report",
  SIGNED: "Signed Report",
};

export const INVOICE_STATUSES = ["DRAFT", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const TICKET_STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER", "RESOLVED", "CLOSED"] as const;
// Ordered semantically, low → high.
export const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_SLA_HOURS: Record<Priority, number> = { LOW: 72, MEDIUM: 24, HIGH: 8, URGENT: 2 };
export const SUPPORT_TYPES = ["TECHNICAL", "BILLING", "ACCOUNT", "MARKETING", "OTHER"] as const;

export const REQUEST_SOURCES = ["PHONE", "EMAIL", "WHATSAPP", "WEBSITE", "OTHER"] as const;
export const SURVEY_AREAS = ["YARD", "CFS", "TERMINAL", "FACTORY", "VESSEL"] as const;
export const SURVEY_AREA_NAME_LABEL: Record<(typeof SURVEY_AREAS)[number], string> = {
  YARD: "Yard Name",
  CFS: "CFS Name",
  TERMINAL: "Terminal Name",
  FACTORY: "Factory Name",
  VESSEL: "Vessel Name",
};
export const CURRENCIES = ["INR", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];
export const CURRENCY_SYMBOL: Record<Currency, string> = { INR: "₹", USD: "$" };

// "Stevedores" spelled correctly (legacy had "Stevoderes").
export const ACTING_ON_BEHALF_OF = [
  "Agent", "Assured", "Broker", "Buyer", "CFS", "CHA", "Charterers", "FF", "ICD", "Indentor",
  "Insurance Agent", "Insurer", "Intermediary", "Lines", "Loss Assessor", "NVOCC", "Owner", "Port",
  "Re-Insurer", "Receivers", "Seller", "Shipper", "Stevedores", "Surveyor", "Terminal", "Transporter", "Yard",
] as const;

export const SURVEYOR_KINDS = ["IN_HOUSE", "INDEPENDENT"] as const;
export const SURVEYOR_AVAILABILITY = ["AVAILABLE", "BUSY", "ON_LEAVE", "INACTIVE"] as const;
export const KYC_DOC_TYPES = ["PAN", "AADHAAR", "PASSPORT", "LICENSE", "CERTIFICATE", "OTHER"] as const;
export const ATTACHMENT_KINDS = ["APPOINTMENT_LETTER", "BOOKING_CONFIRMATION", "PURCHASE_ORDER", "OTHER"] as const;
export const PAYMENT_MODES = ["BANK_TRANSFER", "UPI", "CASH", "CHEQUE", "CARD"] as const;
export const CUSTOMER_TYPES = ["ENTERPRISE", "INDIVIDUAL"] as const;

export const UPLOAD_LIMITS = {
  document: { maxBytes: 10 * 1024 * 1024, mime: ["application/pdf", "image/jpeg", "image/png", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"], label: "PDF, JPG, PNG, DOC(X), XLS(X) up to 10 MB" },
  photo: { maxBytes: 8 * 1024 * 1024, mime: ["image/jpeg", "image/png", "image/webp"], label: "JPG, PNG, WEBP up to 8 MB" },
  letterhead: { maxBytes: 1024 * 1024, mime: ["image/jpeg", "image/png"], label: "JPG or PNG up to 1 MB, cropped to 3811×780" },
};

/** Human label for any SCREAMING_SNAKE value. */
export function humanize(v: string | null | undefined): string {
  if (!v) return "—";
  return v
    .toLowerCase()
    .split("_")
    .map((w) => (w === "cfs" || w === "ff" || w === "cha" || w === "upi" ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

/** One colour per status, shared by every entity. Pairs meet 4.5:1 contrast in both themes. */
export type Tone = "slate" | "blue" | "teal" | "indigo" | "amber" | "violet" | "green" | "red" | "zinc";
export const STATUS_TONE: Record<string, Tone> = {
  DRAFT: "zinc",
  NEW: "blue",
  NOT_STARTED: "slate",
  NOT_GENERATED: "slate",
  OPEN: "blue",
  ACCEPTED: "teal",
  ASSIGNED: "indigo",
  ACTIVE: "green",
  IN_PROGRESS: "amber",
  SUBMITTED: "violet",
  GENERATED: "violet",
  UNDER_REVIEW: "violet",
  WAITING_ON_CUSTOMER: "violet",
  SENT: "indigo",
  PARTIALLY_PAID: "amber",
  COMPLETED: "green",
  ISSUED: "green",
  REISSUED: "green",
  PAID: "green",
  RESOLVED: "green",
  VERIFIED: "green",
  AVAILABLE: "green",
  AMENDED: "amber",
  BUSY: "amber",
  ON_LEAVE: "slate",
  PENDING: "amber",
  OVERDUE: "red",
  REJECTED: "red",
  DECLINED: "red",
  FAILED: "red",
  UNFIT: "red",
  FIT: "green",
  CANCELLED: "zinc",
  CLOSED: "zinc",
  EXPIRED: "zinc",
  INACTIVE: "zinc",
  LOW: "slate",
  MEDIUM: "blue",
  HIGH: "amber",
  URGENT: "red",
};
