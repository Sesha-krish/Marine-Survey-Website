// Survey templates are DATA. One versioned schema per survey type drives:
// the capture form, validation, the generated report, and the JSON API.

export type FieldBase = { id: string; label: string; required?: boolean; help?: string; width?: "full" | "half" | "third" };

export type Field =
  | (FieldBase & { type: "text" | "textarea" })
  | (FieldBase & { type: "number"; unit?: string; min?: number; max?: number })
  | (FieldBase & { type: "date"; notFuture?: boolean })
  | (FieldBase & { type: "time" })
  | (FieldBase & { type: "select" | "radio"; options: string[] })
  | (FieldBase & { type: "boolean" })
  | (FieldBase & { type: "container" }) // ISO 6346 validated
  | (FieldBase & { type: "computed"; op: "sub" | "add"; a: string; b: string; unit?: string; checkAgainst?: string })
  | (FieldBase & { type: "list" }) // numbered free-text list
  | (FieldBase & { type: "table"; columns: { id: string; label: string; type?: "text" | "number" }[]; minRows?: number });

export type Section = { id: string; title: string; description?: string; fields: Field[] };

export type PhotoSlot = { id: string; label: string; required: boolean };

export type SignatureSlot = { id: string; label: string; required: boolean };

/** Cross-field rules evaluated on submit. */
export type Rule =
  | { kind: "timeOrder"; date: string; start: string; end: string; message: string }
  | { kind: "gt"; a: string; b: string; message: string };

export type TemplateSchema = {
  code: string;
  name: string;
  version: number;
  certificateText: string; // {requester} {area} {date} {container} {place} placeholders
  verdict: { required: boolean; options: ["FIT", "UNFIT"]; reasonRequiredFor: "UNFIT" };
  sections: Section[];
  photoSlots: PhotoSlot[];
  additionalPhotos: boolean;
  signatures: SignatureSlot[];
  rules: Rule[];
};

export type Answers = Record<string, unknown>;
