/* eslint-disable no-console */
// Seeds realistic, clearly-labelled DEMO data by driving the real workflow services,
// so every record carries a genuine audit trail, assignment history and report versions.
// Run:  npm run db:reset   (needs --conditions=react-server so "server-only" imports resolve)

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import bcrypt from "bcryptjs";
import { db } from "../src/lib/db";
import { TEMPLATES } from "../src/lib/templates/definitions";
import type { Answers, Field, TemplateSchema } from "../src/lib/templates/types";
import { makeContainer } from "../src/lib/iso6346";
import { computeValue } from "../src/lib/templates/validate";
import {
  acceptRfq, assignSurveyors, closeRfq, createRfq, respondToAssignment, reviewSurvey, saveSurveyProgress, startSurvey, submitSurvey, type Actor,
} from "../src/server/workflow";
import { issueReport, sendReport } from "../src/server/reports";
import { createInvoice, markInvoiceSent, purchasePackage, recordPayment } from "../src/server/billing";

const PASSWORD = "Demo@1234";
const DAY = 86400_000;
let rngState = 42;
const rand = () => ((rngState = (rngState * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
const pick = <T,>(a: readonly T[]) => a[Math.floor(rand() * a.length)];
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);

// ───────────────────────── tiny PNG writer for demo photos/signatures ─────────────────────────
function crc32(buf: Buffer) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w: number, h: number, pixel: (x: number, y: number) => [number, number, number]) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const [r, g, b] = pixel(x, y);
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
// A "container side" placeholder: coloured corrugated panel with a darker frame.
function demoPhoto(seed: number) {
  const palette: [number, number, number][] = [[176, 58, 46], [31, 97, 141], [40, 116, 166], [17, 120, 100], [183, 149, 11], [93, 109, 126]];
  const base = palette[seed % palette.length];
  return png(160, 110, (x, y) => {
    if (x < 6 || y < 6 || x > 153 || y > 103) return [40, 40, 40];
    const shade = Math.floor(x / 8) % 2 ? 0.85 : 1;
    return [base[0] * shade, base[1] * shade, base[2] * shade].map(Math.round) as [number, number, number];
  });
}
function demoSignature() {
  return png(240, 80, (x, y) => {
    const curve = 40 + Math.sin(x / 14) * 18 + Math.cos(x / 5) * 4;
    return Math.abs(y - curve) < 2 && x > 20 && x < 220 ? [16, 37, 69] : [255, 255, 255];
  });
}
// Letterhead 3811x780 is large; ship a 1906x390 (same ratio) demo banner.
function demoLetterhead() {
  return png(953, 195, (x, y) => {
    if (y > 180) return [42, 157, 143];
    if (x < 190) return [11, 37, 69];
    return [255, 255, 255];
  });
}

const storageRoot = path.resolve(process.env.STORAGE_DIR ?? "./storage");
async function storeFile(orgId: string, userId: string, buf: Buffer, fileName: string, mimeType: string, kind: string, rfqId?: string) {
  const key = `${orgId}/${randomUUID()}`;
  mkdirSync(path.join(storageRoot, orgId), { recursive: true });
  writeFileSync(path.join(storageRoot, key), buf);
  return db.attachment.create({ data: { orgId, rfqId, kind, fileName, mimeType, size: buf.length, storageKey: key, uploadedById: userId } });
}
// Minimal valid one-page PDF for demo appointment letters.
function demoPdf(title: string) {
  const text = `BT /F1 18 Tf 72 720 Td (${title.replace(/[()\\]/g, "")}) Tj ET BT /F1 11 Tf 72 690 Td (DEMO DOCUMENT - generated sample) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offs: number[] = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out);
}

// ───────────────────────── taxonomy (from the spec, incl. the previously-dead Ship Board branch) ─────────────────────────
const SCOPES: Record<string, string[]> = {
  COC: ["Inspection of empty container prior to stuffing", "Inspection of empty container after un-stuffing"],
  TS: ["Inspection of container condition prior to stuffing", "Tally of cargo during loading", "Provide formal report on the tally operation"],
  TU: ["Inspection of container condition after unloading", "Tally of cargo during unloading", "Provide formal report on the tally operation"],
  FB: flatScopes("Flat Bed"),
  FRL: flatScopes("Flat Rack"),
  OT: flatScopes("Open Top"),
  PDL: ["Condition of cargo prior to unloading", "Lifting arrangements and equipment suitability", "Discharge operation as per discharge plan"],
  PDS: [
    "Condition of cargo prior to loading", "Transport equipment and statutory compliance", "Lifting arrangements",
    "Lashing plan and lashing equipment adequacy", "Loading operation as per agreed plan", "Transport contractor & drivers briefed on Transport Plan and passage",
  ],
  DRS: ["Initial draft survey before loading/discharge", "Final draft survey after loading/discharge", "Determine cargo quantity by draft displacement", "Provide formal draft survey report"],
  WHT: ["Tally of cargo received into warehouse", "Tally of cargo delivered from warehouse", "Report discrepancies and damages"],
  WBT: ["Attend weighment at weighbridge", "Record gross / tare / net weights per vehicle", "Report weight discrepancies"],
};
function flatScopes(n: string) {
  return [
    `Verify the ${n} and record its condition`, "Verify cargo condition", "Recommend stuffing plan", "Recommend lashing plan",
    "Verify lashing / chocking plan for sea transport", "Attend during stuffing", "Attend during lashing and chocking",
    "Check adequacy of securing", "Provide formal report on completion",
  ];
}

const TAXONOMY = [
  { name: "Shore Based Survey", subs: [
    { name: "Container", qty: "Quantity", types: [["COC", "Condition of Container"], ["TS", "Tally Stuffing"], ["TU", "Tally Unstuffing"]] },
    { name: "Flat Rack", qty: "Quantity", types: [["FB", "Flat Bed"], ["FRL", "Flat Rack Loading"], ["OT", "Open Top"]] },
    { name: "PDI - Inspection", qty: "Truck Quantity", types: [["PDL", "Pre Delivery (Discharge)"], ["PDS", "Pre Dispatch (Loading)"]] },
    { name: "Warehouse & Weighbridge", qty: "Quantity", types: [["WHT", "Warehouse Tally"], ["WBT", "Weighbridge Tally"]] },
  ] },
  { name: "Ship Board Survey", subs: [{ name: "Cargo Survey", qty: "Quantity", types: [["DRS", "Draft Survey"]] }] },
];

// ───────────────────────── survey answer generator ─────────────────────────
const TEXT: Record<string, string[]> = {
  placeOfInspection: ["Chennai Container Terminal", "CITPL Yard, Chennai Port", "Sattva CFS, Ponneri", "ICD Irungattukottai", "Kattupalli Port Yard"],
  dateOfManufacture: ["03/2016", "11/2018", "07/2019", "02/2021", "09/2015"],
  cscNo: ["CSC/GB-LR/2316/14", "CSC/FR-BV/0421/18", "CSC/DE-GL/5512/19"],
  trailerNo: ["TN04AB7731", "TN20CK4410", "TN05BZ9902"],
  customsSealNo: ["CS0098812", "CS0101457", "CS0104420"],
  linerSealNo: ["ML-3348812", "HL-0021134", "EV-8812350"],
  shipName: ["MSC Arina", "Maersk Kensington", "Ever Lunar", "CMA CGM Tage"],
  voyageNo: ["FL542W", "245E", "0128-071W", "OB3MA1"],
  imoNo: ["9839179", "9632179", "9786847"],
  berth: ["CCTL Berth 2", "Bharathi Dock 3"],
  portOfLoading: ["Chennai", "Kattupalli", "Tuticorin"],
  portOfDischarge: ["Jebel Ali", "Colombo", "Singapore", "Rotterdam"],
  acepNo: ["ACEP/GB/LR/2016/0912", "ACEP/DE/GL/2019/1102"],
  cargoDimensions: ["620 × 240 × 260", "540 × 220 × 230", "1180 × 240 × 250"],
  cargoDescription: ["Transformer core assembly on steel skid", "Machined gearbox housings, crated", "Granite slabs, polished, on A-frames", "Steel coils, hot-rolled", "Tractor parts, palletised"],
};
function answerFor(f: Field, ctx: { date: string; container: string | null }, i: number): unknown {
  if (TEXT[f.id]) return pick(TEXT[f.id]);
  switch (f.type) {
    case "date": return ctx.date;
    case "time": return f.id.toLowerCase().includes("end") ? "11:40" : "10:05";
    case "container": return ctx.container ?? makeContainer(pick(["MSKU", "MSCU", "CMAU", "HLXU", "TGHU"]), String(100000 + int(0, 899999)));
    case "number":
      if (f.id === "grossWeight") return int(26000, 30480);
      if (f.id === "tareWeight") return int(2150, 3900);
      if (f.id.endsWith("Density")) return 1.02;
      if (f.id.endsWith("Displacement")) return f.id.startsWith("initial") ? 18450 : 42110;
      if (f.id.endsWith("Deductibles")) return f.id.startsWith("initial") ? 6120 : 1980;
      if (f.id === "cargoByDraft") return 27990;
      if (f.id === "blQuantity") return 28000;
      if (f.id.match(/(Fore|Mid|Aft)/)) return f.id.startsWith("initial") ? 4.1 + i * 0.05 : 9.6 + i * 0.05;
      return int(5, 60);
    case "select": case "radio": return f.options[0];
    case "boolean": return true;
    case "list": return ["Container found in sound condition and suitable for cargo stuffing.", "No visible light leakage observed on the light test.", "All panels inspected from the outside and inside."];
    case "textarea": return f.id === "remarks" ? `Booking ref ${pick(["MAA", "BOM"])}${int(1000000, 9999999)}` : "Inspected in daylight; findings recorded with photographs.";
    case "table":
      return [0, 1].map((r) => Object.fromEntries(f.columns.map((c) => [c.id, c.type === "number" ? int(10, 400) : c.id === "truckNo" ? `TN0${r + 1}AK${int(1000, 9999)}` : `${c.label} ${r + 1}`])));
    case "computed": return undefined;
    default: return pick(["Checked", "OK"]);
  }
}
function fullAnswers(t: TemplateSchema, ctx: { date: string; container: string | null }) {
  const a: Answers = {};
  t.sections.flatMap((s) => s.fields).forEach((f, i) => {
    const v = answerFor(f, ctx, i);
    if (v !== undefined) a[f.id] = v;
  });
  for (const f of t.sections.flatMap((s) => s.fields)) if (f.type === "computed") a[f.id] = computeValue(f, a);
  return a;
}

// ───────────────────────── main ─────────────────────────
async function main() {
  console.log("Seeding…");
  const hash = await bcrypt.hash(PASSWORD, 10);

  // Taxonomy + templates
  const typeByCode: Record<string, { id: string; name: string }> = {};
  for (const [ci, cat] of TAXONOMY.entries()) {
    const c = await db.surveyCategory.create({ data: { name: cat.name, sortOrder: ci } });
    for (const [si, sub] of cat.subs.entries()) {
      const s = await db.surveySubCategory.create({ data: { categoryId: c.id, name: sub.name, quantityLabel: sub.qty, sortOrder: si } });
      for (const [ti, [code, name]] of sub.types.entries()) {
        const t = await db.surveyType.create({
          data: { subCategoryId: s.id, code, name, creditCost: 1, sortOrder: ti, scopeItems: { create: SCOPES[code].map((text, i) => ({ text, sortOrder: i })) } },
        });
        typeByCode[code] = t;
        const tpl = TEMPLATES[code];
        await db.surveyTemplate.create({ data: { surveyTypeId: t.id, version: tpl.version, name: tpl.name, schema: JSON.stringify(tpl), published: true } });
      }
    }
  }

  // Packages — prices from the purchase history in the audit (₹100 / ₹200 / ₹250)
  const pkgs = await Promise.all([
    db.package.create({ data: { name: "Silver", price: 100, credits: 10, validityDays: 30, sortOrder: 0 } }),
    db.package.create({ data: { name: "Gold", price: 200, credits: 25, validityDays: 90, sortOrder: 1 } }),
    db.package.create({ data: { name: "Platinum", price: 250, credits: 40, validityDays: 180, sortOrder: 2 } }),
  ]);

  // Orgs & users
  const platform = await db.organization.create({ data: { name: "Marine Survey Portal", kind: "PLATFORM" } });
  await db.user.create({ data: { orgId: platform.id, email: "admin@msp.demo", passwordHash: hash, role: "PLATFORM_ADMIN", firstName: "Platform", lastName: "Admin", phone: "+919800000001" } });

  const vendor = await db.organization.create({
    data: {
      name: "Coastal Survey Co. (Demo)", kind: "VENDOR", gstin: "33AAACC1234F1Z5", email: "ops@coastal.demo", phone: "+914442001234",
      address: "14 Rajaji Salai, Parrys", city: "Chennai", state: "Tamil Nadu", country: "IN", isDemo: true,
    },
  });
  const vAdmin = await db.user.create({ data: { orgId: vendor.id, email: "admin@coastal.demo", passwordHash: hash, role: "VENDOR_ADMIN", firstName: "Meera", lastName: "Raghavan", phone: "+919840011111" } });
  const vStaff = await db.user.create({ data: { orgId: vendor.id, email: "ops@coastal.demo", passwordHash: hash, role: "VENDOR_STAFF", firstName: "Arjun", lastName: "Pillai", phone: "+919840022222" } });
  const admin: Actor = { id: vAdmin.id, orgId: vendor.id, name: "Meera Raghavan", role: "VENDOR_ADMIN", surveyorId: null };
  const staff: Actor = { id: vStaff.id, orgId: vendor.id, name: "Arjun Pillai", role: "VENDOR_STAFF", surveyorId: null };

  // Second tenant — proves isolation (log in as admin@harbour.demo: you will never see Coastal's data)
  const vendor2 = await db.organization.create({ data: { name: "Harbour Marine Surveyors (Demo)", kind: "VENDOR", gstin: "27AAHCH5678K1Z2", city: "Mumbai", state: "Maharashtra", country: "IN", isDemo: true } });
  const v2Admin = await db.user.create({ data: { orgId: vendor2.id, email: "admin@harbour.demo", passwordHash: hash, role: "VENDOR_ADMIN", firstName: "Rohan", lastName: "Desai", phone: "+919820033333" } });
  const admin2: Actor = { id: v2Admin.id, orgId: vendor2.id, name: "Rohan Desai", role: "VENDOR_ADMIN", surveyorId: null };

  // Credits via real purchases (ledger)
  for (const p of [pkgs[2], pkgs[2], pkgs[1]]) await purchasePackage(admin, p.id);
  await purchasePackage(admin2, pkgs[0].id);
  // One expired historic purchase for the history tab
  await db.purchase.create({ data: { number: "PUR-2025-00001", orgId: vendor.id, packageId: pkgs[0].id, price: 100, credits: 10, purchasedAt: new Date(Date.now() - 200 * DAY), expiresAt: new Date(Date.now() - 170 * DAY), status: "EXPIRED", paymentRef: "SIM-legacy", createdById: vAdmin.id } });

  // Letterhead
  const lhFile = await storeFile(vendor.id, vAdmin.id, demoLetterhead(), "coastal-letterhead.png", "image/png", "LETTERHEAD");
  await db.letterhead.create({ data: { orgId: vendor.id, attachmentId: lhFile.id, version: 1, active: true, createdById: vAdmin.id } });

  // Surveyors — in-house (some with logins) + marketplace independents
  const allTypeIds = Object.values(typeByCode).map((t) => t.id);
  const shoreTypes = ["COC", "TS", "TU", "FB", "FRL", "OT", "PDL", "PDS"].map((c) => typeByCode[c].id);
  const inHouseSpec = [
    { name: "Karthik Subramanian", email: "surveyor@coastal.demo", phone: "+919841100001", base: "Chennai Port", login: true, rating: 4.8, types: allTypeIds },
    { name: "Priya Natarajan", email: "priya@coastal.demo", phone: "+919841100002", base: "Kattupalli", login: true, rating: 4.6, types: shoreTypes },
    { name: "Abdul Rahim", email: "rahim@coastal.demo", phone: "+919841100003", base: "Ennore", login: false, rating: 4.4, types: shoreTypes },
    { name: "Suresh Babu", email: "suresh@coastal.demo", phone: "+919841100004", base: "ICD Irungattukottai", login: false, rating: 4.1, types: [typeByCode.COC.id, typeByCode.TS.id, typeByCode.TU.id] },
    { name: "Lakshmi Iyer", email: "lakshmi@coastal.demo", phone: "+919841100005", base: "Tuticorin", login: false, rating: 4.7, types: allTypeIds, availability: "ON_LEAVE" },
    { name: "Vignesh Kumar", email: "vignesh@coastal.demo", phone: "+919841100006", base: "Chennai Port", login: false, rating: 3.9, types: [typeByCode.COC.id, typeByCode.PDL.id, typeByCode.PDS.id] },
  ];
  const marketplaceOrg = await db.organization.create({ data: { name: "Independent Surveyors", kind: "PLATFORM" } });
  const indieSpec = [
    { name: "Fairoos M K", email: "indie@msp.demo", phone: "+919895500001", base: "Kochi", login: true, rating: 4.5, types: allTypeIds },
    { name: "Hariharakrishnan V K", email: "hari.vk@msp.demo", phone: "+919895500002", base: "Tuticorin", login: false, rating: 4.3, types: shoreTypes },
    { name: "Mukesh Sharma", email: "mukesh@msp.demo", phone: "+919895500003", base: "Mundra", login: false, rating: 4.0, types: shoreTypes },
    { name: "R Suryakanta", email: "suryakanta@msp.demo", phone: "+919895500004", base: "Paradip", login: false, rating: 4.2, types: [typeByCode.DRS.id, typeByCode.PDL.id] },
    { name: "Rodel S Cajandab", email: "rodel@msp.demo", phone: "+639171234567", base: "Chennai Port", login: false, rating: 4.6, types: allTypeIds },
  ];
  const surveyors: { id: string; name: string; userId: string | null; kind: string }[] = [];
  for (const [list, kind] of [[inHouseSpec, "IN_HOUSE"], [indieSpec, "INDEPENDENT"]] as const) {
    for (const s of list) {
      const user = s.login
        ? await db.user.create({ data: { orgId: kind === "IN_HOUSE" ? vendor.id : marketplaceOrg.id, email: s.email, passwordHash: hash, role: "SURVEYOR", firstName: s.name.split(" ")[0], lastName: s.name.split(" ").slice(1).join(" "), phone: s.phone } })
        : null;
      const row = await db.surveyor.create({
        data: {
          orgId: kind === "IN_HOUSE" ? vendor.id : null, userId: user?.id, kind, name: s.name, email: s.email, phone: s.phone,
          availability: "availability" in s ? s.availability : "AVAILABLE", baseLocation: s.base, coverage: `${s.base}, Chennai`, rating: s.rating,
          capabilities: { create: s.types.map((surveyTypeId) => ({ surveyTypeId })) },
          rates: { create: s.types.slice(0, 3).map((surveyTypeId) => ({ surveyTypeId, location: s.base, amount: int(15, 45) * 100, effectiveFrom: new Date(Date.now() - 120 * DAY) })) },
          documents: { create: [{ docType: "PAN", docNumber: `ABCPK${int(1000, 9999)}L`, status: "VERIFIED", reviewerId: vAdmin.id, reviewedAt: new Date() }, { docType: "CERTIFICATE", docNumber: `IIMS/${int(1000, 9999)}`, expiresAt: new Date(Date.now() + 300 * DAY), status: kind === "IN_HOUSE" ? "VERIFIED" : "PENDING" }] },
        },
      });
      surveyors.push({ id: row.id, name: s.name, userId: user?.id ?? null, kind });
    }
  }
  const svActor = (s: (typeof surveyors)[number]): Actor => ({ id: s.userId ?? `surveyor:${s.id}`, orgId: vendor.id, name: s.name, role: "SURVEYOR", surveyorId: s.id });
  const karthik = surveyors[0], priya = surveyors[1], rahim = surveyors[2], suresh = surveyors[3], vignesh = surveyors[5];
  const fairoos = surveyors[6], rodel = surveyors[10];

  // Customers (clearly demo)
  const customerSpec = [
    ["ENTERPRISE", "Veera Shipping & Logistics (Demo)", "veera@demo-customer.in", "+914425261111", "Chennai", "Tamil Nadu", "33AABCV1234Q1Z1"],
    ["ENTERPRISE", "Hilux Maritime Pvt Ltd (Demo)", "ops@hilux-demo.in", "+914425262222", "Chennai", "Tamil Nadu", "33AACCH9876L1Z8"],
    ["ENTERPRISE", "Zenith Freight Forwarders (Demo)", "desk@zenithff-demo.in", "+912222653333", "Mumbai", "Maharashtra", "27AABCZ4455M1Z3"],
    ["ENTERPRISE", "Southern Star CHA Services (Demo)", "cha@southernstar-demo.in", "+914842394444", "Kochi", "Kerala", "32AAFCS7788N1Z6"],
    ["ENTERPRISE", "Bluewave Lines Agency (Demo)", "agency@bluewave-demo.in", "+914425265555", "Chennai", "Tamil Nadu", "33AAGCB3322P1Z4"],
    ["ENTERPRISE", "Kaveri Agro Exports (Demo)", "exports@kaveriagro-demo.in", "+914312406666", "Tiruchirappalli", "Tamil Nadu", "33AAHCK6611R1Z9"],
    ["ENTERPRISE", "Deccan Heavy Engineering (Demo)", "logistics@deccanheavy-demo.in", "+914023407777", "Hyderabad", "Telangana", "36AAICD2299S1Z2"],
    ["ENTERPRISE", "Gulf Bridge Trading LLC (Demo)", "trade@gulfbridge-demo.ae", "+97143218888", "Dubai", "Dubai", ""],
    ["INDIVIDUAL", "Ramesh|Kumar", "ramesh.k@demo-mail.in", "+919884099999", "Chennai", "Tamil Nadu", ""],
    ["ENTERPRISE", "Coromandel Granites (Demo)", "ship@coromandelgranite-demo.in", "+914142231010", "Cuddalore", "Tamil Nadu", "33AAJCC5544T1Z7"],
  ] as const;
  const customers = [];
  for (const [type, name, email, phone, city, state, gst] of customerSpec) {
    const [first, last] = name.split("|");
    customers.push(await db.customer.create({
      data: {
        orgId: vendor.id, customerType: type, organizationName: type === "ENTERPRISE" ? name : null, firstName: type === "INDIVIDUAL" ? first : null, lastName: type === "INDIVIDUAL" ? last : null,
        taxId: gst || null, email, phone, address1: `${int(2, 220)}, ${pick(["Linghi Chetty St", "Moore St", "Armenian St", "Thambu Chetty St", "Second Line Beach"])}`,
        country: city === "Dubai" ? "AE" : "IN", state, city, isDemo: true,
      },
    }));
  }
  const c2 = await db.customer.create({ data: { orgId: vendor2.id, customerType: "ENTERPRISE", organizationName: "Konkan Exim (Demo)", email: "konkan@demo-customer.in", phone: "+912266001122", address1: "Ballard Estate", country: "IN", state: "Maharashtra", city: "Mumbai", isDemo: true } });

  // Requester portal user (matches Veera's email) — sees RFQs & issued reports addressed to them
  const reqOrg = await db.organization.create({ data: { name: "Veera Shipping & Logistics (Demo)", kind: "REQUESTER", isDemo: true } });
  await db.user.create({ data: { orgId: reqOrg.id, email: "veera@demo-customer.in", passwordHash: hash, role: "REQUESTER", firstName: "Veera", lastName: "Ops", phone: "+914425261111" } });

  // ───── RFQs through the real workflow ─────
  const placeList = [
    ["YARD", "Sattva CFS Yard", "Sattva CFS, Ponneri, Tamil Nadu", 13.3389, 80.2042],
    ["TERMINAL", "Chennai Container Terminal", "Chennai Container Terminal (CCTL), Chennai Port", 13.1009, 80.2967],
    ["CFS", "Continental Warehousing CFS", "Continental CFS, Madhavaram, Chennai", 13.1489, 80.2311],
    ["YARD", "Kattupalli Empty Yard", "Kattupalli Port, Chennai", 13.3089, 80.3436],
    ["FACTORY", "Deccan Heavy Works", "SIPCOT Sriperumbudur, Tamil Nadu", 12.9649, 79.9465],
    ["VESSEL", "MV Ocean Pride", "Kamarajar Port (Ennore), Berth 4", 13.2647, 80.3305],
  ] as const;
  const lineCombos: [string, number][][] = [[["COC", 3]], [["COC", 2], ["TS", 1]], [["TS", 2]], [["FB", 1]], [["PDS", 2]], [["COC", 1]], [["TU", 2]], [["DRS", 1]], [["OT", 1]], [["PDL", 1]]];
  const sources = ["PHONE", "EMAIL", "WHATSAPP", "EMAIL", "PHONE", "WEBSITE"] as const;
  type Target = "NEW" | "DECLINED" | "CANCELLED" | "ACCEPTED" | "ASSIGNED" | "REJECTED_REASSIGNED" | "IN_PROGRESS" | "SUBMITTED" | "COMPLETED";
  const plan: Target[] = [
    ...Array(14).fill("COMPLETED"), ...Array(3).fill("SUBMITTED"), ...Array(4).fill("IN_PROGRESS"), "REJECTED_REASSIGNED", "REJECTED_REASSIGNED",
    ...Array(3).fill("ASSIGNED"), ...Array(3).fill("ACCEPTED"), ...Array(5).fill("NEW"), "DECLINED", ...Array(3).fill("CANCELLED"),
  ];
  // Spread creation over ~6 months; the most recent ones are the earliest-stage.
  const order = plan.map((t, i) => ({ t, ageDays: Math.round(175 - (i / plan.length) * 172) + int(0, 3) }));

  const typeName = (code: string) => typeByCode[code].id;
  let n = 0;
  for (const { t, ageDays } of order) {
    n++;
    const customer = customers[n % customers.length];
    const place = placeList[n % placeList.length];
    const combo = lineCombos[n % lineCombos.length];
    const created = new Date(Date.now() - ageDays * DAY);
    const surveyDate = new Date(created.getTime() + int(1, 4) * DAY);
    const usd = customer.country !== "IN";
    const appt = await storeFile(vendor.id, vAdmin.id, demoPdf(`Appointment Letter - ${customer.organizationName ?? "Customer"}`), "appointment-letter.pdf", "application/pdf", "OTHER");
    const rfq = await createRfq(n % 3 ? admin : staff, {
      customerId: customer.id,
      intake: { requestSource: sources[n % sources.length], requestReceivedAt: created.toISOString(), contactPerson: pick(["Mr. Senthil", "Ms. Kavya", "Capt. Rao", "Mr. Joseph"]), contactDetails: customer.phone, initialNotes: "Customer requested survey; documents to follow by email." },
      survey: {
        cargoName: pick(["Empty containers", "Granite slabs", "Rice in bags", "Machinery parts", "Steel coils", "Cotton yarn"]),
        cargoQuantity: `${int(1, 40)} ${pick(["containers", "MT", "packages"])}`,
        lines: combo.map(([code, q]) => ({ surveyTypeId: typeName(code), quantity: q, scope: SCOPES[code].slice(0, 2), scopeOther: undefined })),
      },
      details: {
        surveyArea: place[0], areaName: place[1], locationName: place[2], lat: place[3], lng: place[4], surveyDate: ymd(surveyDate),
        currency: usd ? "USD" : "INR", estimatedRate: usd ? int(80, 250) : int(15, 60) * 100,
        paymentTerms: "1. 100% payment within 15 days of invoice.\n2. Bank transfer to the account on the invoice.\n3. Additional attendance charged at actuals.",
        actingOnBehalfOf: pick(["CHA", "Shipper", "Lines", "FF", "Agent"] as const), piClub: pick(["", "Gard", "Britannia", "UK P&I"]) || undefined,
        jointInspection: n % 5 === 0,
        jointInspectors: n % 5 === 0 ? [{ name: "Mr. Prakash", onBehalfOf: "Lines surveyor", role: "Surveyor" }] : [],
      },
      agent: {
        companyName: pick(["Zircon Marine Services", "Seahorse Ship Agencies", "Trident Shipping Agency"]), email: "agency@agent-demo.in", phone: "+914425330000",
        address: "Second Line Beach, Chennai 600001", contacts: [{ name: "Ganesh", phone: "+919840055555", email: "ganesh@agent-demo.in" }],
      },
      files: { attachments: [{ id: appt.id, kind: "APPOINTMENT_LETTER", fileName: appt.fileName }] },
    });
    await db.rfq.update({ where: { id: rfq.id }, data: { createdAt: created, isDemo: true } });

    if (t === "NEW") continue;
    if (t === "DECLINED") { await closeRfq(admin, rfq.id, "DECLINED", "Survey date clashes with port strike; customer informed."); continue; }
    if (t === "CANCELLED") { await closeRfq(admin, rfq.id, "CANCELLED", "Customer cancelled — shipment rolled to next vessel."); continue; }

    const lines = await db.rfqLine.findMany({ where: { rfqId: rfq.id }, include: { surveyType: true } });
    const containers: Record<string, string[]> = {};
    for (const l of lines) {
      if (["COC", "TS", "TU", "FB", "FRL", "OT"].includes(l.surveyType.code))
        containers[l.id] = Array.from({ length: l.quantity }, () => makeContainer(pick(["MSKU", "MSCU", "CMAU", "HLXU", "TGHU", "TCNU"]), String(100000 + int(0, 899999))));
    }
    await acceptRfq(admin, rfq.id, containers);
    if (t === "ACCEPTED") continue;

    const jobs = await db.jobOrder.findMany({ where: { rfqId: rfq.id }, include: { survey: { include: { template: true } } }, orderBy: { number: "asc" } });
    for (const [ji, job] of jobs.entries()) {
      const primary = pick([karthik, priya, karthik, fairoos, rodel, rahim, suresh, vignesh]);
      if (t === "REJECTED_REASSIGNED" && ji === 0) {
        // Assignment history: A rejected → reassigned to B
        const first = primary.id === priya.id ? karthik : priya;
        const [a1] = await assignSurveyors(admin, [job.id], [first.id], { instructions: "Carry PPE; gate pass at the yard office." });
        await respondToAssignment(svActor(first), a1, false, "Unavailable on the survey date — attending another vessel at Ennore.");
        if (n % 2) {
          const second = first.id === karthik.id ? fairoos : rodel;
          const [a2] = await assignSurveyors(admin, [job.id], [second.id]);
          await respondToAssignment(svActor(second), a2, true);
        }
        continue;
      }
      const ids = await assignSurveyors(admin, [job.id], [primary.id], { fee: int(8, 25) * 100, instructions: "Report to the yard supervisor; photos of all 12 angles required." });
      if (t === "ASSIGNED" || t === "REJECTED_REASSIGNED") continue;
      await respondToAssignment(svActor(primary), ids[0], true);
      const surveyId = await startSurvey(svActor(primary), ids[0]);
      const survey = job.survey!;
      const tpl = JSON.parse(survey.template.schema) as TemplateSchema;
      const answers = fullAnswers(tpl, { date: ymd(job.surveyDate < new Date() ? job.surveyDate : new Date()), container: job.containerNumber });
      if (t === "IN_PROGRESS") {
        const partial = Object.fromEntries(Object.entries(answers).slice(0, 8));
        await saveSurveyProgress(svActor(primary), surveyId, { answers: partial, baseRevision: 0 });
        continue;
      }
      // Photos + signature
      const owner = primary.userId ?? vAdmin.id;
      for (const [si, slot] of tpl.photoSlots.entries()) {
        const att = await storeFile(vendor.id, owner, demoPhoto(si + n), `${slot.id}.png`, "image/png", "PHOTO");
        await db.surveyPhoto.create({ data: { surveyId, slot: slot.id, attachmentId: att.id, takenAt: job.surveyDate, lat: place[3], lng: place[4] } });
      }
      const sig = await storeFile(vendor.id, owner, demoSignature(), "signature.png", "image/png", "SIGNATURE");
      await db.surveyPhoto.create({ data: { surveyId, slot: "sig:surveyor", attachmentId: sig.id, takenAt: job.surveyDate } });
      const unfit = n % 7 === 0 && ji === 0;
      await saveSurveyProgress(svActor(primary), surveyId, {
        answers, baseRevision: 1, verdict: tpl.verdict.required || unfit ? (unfit ? "UNFIT" : "FIT") : null,
        verdictReason: unfit ? "Floorboard oil-stained and front panel dented (approx. 30 cm); not suitable for food-grade cargo." : null,
        completionNotes: "Survey completed in the presence of the yard supervisor.",
      });
      await submitSurvey(svActor(primary), surveyId);
      if (t === "SUBMITTED") continue;
      await reviewSurvey(admin, surveyId, true, "Data checked against photos.");
      const reports = await db.report.findMany({ where: { surveyId } });
      for (const r of reports.filter((r) => r.stage === "CERTIFICATE" || r.stage === "FORMAL")) await issueReport(admin, r.id);
      if (n % 2 === 0) {
        const cert = reports.find((r) => r.stage === "CERTIFICATE");
        if (cert) await sendReport(admin, cert.id, customer.email, "http://localhost:3000");
      }
    }

    if (t === "COMPLETED") {
      const done = await db.jobOrder.findMany({ where: { rfqId: rfq.id }, include: { surveyType: true } });
      const r = await db.rfq.findUniqueOrThrow({ where: { id: rfq.id } });
      const inv = await createInvoice(admin, {
        rfqId: rfq.id, dueDate: ymd(new Date(created.getTime() + (n % 4 === 0 ? 10 : 45) * DAY)), notes: "Thank you for your business.",
        lines: done.map((j) => ({ jobOrderId: j.id, description: `${j.surveyType.name} — ${j.number}${j.containerNumber ? ` (${j.containerNumber})` : ""}`, sac: "998346", quantity: 1, unitPrice: Math.round(r.estimatedRate / done.length), taxRate: 18 })),
      });
      await db.invoice.update({ where: { id: inv.id }, data: { issueDate: new Date(created.getTime() + 5 * DAY) } });
      if (n % 4 !== 1) await markInvoiceSent(admin, inv.id);
      if (n % 4 === 2) await recordPayment(admin, inv.id, { amount: inv.total, mode: "BANK_TRANSFER", reference: `UTR${int(10000000, 99999999)}`, paidAt: ymd(new Date(created.getTime() + 12 * DAY)) });
      if (n % 4 === 3) await recordPayment(admin, inv.id, { amount: Math.round(inv.total / 2), mode: "UPI", reference: `UPI${int(100000, 999999)}`, paidAt: ymd(new Date(created.getTime() + 9 * DAY)) });
    }

    // Spread this RFQ's audit trail across its real lifetime (seed runs in one instant)
    const logs = await db.auditLog.findMany({ where: { rfqId: rfq.id }, orderBy: { createdAt: "asc" } });
    const span = Math.max(1, Math.min(ageDays, 10)) * DAY;
    for (const [i, l] of logs.entries()) await db.auditLog.update({ where: { id: l.id }, data: { createdAt: new Date(created.getTime() + (span * i) / Math.max(1, logs.length)) } });
    await db.jobOrder.updateMany({ where: { rfqId: rfq.id }, data: { createdAt: new Date(created.getTime() + 3600_000), updatedAt: new Date(created.getTime() + span) } });
    await db.report.updateMany({ where: { survey: { jobOrder: { rfqId: rfq.id } }, issuedAt: { not: null } }, data: { issuedAt: new Date(created.getTime() + span) } });
  }

  // Tenant 2 data
  {
    const rfq2 = await createRfq(admin2, {
      customerId: c2.id,
      intake: { requestSource: "EMAIL", requestReceivedAt: new Date().toISOString() },
      survey: { cargoName: "Cotton bales", cargoQuantity: "2 containers", lines: [{ surveyTypeId: typeByCode.TS.id, quantity: 2, scope: SCOPES.TS }] },
      details: { surveyArea: "CFS", areaName: "Punjab Conware CFS", locationName: "JNPT, Navi Mumbai", surveyDate: ymd(new Date(Date.now() + 2 * DAY)), currency: "INR", estimatedRate: 3500, paymentTerms: "Net 15", jointInspection: false, jointInspectors: [] },
      agent: { companyName: "Konkan Agencies", email: "konkan@agent-demo.in", phone: "+912266009988", address: "Fort, Mumbai", contacts: [] },
      files: { attachments: [] },
    });
    await db.rfq.update({ where: { id: rfq2.id }, data: { isDemo: true } });
  }

  // Support tickets
  for (const [topic, priority, type, status, body] of [
    ["Formal report PDF shows old letterhead", "HIGH", "TECHNICAL", "IN_PROGRESS", "After uploading the new letterhead, a draft report still shows the old one."],
    ["GST invoice: need HSN/SAC on credit packages", "MEDIUM", "BILLING", "OPEN", "Our accountant needs the SAC code printed on package purchase invoices."],
    ["Add a new surveyor login", "LOW", "ACCOUNT", "RESOLVED", "Please confirm how to give an existing surveyor a login."],
  ] as const) {
    const t = await db.supportTicket.create({
      data: { number: `TKT-${new Date().getFullYear()}-0000${(await db.supportTicket.count()) + 1}`, orgId: vendor.id, topic, priority, supportType: type, description: body, status, createdById: vAdmin.id, slaDueAt: new Date(Date.now() + 24 * 3600_000) },
    });
    await db.ticketMessage.create({ data: { ticketId: t.id, authorId: vAdmin.id, body } });
    if (status !== "OPEN") await db.ticketMessage.create({ data: { ticketId: t.id, authorId: (await db.user.findFirstOrThrow({ where: { role: "PLATFORM_ADMIN" } })).id, body: "Thanks — we're looking into this and will update you shortly." } });
  }
  await db.counter.upsert({ where: { key: `TKT-${new Date().getFullYear()}` }, create: { key: `TKT-${new Date().getFullYear()}`, value: 3 }, update: { value: 3 } });

  // Legacy ID map (both forms searchable)
  const someRfqs = await db.rfq.findMany({ where: { orgId: vendor.id }, take: 3, orderBy: { createdAt: "asc" } });
  for (const [i, r] of someRfqs.entries()) {
    const legacy = i === 0 ? "R202600098" : `RFQ-2025-00${210 + i}`;
    await db.rfq.update({ where: { id: r.id }, data: { legacyNumber: legacy } });
    await db.legacyIdMap.create({ data: { entityType: "RFQ", legacyId: legacy, newId: r.number } });
  }

  const counts = {
    rfqs: await db.rfq.count(), jobs: await db.jobOrder.count(), assignments: await db.assignment.count(), surveys: await db.survey.count(),
    reports: await db.report.count(), invoices: await db.invoice.count(), audit: await db.auditLog.count(), notifications: await db.notification.count(),
  };
  console.log("Done.", counts);
  console.log(`\nDemo logins (password ${PASSWORD}):
  Vendor admin     admin@coastal.demo
  Vendor staff     ops@coastal.demo
  Surveyor         surveyor@coastal.demo   (in-house)
  Surveyor         indie@msp.demo          (independent / marketplace)
  Requester        veera@demo-customer.in
  Other tenant     admin@harbour.demo
  Platform admin   admin@msp.demo`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
