import type { Field, PhotoSlot, Rule, Section, TemplateSchema } from "./types";

// ── Canonical field dictionary — every template reuses these exact ids & labels.
// (Tare Weight, never "Tear"; one FIT/UNFIT verdict vocabulary for every type.)

const place: Field = { id: "placeOfInspection", label: "Place of Inspection", type: "text", required: true, width: "half" };
const date: Field = { id: "inspectionDate", label: "Date of Inspection", type: "date", required: true, notFuture: true, width: "third" };
const start: Field = { id: "inspectionStart", label: "Inspection Start Time", type: "time", required: true, width: "third" };
const end: Field = { id: "inspectionEnd", label: "Inspection End Time", type: "time", required: true, width: "third" };
const containerNo: Field = { id: "containerNo", label: "Container No", type: "container", required: true, width: "half" };
const containerSize: Field = { id: "containerSize", label: "Container Size", type: "select", options: ["20'", "40'", "40' HC", "45'"], required: true, width: "third" };
const containerType: Field = { id: "containerType", label: "Container Type", type: "select", options: ["Dry Van", "Reefer", "Open Top", "Flat Rack", "Tank", "Platform", "Ventilated"], required: true, width: "third" };
const dom: Field = { id: "dateOfManufacture", label: "Date of Manufacture (MM/YYYY)", type: "text", required: true, width: "third" };
const csc: Field = { id: "cscNo", label: "CSC No", type: "text", required: true, width: "third" };
const trailer: Field = { id: "trailerNo", label: "Trailer No", type: "text", width: "third" };
const customsSeal: Field = { id: "customsSealNo", label: "Customs Seal No", type: "text", width: "third" };
const linerSeal: Field = { id: "linerSealNo", label: "Liner Seal No", type: "text", width: "third" };
const ship: Field = { id: "shipName", label: "Ship Name", type: "text", width: "half" };
const voyage: Field = { id: "voyageNo", label: "Voyage No", type: "text", width: "half" };
const gross: Field = { id: "grossWeight", label: "Gross Weight", type: "number", unit: "kg", min: 0, required: true, width: "third" };
const tare: Field = { id: "tareWeight", label: "Tare Weight", type: "number", unit: "kg", min: 0, required: true, width: "third" };
const payload: Field = { id: "payload", label: "Payload (Gross − Tare)", type: "computed", op: "sub", a: "grossWeight", b: "tareWeight", unit: "kg", width: "third" };
const comments: Field = { id: "surveyorComments", label: "Surveyor Comments", type: "list", required: true };
const remarks: Field = { id: "remarks", label: "Remarks (booking ref etc.)", type: "textarea" };

const identification = (extra: Field[] = []): Section => ({
  id: "identification",
  title: "Identification",
  fields: [place, date, start, end, containerNo, containerSize, containerType, dom, csc, trailer, customsSeal, linerSeal, ship, voyage, ...extra],
});
const weights: Section = { id: "weights", title: "Weights", fields: [gross, tare, payload] };
const gate: Section = {
  id: "gate",
  title: "Gate Movement",
  fields: [
    { id: "gateMovement", label: "Gate Movement", type: "radio", options: ["Gate In", "Gate Out"], required: true, width: "half" },
    { id: "gateCategory", label: "Category", type: "radio", options: ["IMP", "EXP", "EMPTY"], required: true, width: "half" },
  ],
};
const notes: Section = { id: "notes", title: "Comments & Remarks", fields: [comments, remarks] };

const timeRule: Rule = { kind: "timeOrder", date: "inspectionDate", start: "inspectionStart", end: "inspectionEnd", message: "Inspection end time must be after the start time" };
const weightRule: Rule = { kind: "gt", a: "grossWeight", b: "tareWeight", message: "Gross weight must be greater than tare weight" };

const panel = (id: string, label: string): Field => ({
  id, label, type: "radio", options: ["Good", "Fair", "Damaged", "Not Inspected"], required: true, width: "half",
});

const slots = (labels: string[], required = true): PhotoSlot[] =>
  labels.map((label) => ({ id: label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""), label, required }));

const VERDICT = { required: true, options: ["FIT", "UNFIT"] as ["FIT", "UNFIT"], reasonRequiredFor: "UNFIT" as const };
const SURVEYOR_SIG = { id: "surveyor", label: "Surveyor Sign & Stamp", required: true };

const CERT =
  "This is to certify that at the request of {requester}, we attended at {area} on {date} and carried out the inspection of container {container} at {place}. Our findings are recorded below.";

// ───────────── Condition of Container v1 (exact field list from the spec) ─────────────
export const COC_V1: TemplateSchema = {
  code: "COC",
  name: "Condition of Container",
  version: 1,
  certificateText: CERT,
  verdict: VERDICT,
  sections: [
    identification(),
    weights,
    gate,
    {
      id: "condition",
      title: "Condition Checklist",
      fields: [
        panel("rearEnd", "Rear End"),
        panel("rightSide", "Right Side"),
        panel("frontSide", "Front Side"),
        panel("leftSide", "Left Side"),
        panel("topSide", "Top Side"),
        panel("underStructure", "Under Structure"),
        panel("interior", "Interior"),
        { id: "dentsCutsHoles", label: "Dents / Cuts / Holes", type: "radio", options: ["Without", "Minor", "Heavy"], required: true, width: "half" },
        { id: "wearAndTear", label: "Wear and Tear", type: "radio", options: ["Normal", "Heavy"], required: true, width: "half" },
        { id: "doorGaskets", label: "Door Gaskets", type: "radio", options: ["Intact", "Damaged"], required: true, width: "half" },
        { id: "floorboard", label: "Floorboard", type: "radio", options: ["Dry and Clean", "Wet", "Oily", "Damaged"], required: true, width: "half" },
        { id: "odor", label: "Odour", type: "radio", options: ["Free Off", "Present"], required: true, width: "half" },
      ],
    },
    notes,
  ],
  photoSlots: slots(["Front Side", "Rear Side", "Left Side", "Right Side", "Top Side", "Interior", "Floorboard", "Door Gaskets", "Panel Image", "CSC Plate", "Container Number", "Date of Manufacture"]),
  additionalPhotos: true,
  signatures: [SURVEYOR_SIG],
  rules: [timeRule, weightRule],
};

// ───────────── Tally Stuffing / Unstuffing ─────────────
const cargoTable: Field = {
  id: "cargoLines",
  label: "Cargo Tally",
  type: "table",
  minRows: 1,
  required: true,
  columns: [
    { id: "description", label: "Cargo / Grade" },
    { id: "packing", label: "Packing" },
    { id: "quantity", label: "Qty", type: "number" },
    { id: "grossWeight", label: "Gross Wt (kg)", type: "number" },
    { id: "netWeight", label: "Net Wt (kg)", type: "number" },
    { id: "cbm", label: "CBM", type: "number" },
    { id: "dimensions", label: "Dimensions" },
    { id: "shipper", label: "Shipper" },
  ],
};
const docTable: Field = {
  id: "documentLines",
  label: "Shipping Documents",
  type: "table",
  columns: [
    { id: "consignee", label: "Consignee" },
    { id: "invoiceNo", label: "Invoice No" },
    { id: "shippingBillNo", label: "Shipping Bill No" },
  ],
};
const tally = (code: string, name: string, phase: "stuffing" | "unstuffing"): TemplateSchema => ({
  code,
  name,
  version: 1,
  certificateText: CERT,
  verdict: VERDICT,
  sections: [
    identification(),
    weights,
    {
      id: "prior",
      title: phase === "stuffing" ? "Container Condition Prior to Stuffing" : "Container Condition After Unstuffing",
      fields: [
        panel("interior", "Interior"),
        { id: "doorGaskets", label: "Door Gaskets", type: "radio", options: ["Intact", "Damaged"], required: true, width: "half" },
        { id: "floorboard", label: "Floorboard", type: "radio", options: ["Dry and Clean", "Wet", "Oily", "Damaged"], required: true, width: "half" },
        { id: "odor", label: "Odour", type: "radio", options: ["Free Off", "Present"], required: true, width: "half" },
      ],
    },
    { id: "tally", title: phase === "stuffing" ? "Tally During Loading" : "Tally During Unloading", fields: [cargoTable, docTable] },
    notes,
  ],
  photoSlots: slots([
    "Container Number", "CSC Plate", "Front Side", "Rear Side", "Left Side", "Right Side", "Interior (Empty)", "Floorboard",
    "Door Gaskets", "Panel Image", "Cargo Before Operation", "Cargo During Operation", "Another View of Cargo", "Cargo Packing Marks",
    "Lashing and Securing", "Door Closed", "Seal Affixed", "Seal Close-up", "Ship Along Side",
  ]).map((s, i) => ({ ...s, required: i < 12 })),
  additionalPhotos: true,
  signatures: [SURVEYOR_SIG, { id: "cha", label: "CHA Signature", required: false }, { id: "customs", label: "Customs Officer Signature", required: false }],
  rules: [timeRule, weightRule],
});

// ───────────── Flat Rack family (Flat Bed, Flat Rack Loading, Open Top) ─────────────
const flatRack = (code: string, name: string): TemplateSchema => ({
  code,
  name,
  version: 1,
  certificateText: CERT,
  verdict: VERDICT,
  sections: [
    identification([
      { id: "acepNo", label: "ACEP No", type: "text", width: "third" },
      { id: "portOfLoading", label: "Port of Loading", type: "text", required: true, width: "third" },
      { id: "portOfDischarge", label: "Port of Discharge", type: "text", required: true, width: "third" },
    ]),
    weights,
    {
      id: "cargo",
      title: "Cargo",
      fields: [
        { id: "cargoDescription", label: "Cargo Description", type: "textarea", required: true },
        { id: "cargoDimensions", label: "Cargo Dimensions (L×W×H, cm)", type: "text", required: true, width: "half" },
        { id: "cargoWeight", label: "Cargo Weight", type: "number", unit: "kg", required: true, width: "half" },
        { id: "cargoCondition", label: "Cargo Condition", type: "radio", options: ["Good", "Fair", "Damaged"], required: true, width: "half" },
        panel("platformCondition", `${name} Condition`),
      ],
    },
    {
      id: "securing",
      title: "Securing",
      fields: [
        { id: "stuffingPlan", label: "Recommended Stuffing Plan", type: "textarea" },
        { id: "securingRecommendation", label: "Securing Recommendation", type: "textarea", required: true },
        { id: "securingArrangements", label: "Securing Arrangements Made", type: "textarea", required: true },
        {
          id: "lashingMaterials",
          label: "Lashing / Chocking Materials",
          type: "table",
          columns: [
            { id: "item", label: "Item" },
            { id: "spec", label: "Specification / SWL" },
            { id: "quantity", label: "Qty", type: "number" },
          ],
        },
        { id: "securingAdequate", label: "Securing adequate for sea transport", type: "radio", options: ["Yes", "No"], required: true, width: "half" },
      ],
    },
    notes,
  ],
  photoSlots: slots(["Container Number", "CSC Plate", "Front Side", "Rear Side", "Left Side", "Right Side", "Cargo Before Loading", "Cargo Loaded", "Lashing Detail", "Chocking Detail"]),
  additionalPhotos: true,
  signatures: [SURVEYOR_SIG],
  rules: [timeRule, weightRule],
});

// ───────────── PDI (Pre Delivery / Pre Dispatch) ─────────────
const pdi = (code: string, name: string, phase: "discharge" | "loading"): TemplateSchema => ({
  code,
  name,
  version: 1,
  certificateText:
    "This is to certify that at the request of {requester}, we attended at {area} on {date} and carried out the " +
    (phase === "discharge" ? "pre-delivery (discharge)" : "pre-dispatch (loading)") + " inspection at {place}. Our findings are recorded below.",
  verdict: VERDICT,
  sections: [
    {
      id: "identification",
      title: "Identification",
      fields: [place, date, start, end, ship, voyage, { id: "cargoDescription", label: "Cargo Description", type: "textarea", required: true }],
    },
    {
      id: "trucks",
      title: "Trucks / Transport Equipment",
      fields: [
        {
          id: "trucks",
          label: "Trucks",
          type: "table",
          minRows: 1,
          required: true,
          columns: [
            { id: "truckNo", label: "Truck No" },
            { id: "driver", label: "Driver" },
            { id: "licenceNo", label: "Licence No" },
            { id: "cargo", label: "Cargo" },
            { id: "condition", label: "Condition" },
          ],
        },
        { id: "statutoryCompliance", label: "Transport equipment statutory compliance", type: "radio", options: ["Compliant", "Non-compliant"], required: true, width: "half" },
      ],
    },
    {
      id: "operation",
      title: phase === "discharge" ? "Discharge Operation" : "Loading Operation",
      fields: [
        { id: "cargoCondition", label: phase === "discharge" ? "Cargo condition prior to unloading" : "Cargo condition prior to loading", type: "radio", options: ["Good", "Fair", "Damaged"], required: true, width: "half" },
        { id: "liftingSuitable", label: "Lifting arrangements & equipment suitable", type: "radio", options: ["Yes", "No"], required: true, width: "half" },
        { id: "planFollowed", label: phase === "discharge" ? "Discharge as per discharge plan" : "Loading as per agreed plan", type: "radio", options: ["Yes", "No"], required: true, width: "half" },
        ...(phase === "loading"
          ? ([
              { id: "lashingAdequate", label: "Lashing plan & equipment adequate", type: "radio", options: ["Yes", "No"], required: true, width: "half" },
              { id: "driversBriefed", label: "Transport contractor & drivers briefed on Transport Plan", type: "radio", options: ["Yes", "No"], required: true, width: "half" },
            ] as Field[])
          : []),
      ],
    },
    notes,
  ],
  photoSlots: slots(["Cargo Overview", "Cargo Marks", "Lifting Arrangement", "Truck Front", "Truck Number Plate", "Cargo Secured on Truck"]),
  additionalPhotos: true,
  signatures: [SURVEYOR_SIG],
  rules: [timeRule],
});

// ───────────── Draft Survey (Ship Board → Cargo Survey) — the previously-dead branch ─────────────
const draftReadings = (prefix: string, title: string): Section => ({
  id: prefix,
  title,
  fields: [
    { id: `${prefix}ForePort`, label: "Fore (Port)", type: "number", unit: "m", required: true, width: "third" },
    { id: `${prefix}ForeStbd`, label: "Fore (Stbd)", type: "number", unit: "m", required: true, width: "third" },
    { id: `${prefix}MidPort`, label: "Mid (Port)", type: "number", unit: "m", required: true, width: "third" },
    { id: `${prefix}MidStbd`, label: "Mid (Stbd)", type: "number", unit: "m", required: true, width: "third" },
    { id: `${prefix}AftPort`, label: "Aft (Port)", type: "number", unit: "m", required: true, width: "third" },
    { id: `${prefix}AftStbd`, label: "Aft (Stbd)", type: "number", unit: "m", required: true, width: "third" },
    { id: `${prefix}Density`, label: "Dock Water Density", type: "number", unit: "t/m³", required: true, width: "third" },
    { id: `${prefix}Displacement`, label: "Corrected Displacement", type: "number", unit: "t", required: true, width: "third" },
    { id: `${prefix}Deductibles`, label: "Deductibles (ballast, FW, bunkers)", type: "number", unit: "t", required: true, width: "third" },
  ],
});
export const DRAFT_V1: TemplateSchema = {
  code: "DRS",
  name: "Draft Survey",
  version: 1,
  certificateText: "This is to certify that at the request of {requester}, we attended on board {area} on {date} at {place} and carried out initial and final draft surveys. Our findings are recorded below.",
  verdict: { ...VERDICT, required: false },
  sections: [
    {
      id: "identification",
      title: "Vessel",
      fields: [
        place, date, start, end, ship, voyage,
        { id: "imoNo", label: "IMO No", type: "text", required: true, width: "third" },
        { id: "berth", label: "Berth", type: "text", width: "third" },
        { id: "operation", label: "Operation", type: "radio", options: ["Loading", "Discharging"], required: true, width: "third" },
        { id: "cargoDescription", label: "Cargo", type: "text", required: true, width: "half" },
        { id: "blQuantity", label: "B/L Quantity", type: "number", unit: "t", width: "half" },
      ],
    },
    draftReadings("initial", "Initial Draft Survey"),
    draftReadings("final", "Final Draft Survey"),
    {
      id: "result",
      title: "Result",
      fields: [
        { id: "netInitial", label: "Net Displacement (Initial)", type: "computed", op: "sub", a: "initialDisplacement", b: "initialDeductibles", unit: "t", width: "third" },
        { id: "netFinal", label: "Net Displacement (Final)", type: "computed", op: "sub", a: "finalDisplacement", b: "finalDeductibles", unit: "t", width: "third" },
        { id: "cargoByDraft", label: "Cargo Quantity by Draft", type: "number", unit: "t", required: true, width: "third", help: "|Net Final − Net Initial|" },
      ],
    },
    notes,
  ],
  photoSlots: slots(["Fore Draft Marks", "Mid Draft Marks (Port)", "Mid Draft Marks (Stbd)", "Aft Draft Marks", "Hydrometer Reading"]),
  additionalPhotos: true,
  signatures: [SURVEYOR_SIG, { id: "master", label: "Master / Chief Officer", required: false }],
  rules: [timeRule],
};

// ───────────── Generic (Warehouse / Weighbridge tally) ─────────────
const generic = (code: string, name: string): TemplateSchema => ({
  code,
  name,
  version: 1,
  certificateText: "This is to certify that at the request of {requester}, we attended at {area} on {date} and carried out the " + name.toLowerCase() + " at {place}. Our findings are recorded below.",
  verdict: { ...VERDICT, required: false },
  sections: [
    { id: "identification", title: "Identification", fields: [place, date, start, end, { id: "cargoDescription", label: "Cargo Description", type: "textarea", required: true }] },
    { id: "tally", title: "Tally", fields: [{ ...cargoTable, columns: cargoTable.columns.slice(0, 5) }] },
    notes,
  ],
  photoSlots: slots(["Overview", "Cargo", "Weighing / Count Evidence"]),
  additionalPhotos: true,
  signatures: [SURVEYOR_SIG],
  rules: [timeRule],
});

export const TEMPLATES: Record<string, TemplateSchema> = {
  COC: COC_V1,
  TS: tally("TS", "Tally Stuffing", "stuffing"),
  TU: tally("TU", "Tally Unstuffing", "unstuffing"),
  FB: flatRack("FB", "Flat Bed"),
  FRL: flatRack("FRL", "Flat Rack Loading"),
  OT: flatRack("OT", "Open Top"),
  PDL: pdi("PDL", "Pre Delivery", "discharge"),
  PDS: pdi("PDS", "Pre Dispatch", "loading"),
  DRS: DRAFT_V1,
  WHT: generic("WHT", "Warehouse Tally"),
  WBT: generic("WBT", "Weighbridge Tally"),
};
