// Shared zod schemas — the same rules run in the browser (inline validation) and on the server.
import { z } from "zod";
import {
  ACTING_ON_BEHALF_OF, ATTACHMENT_KINDS, CURRENCIES, CUSTOMER_TYPES, KYC_DOC_TYPES, PAYMENT_MODES, PRIORITIES,
  REQUEST_SOURCES, SUPPORT_TYPES, SURVEY_AREAS, SURVEYOR_AVAILABILITY, SURVEYOR_KINDS, ASSIGNABLE_ROLES,
} from "./constants";
import { isCountryCode, toE164 } from "./countries";
import { validateContainer } from "./iso6346";

const trimmed = (label: string, max = 200) => z.string().trim().min(1, `${label} is required`).max(max, `${label} is too long`);
const optional = (max = 200) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

export const phoneField = (label = "Mobile number") =>
  z.string().trim().min(1, `${label} is required`).transform((v, ctx) => {
    const e = toE164(v);
    if (!e) {
      ctx.addIssue({ code: "custom", message: `${label} is not a valid phone number (include country code)` });
      return z.NEVER;
    }
    return e;
  });

export const emailField = (label = "Email") => z.string().trim().toLowerCase().min(1, `${label} is required`).email(`${label} is not a valid email`);

export const containerField = z.string().transform((v, ctx) => {
  const r = validateContainer(v);
  if (!r.ok) {
    ctx.addIssue({ code: "custom", message: r.error });
    return z.NEVER;
  }
  return r.value;
});

// One canonical Customer shape — used by the Customers drawer AND the RFQ wizard.
export const customerSchema = z
  .object({
    customerType: z.enum(CUSTOMER_TYPES),
    organizationName: optional(),
    firstName: optional(80),
    middleName: optional(80),
    lastName: optional(80),
    taxId: optional(40),
    licenseNumber: optional(60),
    email: emailField(),
    phone: phoneField(),
    address1: trimmed("Address line 1"),
    address2: optional(),
    country: z.string().refine(isCountryCode, "Choose a country"),
    state: trimmed("State / Province", 80),
    city: trimmed("City", 80),
  })
  .superRefine((v, ctx) => {
    if (v.customerType === "ENTERPRISE" && !v.organizationName)
      ctx.addIssue({ code: "custom", path: ["organizationName"], message: "Organization name is required" });
    if (v.customerType === "INDIVIDUAL" && !v.firstName)
      ctx.addIssue({ code: "custom", path: ["firstName"], message: "First name is required" });
  });
export type CustomerInput = z.infer<typeof customerSchema>;

export const intakeSchema = z.object({
  requestSource: z.enum(REQUEST_SOURCES),
  requestReceivedAt: z.string().min(1, "When was the request received?"),
  contactPerson: optional(120),
  contactDetails: optional(200),
  initialNotes: optional(2000),
});

export const rfqLineSchema = z.object({
  surveyTypeId: z.string().min(1, "Type of survey is required"),
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1").max(10000),
  scope: z.array(z.string()).default([]),
  scopeOther: optional(2000),
}).refine((l) => l.scope.length > 0 || !!l.scopeOther, { message: "Select at least one scope item or describe a custom scope", path: ["scope"] });

export const surveyTypesStepSchema = z.object({
  cargoName: trimmed("Cargo name", 200),
  cargoQuantity: trimmed("Cargo quantity", 100),
  lines: z.array(rfqLineSchema).min(1, "Add at least one survey line"),
});

export const surveyDetailsSchema = z
  .object({
    surveyArea: z.enum(SURVEY_AREAS, { error: "Survey area/spot is required" }),
    areaName: trimmed("Area/spot name"),
    locationName: trimmed("Location of survey", 300),
    lat: z.number().optional().nullable(),
    lng: z.number().optional().nullable(),
    surveyDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date of survey is required"),
    currency: z.enum(CURRENCIES),
    estimatedRate: z.coerce.number({ error: "Estimated rate is required" }).positive("Estimated rate must be more than 0"),
    paymentTerms: trimmed("Payment terms", 4000),
    actingOnBehalfOf: z.enum(ACTING_ON_BEHALF_OF).optional().or(z.literal("").transform(() => undefined)),
    piClub: optional(120),
    jointInspection: z.boolean(),
    jointInspectors: z.array(z.object({ name: trimmed("Name", 120), onBehalfOf: trimmed("On behalf of", 120), role: z.enum(ACTING_ON_BEHALF_OF) })).default([]),
  })
  .superRefine((v, ctx) => {
    if (v.jointInspection && v.jointInspectors.length === 0)
      ctx.addIssue({ code: "custom", path: ["jointInspectors"], message: "Add at least one joint inspection attendee, or choose No" });
  });

export const agentSchema = z.object({
  agentId: optional(40),
  companyName: trimmed("Company name"),
  email: emailField("Company email"),
  phone: phoneField("Company phone number"),
  address: trimmed("Company address", 400),
  contacts: z.array(z.object({ name: trimmed("Contact name", 120), phone: optional(30), email: z.string().trim().email("Contact email is not valid").optional().or(z.literal("")) })).default([]),
});

export const attachmentsStepSchema = z.object({
  attachments: z.array(z.object({ id: z.string(), kind: z.enum(ATTACHMENT_KINDS), fileName: z.string() })).default([]),
});

export const rfqSubmitSchema = z.object({
  customerId: z.string().min(1, "Select or add a customer"),
  intake: intakeSchema,
  survey: surveyTypesStepSchema,
  details: surveyDetailsSchema,
  agent: agentSchema,
  files: attachmentsStepSchema,
});
export type RfqSubmitInput = z.infer<typeof rfqSubmitSchema>;

export const surveyorSchema = z.object({
  kind: z.enum(SURVEYOR_KINDS),
  name: trimmed("Name", 120),
  email: emailField(),
  phone: phoneField(),
  availability: z.enum(SURVEYOR_AVAILABILITY),
  baseLocation: optional(120),
  coverage: optional(500),
  notes: optional(2000),
  capabilities: z.array(z.string()).default([]),
  createLogin: z.boolean().default(false),
});

export const surveyorRateSchema = z.object({
  surveyTypeId: z.string().min(1, "Choose a survey type"),
  location: trimmed("Location", 120),
  amount: z.coerce.number().positive("Rate must be more than 0"),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Effective-from date is required"),
});

export const kycSchema = z.object({
  docType: z.enum(KYC_DOC_TYPES),
  docNumber: trimmed("Document number", 60),
  expiresAt: z.string().optional(),
});

export const userSchema = z.object({
  role: z.enum(ASSIGNABLE_ROLES as unknown as [string, ...string[]]),
  firstName: trimmed("First name", 80),
  middleName: optional(80),
  lastName: optional(80),
  email: emailField(),
  phone: phoneField(),
});

export const ticketSchema = z.object({
  topic: trimmed("Topic", 200),
  priority: z.enum(PRIORITIES),
  supportType: z.enum(SUPPORT_TYPES),
  description: trimmed("Description", 5000),
});

export const paymentSchema = z.object({
  amount: z.coerce.number().positive("Amount must be more than 0"),
  mode: z.enum(PAYMENT_MODES),
  reference: trimmed("Payment reference / UTR", 120),
  paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Payment date is required"),
});

export const invoiceSchema = z.object({
  rfqId: z.string().min(1),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Due date is required"),
  customerGstin: optional(15),
  placeOfSupply: optional(80),
  notes: optional(2000),
  lines: z
    .array(z.object({
      jobOrderId: z.string().optional(),
      description: trimmed("Description", 300),
      sac: z.string().trim().regex(/^\d{4,8}$/, "SAC must be 4–8 digits"),
      quantity: z.coerce.number().positive("Qty must be > 0"),
      unitPrice: z.coerce.number().min(0, "Unit price cannot be negative"),
      taxRate: z.coerce.number().min(0).max(28),
    }))
    .min(1, "Add at least one line"),
});

export type FieldErrors = Record<string, string>;

/** Flatten zod issues into { "path.to.field": "message" } for forms. */
export function flattenErrors(err: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const i of err.issues) {
    const k = i.path.join(".") || "_form";
    if (!out[k]) out[k] = i.message;
  }
  return out;
}
