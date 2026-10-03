import { describe, expect, it } from "vitest";
import { checkDigit, formatContainer, makeContainer, normalizeContainer, validateContainer } from "@/lib/iso6346";
import { generateSecret, totpNow, verifyTotp } from "@/lib/totp";
import { COUNTRIES, toE164 } from "@/lib/countries";
import { TEMPLATES } from "@/lib/templates/definitions";
import { validateTemplate } from "@/lib/templates/check";
import { computeValue, validateSurvey } from "@/lib/templates/validate";
import { customerSchema } from "@/lib/schemas";
import { toCsv } from "@/server/list";

describe("ISO 6346 container numbers", () => {
  it("accepts the textbook example CSQU3054383", () => {
    expect(validateContainer("CSQU3054383").ok).toBe(true);
  });
  it("normalises spacing and case so the same container matches itself", () => {
    expect(normalizeContainer(" msmu 497675-9 ")).toBe("MSMU4976759");
    expect(formatContainer("MSKU1234565")).toBe("MSKU 123456 5");
  });
  it("rejects a wrong check digit and malformed numbers", () => {
    expect(validateContainer("CSQU3054384").ok).toBe(false);
    expect(validateContainer("ABCD 1234567").ok).toBe(false); // the old system's test data
    expect(validateContainer("XXXU 000001").ok).toBe(false);
  });
  it("makeContainer always produces a valid number", () => {
    for (const s of ["000000", "123456", "999999"]) expect(validateContainer(makeContainer("TGHU", s)).ok).toBe(true);
    expect(checkDigit("CSQU305438")).toBe(3);
  });
});

describe("TOTP", () => {
  it("verifies the current code and ±1 step only", () => {
    const s = generateSecret();
    const t = Date.UTC(2026, 0, 1, 12, 0, 0);
    expect(verifyTotp(s, totpNow(s, t), t)).toBe(true);
    expect(verifyTotp(s, totpNow(s, t - 30000), t)).toBe(true);
    expect(verifyTotp(s, totpNow(s, t - 120000), t)).toBe(false);
  });
  it("matches RFC 6238 SHA-1 test vector", () => {
    // secret "12345678901234567890" in base32
    expect(totpNow("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59_000)).toBe("287082");
  });
});

describe("countries & phones", () => {
  it("has one entry per country with no duplicates or snake_case", () => {
    const codes = COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(COUNTRIES.every((c) => !c.name.includes("_"))).toBe(true);
    expect(COUNTRIES.find((c) => c.code === "TC")?.name).toMatch(/Turks/);
  });
  it("normalises to E.164", () => {
    expect(toE164("98765 43210")).toBe("+919876543210");
    expect(toE164("123")).toBeNull();
  });
});

describe("survey templates", () => {
  it.each(Object.keys(TEMPLATES))("%s passes the admin structural validator", (code) => {
    expect(validateTemplate(TEMPLATES[code])).toEqual([]);
  });
  it("uses Tare (never Tear) weight and FIT/UNFIT everywhere", () => {
    const json = JSON.stringify(TEMPLATES);
    expect(json).not.toMatch(/Tear Weight/i);
    for (const t of Object.values(TEMPLATES)) expect(t.verdict.options).toEqual(["FIT", "UNFIT"]);
  });
  it("computes payload and enforces cross-field rules", () => {
    const t = TEMPLATES.COC;
    const payload = t.sections.flatMap((s) => s.fields).find((f) => f.id === "payload")!;
    expect(computeValue(payload as never, { grossWeight: 30000, tareWeight: 3800 })).toBe(26200);
    const e = validateSurvey(t, { inspectionStart: "13:15", inspectionEnd: "13:00", grossWeight: 100, tareWeight: 200 }, { final: false });
    expect(e.inspectionEnd).toBeDefined();
    expect(e.grossWeight).toBeDefined();
  });
  it("requires photos, signature and an UNFIT reason on final submit", () => {
    const e = validateSurvey(TEMPLATES.COC, {}, { final: true, photoSlots: new Set(), signatures: new Set(), verdict: "UNFIT", verdictReason: "" });
    expect(e["photo:front_side"]).toBeDefined();
    expect(e["sig:surveyor"]).toBeDefined();
    expect(e.__verdictReason).toBeDefined();
  });
  it("rejects future inspection dates", () => {
    const e = validateSurvey(TEMPLATES.COC, { inspectionDate: "2999-01-01" }, { final: false });
    expect(e.inspectionDate).toMatch(/future/);
  });
});

describe("customer schema", () => {
  const base = { email: "a@b.co", phone: "9876543210", address1: "x", country: "IN", state: "Tamil Nadu", city: "Chennai" };
  it("requires organization name for enterprises", () => {
    expect(customerSchema.safeParse({ ...base, customerType: "ENTERPRISE" }).success).toBe(false);
    expect(customerSchema.safeParse({ ...base, customerType: "ENTERPRISE", organizationName: "Acme" }).success).toBe(true);
  });
  it("rejects unknown country codes", () => {
    expect(customerSchema.safeParse({ ...base, customerType: "INDIVIDUAL", firstName: "A", country: "XX" }).success).toBe(false);
  });
});

describe("CSV export", () => {
  it("quotes and neutralises spreadsheet formulas", () => {
    const csv = toCsv(["a", "b"], [["=HYPERLINK(1)", 'x,"y"']]);
    expect(csv).toContain(`'=HYPERLINK(1)`);
    expect(csv).toContain(`"x,""y"""`);
  });
});
