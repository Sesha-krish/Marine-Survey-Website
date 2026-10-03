// Structural validation for template JSON published from the admin builder.
const FIELD_TYPES = ["text", "textarea", "number", "date", "time", "select", "radio", "boolean", "container", "computed", "list", "table"];

export function validateTemplate(t: unknown): string[] {
  const p: string[] = [];
  if (!t || typeof t !== "object") return ["Template must be a JSON object"];
  const o = t as Record<string, unknown>;
  if (typeof o.name !== "string" || !o.name) p.push("name is required");
  if (typeof o.certificateText !== "string") p.push("certificateText is required");
  const v = o.verdict as Record<string, unknown> | undefined;
  if (!v || typeof v.required !== "boolean") p.push("verdict.required must be true/false");
  if (v && JSON.stringify(v.options) !== JSON.stringify(["FIT", "UNFIT"])) p.push('verdict.options must be ["FIT","UNFIT"] (one vocabulary for every template)');
  if (!Array.isArray(o.sections) || !o.sections.length) p.push("at least one section is required");
  const ids = new Set<string>();
  for (const [si, s] of ((o.sections as Record<string, unknown>[]) ?? []).entries()) {
    if (typeof s.id !== "string" || typeof s.title !== "string") p.push(`section ${si + 1}: id and title are required`);
    if (!Array.isArray(s.fields) || !s.fields.length) p.push(`section ${s.title ?? si + 1}: needs at least one field`);
    for (const f of (s.fields as Record<string, unknown>[]) ?? []) {
      if (typeof f.id !== "string" || !/^[a-zA-Z][a-zA-Z0-9]*$/.test(f.id)) p.push(`field id "${String(f.id)}" must be camelCase letters/digits`);
      else if (ids.has(f.id)) p.push(`duplicate field id "${f.id}"`);
      else ids.add(f.id);
      if (!FIELD_TYPES.includes(String(f.type))) p.push(`field ${String(f.id)}: unknown type "${String(f.type)}"`);
      if ((f.type === "select" || f.type === "radio") && (!Array.isArray(f.options) || !f.options.length)) p.push(`field ${String(f.id)}: options required`);
      if (f.type === "table" && (!Array.isArray(f.columns) || !f.columns.length)) p.push(`field ${String(f.id)}: columns required`);
      if (typeof f.label !== "string" || !f.label) p.push(`field ${String(f.id)}: label required`);
      if (/tear\s*weight/i.test(String(f.label))) p.push(`field ${String(f.id)}: use "Tare Weight" (canonical dictionary)`);
    }
  }
  for (const f of ((o.sections as { fields: Record<string, unknown>[] }[]) ?? []).flatMap((s) => s.fields ?? [])) {
    if (f.type === "computed" && (!ids.has(String(f.a)) || !ids.has(String(f.b)))) p.push(`computed field ${String(f.id)} references unknown fields`);
  }
  if (!Array.isArray(o.photoSlots)) p.push("photoSlots must be an array");
  if (!Array.isArray(o.signatures)) p.push("signatures must be an array");
  if (!Array.isArray(o.rules)) p.push("rules must be an array (can be empty)");
  return p;
}
