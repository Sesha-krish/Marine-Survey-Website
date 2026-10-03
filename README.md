# Inclips Marine Portal — Full Analysis & Rebuild Prompt

Audited: `portal.inclipsmarine.com` (Vendor role, logged in as *VR Maritime Consultancy Pvt Ltd*), plus the public marketing site `inclipsmarine.com`.

---

## PART 1 — What the system actually is

A **marine survey marketplace + workflow platform**. Three sides:

| Side | Who | What they do |
|---|---|---|
| Requester | Shipping lines, CHAs, freight forwarders | Raise RFQs for container/cargo surveys |
| Vendor (audited role) | Survey companies (e.g. VR Maritime) | Accept RFQs, allocate surveyors, issue reports & invoices |
| Surveyor | Field inspectors | Capture inspection data + photos on site |

**Tech stack detected:** React SPA (hash routing, `#/route`) talking directly to a **Frappe / ERPNext** backend at `app.inclipsmarine.com/api/resource/...`. Files served from `app.inclipsmarine.com/files/...`.

---

## PART 2 — Page-by-page map (Vendor role)

### Global chrome
- **Top bar:** logo, `Credit Points (36)` pill, **Submit RFQ** button, avatar + company name + role label.
- **Left sidebar** (collapsible via `‹` chevron): Dashboard · RFQs · Job Orders · My Customers · Reports · Proforma Invoice · User Management · Purchase Package · Support.

### 1. `#/dashboard`
- 4 KPI tiles, each clickable → deep-links to its list: **RFQs 255**, **Surveyors 10**, **Reports 213**, **Job Orders 362**.
- **RFQ Diagram** — 6-month performance chart, series: Accepted / Completed / In Progress / New / Rejected.
- **RFQ Performance** — monthly performance chart.

### 2. `#/requesterslist` — RFQs (255)
- Search by RFQ ID / Requester Name · **Filter** button · From Date / To Date · **Export** · result count.
- Columns: Sl No · RFQ ID & Date · Requester Name · Place of Survey · Survey Area · Quantity · Created By · Rate · Status.
- Statuses seen: `New`, `Accepted`, `In Progress`, `Completed`, `Rejected`, `Cancelled`.
- Pagination: 10/page, 26 pages.
- Row click → `#/acceptView/{RFQ_ID}`.

### 3. `#/acceptView/{id}` — RFQ detail (4 tabs)
**Overview:** Request Number, Requester Name, Survey Area/Spot (Yard/Vessel/etc.), Name of Yard, Location of Survey, Date of Survey, Estimated Rate (₹), Payment Terms & Conditions (free text, numbered), Acting on Behalf of (CHA / Shipper / Consignee…), P&I Club, **Appointment Letter** download card, **Attachments** card (PDF list), Surveyor/Joint Inspection table, Agent Details (company name/email/phone/address + contact-person table), Survey Types & Cargo Details (Cargo Name, Quantity, and a line table: Category → Sub Category → Type of Survey → Quantity → Scope of Survey text).

**Survey Allocation:** one row per job — Job ID · Type of Survey · Location · Date · Status · Action (assign surveyor).

**Bulk Survey:** fast grid — Job ID · Surveyor · Container Number · **Fit / Unfit** radio · Action · **Save**.

**Proforma Invoice:** invoice generation for the RFQ.

### 4. `#/jobOrders` — Job Orders (362)
- Search by Job Id / Container · From/To Date · Export · count.
- Columns: Sl No · RFQ ID · Job ID · Type Of Survey · Container Number · Requester Name · Status · Action.
- Job ID scheme encodes survey type: `JCOC…` (Condition of Container), `JTS…` (Tally Stuffing), `JFR…` (Flat Rack).
- Statuses: `New`, `In Progress`, `Submitted`, `Completed`, `Cancelled`.
- 15/page, 25 pages.

### 5. `#/mycustomer` — My Customers (17)
- **Add** button, table: Customer Name · Email · Mobile · Action (edit/delete). 15/page.

### 6. `#/reports` — Reports (213)
- Columns: Survey ID · RFQ ID · Job ID · Type of Survey · Container Number · Status · **Reports** button.
- Survey ID prefixes: `CS-YYYY-#####` (container survey), `TS-` (tally stuffing), `FR-` (flat rack).
- **Reports** → `#/reportofConditionofCntr/{SURVEY_ID}` modal with 5 document tabs:
  `Certificate` · `Preliminary Report` · `Completion Report` · `Formal Report` · `Signed Report`
  Actions: **Change Header** (swap letterhead), **Download**, **Send to Requester**.

### 7. The survey instrument itself (Condition of Container report)
This is the core data model — the "survey questions":

- **Header block:** Job ID, Date, Place, certification paragraph naming requester, yard, date, container no.
- **Summary table:** Container No · Size (20'/40') · Ship Name · Voyage No · Customs Seal · Liner Seal · Gross Weight · Tear Weight · Pay Load · **Fit / Unfit**.
- **Gate In / Gate Out:** IMP · EXP · EMPTY (per gate movement).
- **Identification fields:** Place / Date / Time of Inspection, Container No, Container Size, Container Type, Date of Manufacture, Gross Wt, Tear Wt, Pay Load, CSC No, Trailer No, Customs Seal No, Liner Seal No.
- **Container View checklist** (each = condition verdict):
  Rear End · Right Side · Front Side · Left Side · Top Side · Under Structure · Interior → *Good Condition / …*
  Dents/Cuts/Holes → *Without / With* · Wear and Tear → *Normal / Heavy* · Door Gaskets → *Intact / Damaged* · Floorboard → *Dry and Clean / …* · Odor → *Free Off / Present*
- **Surveyor Comments** (numbered free text) · **Remarks** (booking ref etc.)
- **Surveyor sign & stamp** image.
- **Digital Image gallery** (mandatory photo slots): Front Side · Rear Side · Left Side · Right Side · Top Side · Interior · Floorboard · Door Gaskets · Panel Image · CSC Plate · Container Number · Date of Manufacture.

### 8. `#/invoices` — Proforma Invoice (2)
- Columns: Invoice No (`INV-YYYY-#####`) · RFQ ID · Due Date · Amount · Requester Name · Mode of Payment (Bank Transfer) · Status (Pending/Paid) · Action.

### 9. `#/user` — User Management (10)
- **Add** button. Columns: Name · Role (Surveyor) · Email · Mobile · Created Date · Action.

### 10. `#/vendorpackages` — Purchase Package (3 tabs)
- **Purchase Package:** Silver / Gold / Platinum cards — Price · Credit Point · Validity · **Buy Now**. (Prices currently render as **₹0** — bug; history shows real prices ₹100/₹200/₹250.)
- **Rate Card (9):** Type Of Survey → Credit Points. All currently 1 credit:
  Condition of Container · Draft Survey · Flat Bed · Flat Rack Loading · Open Top · Pre Delivery · Pre Dispatch · Tally Stuffing · Tally Unstuffing.
  Taxonomy = `Category (Shore Based / Ship Board / Cargo) → Sub Category (Container / Flat Rack / PDI / Cargo) → Type of Survey`.
- **Purchase Details (61):** Purchase ID · Plan · Price · Credit Points · Validity · Status (expired/active) · Action.

### 11. `#/vendorsupport` — Support (1)
- **Add** ticket. Columns: Ticket No · Topic · Priority · Support Type (Technical/…) · Created Date · Description · Status (Created/…) · Action.

### 12. `#/submitarequestvendor` — Submit RFQ (5-step wizard)
Left stepper, gated (can't jump ahead):
1. **Customer's Details** — Customer Type (Enterprise/Individual), First/Middle/Last Name, Email*, Mobile* (intl country-code picker), Address 1*, Address 2, Country*, State/Province*, City* → **Continue**
2. **Survey Types** — Category → Sub Category → Type of Survey → Quantity → Scope of Survey
3. **Survey Details** — survey area/spot, yard name, location, date, cargo details, payment terms
4. **Agent Details** — company name/email/phone/address + contact persons
5. **Attachments** — appointment letter + supporting PDFs

### Public site (`inclipsmarine.com`)
Home · About Us · Services (Shipboard, Cargo, Shore Based, PDI Inspection, Warehouse Tally, Weighbridge Tally, Certification *coming soon*) · Blogs · Join Us (Join as Service Provider / Join as Independent Surveyor) · Contact Us · Inclips Portal login.

---

## PART 3 — Pros of the existing site

1. **The domain model is genuinely good.** RFQ → Job Order → Survey → Report → Invoice is the correct chain for this industry, and the Category→Sub-Category→Survey-Type taxonomy is extensible.
2. **Deep-linked KPI tiles** on the dashboard — each number is a shortcut, not decoration.
3. **Bulk Survey tab** is the standout feature: Fit/Unfit for 50 containers in one grid with one Save. Real operator empathy.
4. **Five report stages** (Certificate → Preliminary → Completion → Formal → Signed) match how marine surveys are actually issued and paid against.
5. **Change Header / letterhead swap** lets one platform serve many survey firms' branding — smart white-label move.
6. **Structured photo slots** (12 named angles) instead of a generic upload blob — forces evidence completeness and makes auto-generated reports possible.
7. **Credit-point metering** is a clean monetisation fit: usage-based, prepaid, no invoicing friction.
8. **Consistent list pattern** (search · date range · Export · count · paginated table) across every module — learn once, use everywhere.
9. **Intl phone picker + full country list** — ready for non-Indian customers.
10. **Date-ranged CSV Export** on every major list.
11. **Appointment Letter + attachments** carried on the RFQ — the legal paper trail stays with the record.
12. **Frappe/ERPNext backend** means accounting, naming series, roles and workflow come free rather than hand-rolled.

---

## PART 4 — Cons / problems found

### Critical
1. **The browser calls the Frappe REST API directly** — e.g. `GET /api/resource/Job Order?fields=[...]&filters=[["vendor_id","=","CUST-2024-00035"]]&limit=100000`. The **tenant filter is supplied by the client**. If row-level permissions aren't airtight server-side, any logged-in vendor can swap that ID and read another survey firm's jobs, customers and rates. This is the single biggest risk.
2. **`limit=100000`** — it downloads *all* 362 job orders (and will download 36,000) then paginates in JavaScript. Will fall over as the business grows. No server-side pagination, sorting, or search.
3. **Survey photos served from `app.inclipsmarine.com/files/...`** as Frappe *public* files. Those URLs are likely accessible without a session — client cargo photos, seal numbers, letterheads.
4. **Prices show ₹0** on all three package cards while purchase history shows ₹100/₹200/₹250. A live billing page displaying zero is a revenue bug.

### High
5. **Tables overflow horizontally at 1118px** — the **Action** column on Job Orders is off-screen with no visible scroll affordance. On a laptop, the primary action is invisible.
6. **No bulk actions on lists** — no multi-select to assign a surveyor, cancel, or export selected rows (ironic, given Bulk Survey proves they know how).
7. **Wizard is strictly gated** — clicking "Survey Types" does nothing until step 1 validates, with no explanation. No draft/save-and-resume on a 5-step form. Lose the tab, lose everything.
8. **Two different country lists** in the same form (the phone picker and the Country dropdown use different, inconsistent datasets — one has Kosovo, the other has `turks_and_caicos_islands` as a raw snake_case string, plus duplicate entries like "South Korea" / "Korea, Republic of" and "Vietnam" / "Viet Nam"). Dirty master data.
9. **Visible test/garbage data in production** — customers named "01 Testing", containers "XXXU 000001" / "ABCD 1234567" / "HDFC123456", support ticket "TESTING PLS REPLY WITH MESSAGE", 9 of the 10 most recent RFQs `Cancelled`.
10. **Inconsistent ID schemes across eras** — `RFQ-2025-00210` vs `R202600098`; `RFQ-2025-00210-COC-6354` vs `JCOC06813`. Migration debt that breaks search and sorting.
11. **Data entry errors pass through unvalidated** — `MSDU641707 5`, `MSMU 4976759` vs `MSMU8395032`. No ISO 6346 container-number validation or check-digit verification, and no whitespace normalisation, so the same container won't match itself in search.

### Medium
12. **Hash routing (`#/`)** — no SSR, weaker deep-link/SEO behaviour, and the report modal produces an ugly double-hash URL: `#/reportofConditionofCntr/CS-2026-00075#reports`.
13. **No dark mode, no density toggle, no saved views/filters.**
14. **Accessibility gaps** — icon-only buttons without labels, low-contrast status pills, tables lacking proper header associations, custom tabs that don't all respond to keyboard.
15. **Status taxonomy is fragmented** — RFQ uses Accepted/In Progress/Completed/Rejected/Cancelled; Job Order uses New/In Progress/Submitted/Completed/Cancelled; Report uses In Progress/Submitted. Three vocabularies for one pipeline.
16. **"Surveyors" KPI leads to "User Management"** — label/destination mismatch.
17. **No notifications, no activity timeline, no audit trail** visible on any record. For a legal survey document, who changed what and when is non-optional.
18. **Credit balance (36) isn't explained** — no "this RFQ will cost 1 credit", no low-balance warning, no auto-renew.
19. **Proforma Invoice module is nearly dead** — 2 records, both "Pending" since 2024/2025, against 255 RFQs. Either broken or bypassed; either way it's a revenue leak.
20. **No role-aware landing** — the same shell for Vendor, Requester and Surveyor means a field surveyor gets a desktop layout.
21. **Empty states are bare** — "No Data Found" with no guidance on what to do next.
22. **No offline capability** — surveyors work in yards and ports with bad signal, yet report capture appears to be online-only.

---

## PART 5 — REBUILD PROMPT

> Copy everything below into your AI builder / give it to your dev team as the spec.

---

**Build a multi-tenant marine survey management platform called "Marine Survey Portal."**

### Stack
- **Frontend:** Next.js 14+ (App Router, TypeScript), Tailwind CSS, shadcn/ui, TanStack Table + TanStack Query, Recharts. Real URL routing — no hash routes.
- **Backend:** Node (NestJS or Next route handlers) + PostgreSQL + Prisma. **No direct ORM/REST exposure to the browser** — every read goes through an endpoint that derives `tenantId` from the session JWT, never from a query parameter.
- **Auth:** NextAuth/Auth.js, email+password with TOTP 2FA, refresh-token rotation.
- **Files:** S3-compatible storage, **private buckets, time-limited signed URLs only.**
- **Jobs:** BullMQ for PDF generation, email dispatch, exports.
- **Mobile:** PWA with offline-first survey capture (IndexedDB queue + background sync).

### Roles
`PLATFORM_ADMIN` · `VENDOR_ADMIN` · `VENDOR_STAFF` · `SURVEYOR` · `REQUESTER`
Row-level security enforced server-side on every query. Each role gets its own landing experience.

### Core domain model
```
Organization (tenant: vendor | requester, branding/letterhead, credit balance)
User (role, org, profile, signature image)
Customer (belongs to vendor org)
RFQ (number, requester, vendor, surveyArea, yardName, location, surveyDate,
     estimatedRate, currency, paymentTerms, actingOnBehalfOf, piClub,
     appointmentLetter, attachments[], cargoName, cargoQty, status)
RFQLine (category -> subCategory -> surveyType, quantity, scopeOfSurvey)
JobOrder (rfq, surveyType, containerNumber, location, date, assignedSurveyor, status)
Survey (jobOrder, template, answers JSONB, photos[], surveyorComments, remarks, status)
SurveyTemplate (versioned JSON schema -> drives both form and report)
Report (survey, stage, pdfUrl, headerTemplate, sentAt)
Invoice (rfq, number, dueDate, amount, paymentMode, status)
CreditLedger (org, delta, reason, balanceAfter, refId)
Package (name, price, credits, validityDays)
SupportTicket (topic, priority, type, description, status, messages[])
AuditLog (actor, entity, action, before, after, ip, at)
```

### Survey taxonomy (seed data)
- **Shore Based Survey** → *Container*: Condition of Container, Tally Stuffing, Tally Unstuffing · *Flat Rack*: Flat Bed, Flat Rack Loading, Open Top · *PDI Inspection*: Pre Delivery, Pre Dispatch
- **Ship Board Survey** → *Cargo Survey*: Draft Survey
- Plus: Warehouse Tally, Weighbridge Tally
- Each type carries a credit cost (default 1), editable per tenant.

### Survey templates — make them data, not code
Define surveys as versioned JSON schemas rendering field types: `text`, `number`, `date`, `time`, `select`, `radio`, `boolean`, `verdict (Fit/Unfit)`, `photoSlot`, `richText`, `signature`, `table`. Ship **Condition of Container v1** with exactly these fields:

- *Identification:* Place / Date / Time of Inspection, Container No (ISO 6346 validated with check digit), Container Size (20'/40'/40'HC/45'), Container Type, Date of Manufacture, CSC No, Trailer No, Customs Seal No, Liner Seal No, Ship Name, Voyage No
- *Weights:* Gross Weight, Tare Weight, Payload (auto-computed = Gross − Tare, flag mismatch)
- *Gate movement:* Gate In / Gate Out × IMP / EXP / EMPTY
- *Condition checklist:* Rear End, Right Side, Front Side, Left Side, Top Side, Under Structure, Interior → Good / Fair / Damaged / Not Inspected; Dents-Cuts-Holes → Without / Minor / Heavy; Wear and Tear → Normal / Heavy; Door Gaskets → Intact / Damaged; Floorboard → Dry and Clean / Wet / Oily / Damaged; Odor → Free Off / Present
- *Verdict:* FIT / UNFIT (required; UNFIT requires a reason)
- *Photo slots (required, geotagged + timestamped):* Front, Rear, Left, Right, Top, Interior, Floorboard, Door Gaskets, Panel, CSC Plate, Container Number, Date of Manufacture
- *Free text:* Surveyor Comments (numbered list), Remarks
- *Signature:* surveyor sign & stamp

The same schema generates the capture form, the validation, the PDF, and the JSON API.

### Screens to build

**Shared shell:** collapsible sidebar, global command palette (`⌘K`), credit-balance pill with cost preview + low-balance warning, notification bell, org switcher, light/dark mode.

1. **Dashboard** (role-specific): KPI tiles that deep-link, 6-month RFQ status area chart, monthly performance chart, "needs your attention" queue (unassigned jobs, overdue reports, unpaid invoices), recent activity feed.
2. **RFQs list:** server-side search/sort/pagination, saved filter views, multi-select bulk actions (accept, reject, assign, export), density toggle, CSV/XLSX export, sticky action column that never scrolls off.
3. **RFQ detail:** tabs — Overview · Survey Allocation · Bulk Survey · Reports · Invoice · **Activity (audit timeline)**. Keep the Bulk Survey grid: keyboard-navigable, paste-a-column-of-container-numbers, inline Fit/Unfit, autosave with undo.
4. **Job Orders:** same list pattern; drag-to-assign surveyor; map/calendar view of scheduled surveys.
5. **Survey capture (PWA, mobile-first):** offline queue, camera capture straight into named photo slots with on-device compression, resume-in-progress, conflict-safe sync.
6. **Reports:** five stages (Certificate, Preliminary, Completion, Formal, Signed) with status progression; letterhead template picker per tenant; server-side PDF (Puppeteer/React-PDF); Download, Email to Requester with tracked open, and a public signed-link viewer with expiry.
7. **Customers / User Management:** CRUD, invite by email, role assignment, deactivate (never hard delete).
8. **Billing:** package cards (fix the ₹0 bug — price comes from DB and the page refuses to render a ₹0 paid plan), rate card editor, credit ledger with full transaction history, auto-renew toggle, Razorpay/Stripe checkout, GST-compliant invoices.
9. **Invoices:** generate from RFQ, PDF, payment status, reminders, aging report.
10. **Support:** ticketing with threaded messages, attachments, SLA/priority, status workflow.
11. **Admin:** survey template builder (visual), taxonomy editor, tenant management, feature flags, audit log search.

### Non-negotiable requirements
- **Unified status vocabulary** across RFQ / Job / Report / Invoice: `Draft · New · Accepted · Assigned · In Progress · Submitted · Under Review · Completed · Rejected · Cancelled`. One colour per status, one component.
- **One consistent ID scheme:** `RFQ-2026-00001`, `JOB-2026-00001`, `SVY-2026-00001`, `RPT-2026-00001`, `INV-2026-00001`. Provide a migration map for legacy IDs and make both forms searchable.
- **Single canonical ISO 3166 country list** used by both the address field and the phone picker. No duplicates, no snake_case leakage.
- **Input validation everywhere:** container numbers (ISO 6346 + check digit + whitespace normalisation), weights, emails, phone numbers (E.164), dates (no future inspection dates).
- **Autosave + draft recovery** on every multi-step form; the wizard allows free navigation between completed steps and shows per-step validation summaries.
- **Full audit trail** on every record — survey reports are legal documents.
- **WCAG 2.1 AA:** labelled icon buttons, 4.5:1 contrast on status pills, proper table semantics, full keyboard operation, visible focus rings.
- **Responsive 360px → 2560px.** Tables degrade to stacked cards on mobile; no horizontal clipping of actions, ever.
- **Rich empty states** with a primary CTA, and skeleton loaders instead of spinners.
- **Seeded demo data that is realistic and clearly labelled as demo** — no "01 Testing" in production.
- **Observability:** structured logs, Sentry, rate limiting, CSRF protection, strict CSP.

### Design direction
Professional maritime SaaS. Deep navy (`#0B2545` → `#13315C`) primary, teal accent (`#2A9D8F`), neutral slate greys, semantic status colours. Inter or Geist typography. 8px spacing grid, 8px radii, soft two-layer shadows on cards. Dense but breathable data tables. Smooth, restrained motion (150–200ms).

---

## PART 6 — If you're improving rather than rebuilding, do these six first

1. Lock down tenant filtering server-side and make `/files/` private + signed. *(Security)*
2. Replace `limit=100000` with real server-side pagination. *(Scale)*
3. Fix the ₹0 package prices. *(Revenue)*
4. Make the Action column sticky / tables responsive. *(Daily pain)*
5. Add ISO 6346 container-number validation + whitespace normalisation. *(Data quality)*
6. Purge test data and unify the status vocabulary. *(Trust)*

---

---

## PART 7 — Forms, modals & drawers audit (addendum)

Every form-bearing control was opened and inspected. Nothing was submitted.

### 7.1 Add Customer (`My Customers → Add`) — right-side drawer
Customer Type* (Enterprise/Individual) · Organization Name* · Tax ID · License Number · Email* · Mobile* · Address* · Street · Country* · State* · City* · **Submit**

*Notes:* field set does **not** match the Submit-RFQ customer step (that one asks First/Middle/Last Name + Address Line 1/2; this one asks Organization Name + Address/Street). Two different shapes for the same entity.

### 7.2 Add User (`User Management → Add`) — drawer with 3 tabs
- **Basic Details:** profile photo upload ("Change Photo") · User Role* (only option: **Surveyor**) · First Name* · Middle Name · Last Name · Email* · Mobile* · Submit
- **Survey Details:** Location Of Survey · Type Of Survey (dropdown) · Rate of Survey (number) · **+ Add** → builds a table: Sl No / Survey Type / Location / Amount / Action. This is a **per-surveyor rate card by location** — a genuinely good feature I missed first time.
- **KYC Document:** table only — Documents Title / Description / File Name. **No upload control visible** — the tab appears unfinished.

*Defect:* the Survey Details dropdown lists only **6** survey types (Draft Survey, Condition of Container, Tally Stuffing, Tally Unstuffing, Pre Delivery, Pre Dispatch) while the Rate Card page lists **9** — Flat Bed, Flat Rack Loading and Open Top are missing. You cannot rate a surveyor for three of your own billable services.

*Defect:* User Role dropdown has exactly one option. It should be a fixed label or the role set is incomplete.

### 7.3 Add Support Ticket (`Support → Add`) — drawer
Topic* · Priority* (**Low, High, Medium** — in that order) · Support Type* (Marketing, Technical) · Description* (textarea) · Upload Documents (JPEG, PNG, PDF, DOC, XLS, XLSX) · **Submit**

*Defects:* priority options are in nonsensical order (Low → High → Medium). Helper text reads "Attach the purchase order or agreement related to this RFQ" — copy pasted from the RFQ form; this is a support ticket. Only two support types, neither covering Billing/Account.

### 7.4 RFQ Filter (`RFQs → Filter`) — popover
Checkboxes: New · Accepted · In Progress · Completed · Rejected

*Defects:* **"Cancelled" is missing** — yet 6 of the 10 most recent RFQs are Cancelled, so they cannot be filtered for or out. No Apply / Clear-all buttons, no count of active filters, no filter chips on the list. Filter is status-only — no filter by requester, survey type, location, rate range or created-by.

### 7.5 Surveyor Allocation (`RFQ → Survey Allocation → row action`) — drawer with 2 tabs
- **Surveyors (10):** own team — Sl No / Name / Role / Mobile / Email / (select action off-screen right)
- **Independent Surveyors (5):** the **marketplace** — same columns plus a search box

*Defects:* no filter by location, survey type, availability, rate or rating — for a marketplace tab this is the core missing feature. No surveyor profile preview, no current-workload indicator, no distance-to-site. Both tables overflow horizontally inside the drawer, pushing the select control out of view. Allocation is one job at a time (no multi-select across the 3 jobs on this RFQ).

### 7.6 Upload Report Header (`Report → Change Header`) — modal
Upload Header* · Choose file / Browse · constraint text: *jpeg, jpg, png · below 1 MB & 3811×780 pixels* · **Upload**

*Defects:* an exact pixel dimension is demanded with no cropper, no preview, and no example template. No way to view or revert the current header. Per-report rather than a saved tenant-level letterhead, so it must be re-uploaded repeatedly.

### 7.7 Submit RFQ wizard — step 1 behaviour
Customer Type → Enterprise switches the second field from "First Name" to **"Organization Name"**, an autocomplete that searches existing customers (typing "Hilux" offers *Hilux Maritime Pvt Ltd*). Good: prevents duplicate customer records. Steps 2–5 remain locked until step 1 validates, with no indication of why the stepper does nothing when clicked. Country defaults to India. **Not completed or submitted.**

### 7.8 Cross-cutting form defects
1. **Drawer/modal content is invisible to page-level text extraction** (rendered outside `<main>`) — suggests it is also likely invisible to screen readers without proper focus trapping and `aria-modal`.
2. **Three different form containers** for the same class of task — right drawer (Add Customer, Add User, Allocation), centred modal (Change Header), full page (Submit RFQ). No single pattern.
3. **No inline validation** observed — errors appear only on submit.
4. **No Cancel button** on any drawer; only an `×`. No unsaved-changes guard.
5. **No required-field legend**, and `*` placement is inconsistent (sometimes after the label, sometimes on a new line).
6. **Submit buttons are bottom-right of the drawer**, below the fold on shorter viewports, with no sticky footer.
7. **Upload constraints stated only as text**, never enforced visibly or previewed before submit.

### Additional items for the rebuild prompt (append to Part 5 "Non-negotiable requirements")
- One form system: a single `<EntityDrawer>` with sticky header/footer, Cancel + Submit, unsaved-changes guard, focus trap, `aria-modal`, and ESC-to-close.
- Inline per-field validation on blur plus an error summary on submit.
- One canonical Customer schema used by both the standalone Add Customer form and the RFQ wizard step 1.
- Survey-type dropdowns everywhere must read from the single Rate Card source — no hard-coded subsets.
- Filters: full status set (including Cancelled), plus requester / survey type / location / date / rate; Apply + Clear, active-filter chips, and saveable views.
- Marketplace surveyor picker: filter by location, survey type, availability, rate and rating; show profile, workload and distance; allow multi-assign.
- Letterhead: tenant-level saved asset with in-browser cropper to the required ratio, live preview, version history and revert.
- Priority enums ordered semantically (Low < Medium < High < Urgent) from a shared constant.
- Per-surveyor rate card (keep it — it is a strength) extended to all survey types and with effective-from dates.
- Complete the KYC tab: document type, number, expiry, file upload, verification status and reviewer.

---

## PART 8 — Submit RFQ wizard: complete walkthrough

All five steps were walked end to end with real cascading selections. **The final "Save & Exit" button was never clicked** — RFQ count verified at 255 before and after, nothing was created.

**Safety note:** every "Continue" / "Save & Continue" fires only `GET` requests. The wizard holds the entire RFQ in client state and commits once, at the end. Good — but it also means a lost tab loses everything (see defects).

### Step 1 — Customer's Details
`Customer Type*` (Enterprise / Individual) drives the whole panel:

| Customer Type | Fields shown |
|---|---|
| **Individual** | First Name* · Middle Name · Last Name · Email* · Mobile Number* · Address Line 1* · Address Line 2 · Country* · State/Province* · City* |
| **Enterprise** | **Organization Name** (no asterisk) · **Tax ID** · **License Number** · Email* · Mobile Number* · Address Line 1* · Address Line 2 · Country* · State/Province* · City* |

Organization Name is an **autocomplete over existing customers** — typing "Hilux" offers *Hilux Maritime Pvt Ltd* and selecting it **auto-fills every remaining field** (Tax ID, License No, Email, Mobile, Address, Country, State, City). Genuinely good: it prevents duplicate customer records. Country defaults to India. Button: **Continue**.

### Step 2 — Survey Types & Cargo Details
Fields: `Cargo Name` · `Cargo Quantity` · then a repeater block: `Category*` → `Sub Category*` → `Type Of Survey*` → `Quantity` → **scope-of-survey checklist** → **+ Add** → line table (Sl No / Category / Sub Category / Type Of Survey / Quantity / Scope Of Survey / Action 🗑). Buttons: **Back** · **Save & Continue**.

**Full cascade, verified by selecting every branch:**

```
SHIP BOARD SURVEY
└── CARGO SURVEY
    └── (EMPTY — no survey types at all)   ← dead branch

SHORE BASED SURVEY
├── Container
│   ├── Condition of Container
│   ├── Tally Stuffing
│   └── Tally Unstuffing
├── Flat Rack
│   ├── Flat Bed
│   ├── Flat Rack Loading
│   └── Open Top
└── PDI - Inspection
    ├── Pre Delivery   (toast: "You selected Pre Delivery(Discharge)")
    └── Pre Dispatch   (toast: "You selected Pre Dispatch(Loading)")
```

**Scope-of-survey checklists are per survey type** — this is the best-engineered part of the form:

- **Condition of Container** (2 + Other): inspection of empty container prior to stuffing / after un-stuffing
- **Tally Stuffing** (3 + Other): condition prior to stuffing · tally of cargo during loading · formal report on the tally operation
- **Tally Unstuffing** (3 + Other): condition after unloading · tally during unloading · formal report on the tally operation
- **Flat Bed** (9 + Other): verify the flat bed & record condition · verify cargo condition · recommend stuffing plan · recommend lashing plan · verify lashing/chocking plan for sea transport · attend during stuffing · attend during lashing and chocking · check adequacy of securing · provide formal report on completion
- **Open Top** (9 + Other): identical list with "Verify the Open Top…" as the first item
- **Pre Delivery** (3 + Other): condition of cargo prior unloading · lifting arrangements & equipment suitability · discharge operation per discharge plan
- **Pre Dispatch** (6 + Other): condition prior loading · transport equipment & statutory compliance · lifting arrangements · lashing plan & equipment adequacy · loading operation per agreed plan · transport contractor & drivers briefed on Transport Plan & passage

`Other (Please specify)` reveals a free-text *"Enter your custom scope…"* textarea.

Quantity relabels by sub-category: **Quantity** for Container/Flat Rack, **Truck Quantity** for PDI - Inspection.

### Step 3 — Survey Details
- `Survey Area/Spot*` — **Yard · CFS · Terminal · Factory · Vessel**
- `Area/Spot Name*` — label changes dynamically with the above (selecting Yard renames it **"Yard Name"**)
- `Location Of Survey*` — opens a **Google Maps picker** modal: search box, Map/Satellite toggle, fullscreen, Street View pegman, **Select**
- `Date Of Survey*` — native date input
- `Select Currency*` — INR · USD (**USD is the default**)
- `Estimated Rate (USD)*` — label is meant to follow the currency
- `Payment Terms*` — textarea
- `Acting On Behalf Of` — 27 options: Agent, Assured, Broker, Buyer, CFS, CHA, Charterers, FF, ICD, Indentor, Insurance Agent, Insurer, Intermediary, Lines, Loss Assessor, NVOCC, Owner, Port, Re-Insurer, Receivers, Seller, Shipper, **Stevoderes**, Surveyor, Terminal, Transporter, Yard
- `Surveyor/Joint Inspection Present` — Yes/No radio. **Yes** reveals a *Surveyor/Joint Inspection Details* repeater: Name · On Behalf Of (company) · Role (same 27-option list) · **+ Add** → table
- Buttons: **Back** · **Save & Continue**

### Step 4 — Agent Details
`Company Name*` · `Company Email*` · `Company Phone Number*` (intl picker) · `Company Address*` · then *Contact Details* repeater: Name · Phone Number · Agent Email · **+ Add** → table (Sl No / Name / Phone Number / Email / Action). Buttons: **Back** · **Save & Continue**.

### Step 5 — Attachments
`RFQ Attachments` — Choose file / **Browse** · *Selected Attachments* list ("No Data Found"). Buttons: **Back** · **Save & Exit** ← **this is the commit button; not clicked.**

---

## PART 9 — Defects found inside the wizard

### Critical
1. **The entire SHIP BOARD SURVEY branch is dead.** Category → Sub Category *CARGO SURVEY* → Type Of Survey is **empty**. Yet the Rate Card sells `Draft Survey-CARGO SURVEY-SHIP BOARD SURVEY`, a surveyor can be rated for it, and the public site advertises Shipboard Survey as a headline service. **A whole product line cannot be ordered.**
2. **Currency selection does not bind.** Choosing INR leaves the select displaying "USD" and turns the rate label into **"Estimated Rate ()"** — the currency disappears entirely. Default is **USD** for a business whose every existing RFQ is in INR. A rate entered here can be committed against the wrong or an undefined currency.
3. **No review step before commit.** Step 5 is a file picker; **Save & Exit** commits all five steps' data with no summary screen, no totals, no credit-cost preview and no confirmation dialog.
4. **No draft persistence.** All five steps live in client memory. Close the tab, hit Back in the browser, or let the session drop and the entire RFQ is gone. There is no "Save as draft".

### High
5. **Stale validation errors.** "Sub Category is required" stays visible in red for the whole of step 2 *while a sub-category is selected*; "Location of Survey is required" persists after a location is successfully picked. Errors never clear on correction, so real errors become invisible.
6. **Organization Name is not marked required** for Enterprise, while Individual's First Name is. An enterprise customer can potentially be created with no name.
7. **Agent Details has no autocomplete**, unlike the customer step — even though the same agents (e.g. Zircon Marine Services) recur across RFQs. Every RFQ re-types company name, email, phone and address by hand. This is exactly where the dirty agent data comes from.
8. **Map search is not geo-biased.** Searching *"Chennai Port"* returned a temple in Bhodra Halli and "CHENNA ENTERPRISES" in Karnataka. The map defaults to **Madurai** regardless of the vendor's location or last-used site. For a port-services app with no port gazetteer, wrong locations are inevitable.
9. **Scope Of Survey column is unreadable.** The added line renders its scope text one or two words per line down a narrow column, making a single row ~25 lines tall.
10. **Line items can be deleted but not edited** — a typo in quantity or scope means delete and re-enter.

### Medium
11. **Phone country code mangling:** entering a number turned the field into `919876543210` and replaced the India flag with a generic globe icon.
12. **Date input is browser-native `mm/dd/yyyy`** — US format in an Indian product, no calendar styling, no min-date guard against past dates.
13. **API bug observed on step 1:** `GET /api/resource/Requester?filters=[["email_id","=","[object Object]"]]` — a JavaScript object was stringified into the query. A second call ran `User Registration?filters=[["email","=",""],["role","!=","Vendor"]]`, i.e. an **empty-email query across non-vendor registrations**.
14. **Stepper is non-navigable** — completed steps can't be revisited by clicking the stepper, only via Back, and clicking a future step gives no feedback at all.
15. **Cargo Name / Cargo Quantity are optional and unvalidated**, yet drive the report.
16. **Final button is labelled "Save & Exit"** — ambiguous for an action that creates a live RFQ and spends credits. It should say "Submit RFQ (1 credit)".
17. **No credit cost shown anywhere in the wizard**, despite each survey type costing credits per the Rate Card.
18. **Attachments step gives no format or size guidance** — the support ticket form lists accepted formats, this one doesn't. No drag-and-drop, no document-type labelling (appointment letter vs booking confirmation), and the button label is clipped to "Choose a".

### Additions for the rebuild prompt
- Survey taxonomy must come from one source with **no empty leaf branches**; the builder blocks publishing a sub-category with zero survey types, and the UI hides or disables an empty branch instead of offering it.
- Scope-of-survey checklists stay **per survey type, versioned, admin-editable**, with "Other" free text. (Keep this — it is the form's strongest feature.)
- Currency bound to a single source of truth, defaulting to the tenant's home currency, with the symbol rendered live into the rate label and stored alongside the amount.
- Autosave the wizard to a server-side draft on every step, resumable from any device, with a visible "Draft saved" indicator.
- A **Review & Submit** step: full summary of all five steps, line-item totals, credit cost, and an explicit confirm.
- Validation that clears on correction, with an error summary at the top of each step.
- Agent and contact autocomplete over past agents, same as the customer step.
- Map picker: port/terminal gazetteer first, geo-biased autocomplete, centre on tenant's region or last-used site, store lat/lng plus a resolved place name.
- Editable line items, not delete-and-retype; wrap long scope text or truncate with a "view" popover.
- Clickable stepper for completed steps, with per-step validation state shown on each chip.
- Attachment step: drag-and-drop, stated formats and size limits, per-file document-type tagging.

---

## PART 10 — Survey Allocation, Job Orders, Reports & RFQ status behaviour (addendum)

Nothing was submitted. No Allocate, no Submit, no Send to Requester, no Save.

### 10.1 Survey Allocation → row Action (the allocate control, now fully read)
The Action icon opens a **Surveyor Allocation** drawer with two tabs:

- **Surveyors** — the vendor's own 10 staff. Columns: Sl No · Name · Role · Mobile · Email · **Action = a checkbox per surveyor**. One **Allocate** button at the bottom. No search box on this tab.
- **Independent Surveyors** — the marketplace, 5 people (Fairoos Mk, Hariharakrishnan Vk, Mukesh Personal Surveyor, R Suryakanta, Rodel S Cajandab). Same columns, same checkboxes, **plus** a "Search by name / mobile / email" box. Its own separate **Allocate** button.

**Correcting my earlier note:** allocation *is* multi-select — you can tick several surveyors for one job (joint inspection). What it is not is multi-*job*: you still open the drawer once per job order.

Defects:
- Checkboxes are unlabelled (`on`) — unusable with a screen reader, and no "select all".
- **Search exists on the Independent tab but not on the Surveyors tab.** With 10 staff it's survivable; at 100 it isn't.
- No filter by location, survey type, availability, current workload, rate or rating — on the marketplace tab especially, this is the missing core feature.
- Two separate Allocate buttons mean an in-house surveyor and an independent surveyor cannot be allocated to the same job in one action.
- Both tables overflow horizontally inside the drawer; the checkbox column sits off-screen until you scroll.
- No confirmation step and no indication of what allocation does to RFQ/job status.
- Invalid data on display: independent surveyor mobile `6363290628575` (13 digits).

### 10.2 RFQ detail changes shape by status
| | **New** (38 records) | **In Progress** |
|---|---|---|
| Header action | **Cancel RFQ** | none |
| Tabs | Overview · Survey Allocation · Proforma Invoice | Overview · Survey Allocation · **Bulk Survey** · Proforma Invoice |
| Allocation table | has an extra **Estimated Price** column, **0 results** | 3 job rows |

**Critical finding:** a **New** RFQ has **no job orders and no way to create one**. Survey Allocation shows "No Data Found" with no Add control, and there is no Accept button anywhere. The only action available to the vendor is **Cancel RFQ**. That is a dead end in the workflow — and it matches the data: **38 RFQs sit in New, the oldest from February 2025**, while recent RFQs are overwhelmingly Cancelled.

Also: the app generates status deep-links like `#/requesterslist#InProgress`, but navigating to `#/requesterslist#New` **does not apply the filter** — 255 results still. The hash is written but never read.

More dirty data exposed by the New filter: RFQs with Requester Name `-`, Created By `--`, and a rate of `INR 1`.

### 10.3 Job Orders → row Action
Two unlabelled icon buttons: **eye (view)** and an **allocation icon**.

The eye opens a **Job Order** drawer: Job Id · Vendor Name · Date of Survey · Survey Area/Spot · Name of Yard · Location of Survey · Category of Survey · Sub Category of Survey · Type of Survey · Scope of Survey · Status.

Defects:
- **"Vendor Name : Veera Shipping & Logistics"** — Veera is the *Requester*. The field is mislabelled, or the wrong value is bound. On a job order this is a meaningful error.
- **Date of Survey reads 01-10-2026** in the drawer while the parent RFQ says **18-09-2026**.
- Label column is fixed-width and clips: "Category of Surve", "Sub Category of:S".
- Icon-only actions with no tooltips or accessible names.

### 10.4 Reports — all five stages examined
Checked on `CS-2026-00075` (Condition of Container):

| Tab | Content | Actions available |
|---|---|---|
| **Certificate** | one-page survey certificate | Change Header · Download · Send to Requester |
| **Preliminary Report** | *"No Reports Found"* | **none — all buttons disappear** |
| **Completion Report** | *"No Reports Found"* | **none — all buttons disappear** |
| **Formal Report** | full multi-section legal report | Download · Send to Requester · **full WYSIWYG toolbar** (no Change Header) |
| **Signed Report** | a single PDF file card | **View** · Send to Requester (**no Download**) |

**The Formal Report is a live rich-text editor.** The toolbar is SunEditor: Bold, Underline, Italic, Strike, Font Color, Font, Preview, Full screen, Show blocks, **Table**, Indent/Outdent, Align, Horizontal line, List, Size, Highlight, Undo/Redo, **Link**, **Image**.

**This is the most serious integrity problem in the whole system.** A survey report is evidence in cargo-damage and insurance disputes. Here any vendor user can rewrite its findings — change FIT to UNFIT, alter weights, insert or remove images — and:
- there is **no Save button anywhere** (edits are either silently auto-saved or silently lost — both are bad);
- there is **no version history, no audit trail, no "edited on" marker**;
- there is **no lock after Send to Requester**, so a report can be altered after the client has received it;
- image and link insertion means arbitrary external content can be embedded in a signed document.

**Formal Report content — real data errors found in the live document:**
- "we have reached the location on **21-09-2026**" while Date of Survey is **18-09-2026**
- Inspection timings: From **13:15 on 21-09-2026**, To **13:45 on 18-09-2026** — the end is three days *before* the start
- Section numbering runs 1,2,3,4,5,**7** — there is no section 6
- **"Tear Weight"** throughout (the container's own CSC plate in the attached photo reads **TARE**)
- "General Wear & **Tire**", "**Pannel** Image"

### 10.5 One hardcoded component per survey type — confirmed
Each survey type has its own route and its own bespoke template:

| Survey type | Route | Template shape |
|---|---|---|
| Condition of Container | `#/reportofConditionofCntr/{id}` | container panels checklist · verdict **FIT/UNFIT** · 12 named photo slots · **"Tear Weight"** |
| Tally Stuffing | `#/reportofCntrStuffing/{id}` | container header · **two line-item tables** (cargo grade/packing/qty/weights/cbm/dimension/shipper, and consignee/invoice/SB number) · **three signatures** (Surveyor + CHA + Customs) · 19 photo slots |
| Flat Bed / Flat Rack | `#/reportofFlatrack/{id}` | adds ACEP, Port of Loading/Discharging, Securing Recommendation & Arrangements, Final Conclusion table · verdict **REJECTED** · **"Tare Weight"** (spelled correctly here) · free-form photo captions |

Three templates, three different verdict vocabularies (FIT/UNFIT vs REJECTED), two different spellings of the same weight field, and photo slots that are named in two templates and free-form in the third. These are copy-pasted React components, not instances of one schema — which is why adding a survey type means shipping code, and why the Ship Board branch is empty.

Typos carried into the Tally template's photo slots: "Ship Along **Sude**", "Another View Of **Xargo**", "**Xargo**", "**Pannel** Image".

The Tally Stuffing certificate `TS-2026-00009` renders as a **fully blank form** — every label present, every value empty — rather than an empty state telling the user the survey hasn't been filled in.

### 10.6 Proforma Invoice (inside the RFQ)
**Add** opens an **Invoice** drawer: Proforma Invoice date (prefilled today) · Due date · **Unit price (INR)** (prefilled with the RFQ's estimated rate) · **Tax amount (INR)** · **Select JobId** (single-select: JCOC06813 / 06812 / 06811) · Mode of payment (Cash · Bank Transfer · Credit Card · Cheque) · Status (**Draft · Sent · Pending · Paid · Overdue**) · Remarks · Submit.

Defects:
- **One invoice per Job ID.** A 3-container RFQ cannot be invoiced on one document — you must raise three. This is almost certainly why only **2 invoices exist against 255 RFQs**: the module is unusable and everyone bills outside the system.
- **Not GST-compliant.** A single free-text "Tax amount" with no rate, no CGST/SGST/IGST split, no HSN/SAC, no GSTIN, no computed total.
- **Currency hardcoded to INR** in the labels, ignoring the RFQ's own currency (which can be USD).
- **Status including "Paid" is set manually by the vendor** — no payment reconciliation, no evidence trail.
- No line items, no quantity, no subtotal, no invoice preview or PDF, and no send action from the drawer.

### Additions for the rebuild prompt
- **Reports are generated artefacts, not editable prose.** Corrections go through a tracked amendment: the surveyor amends structured field values, a new report *version* is produced, prior versions stay immutable and retrievable, and every change records who/when/why. Lock on issue; a sent report can only be superseded, never silently rewritten. If free-text editing is kept for the narrative sections, it needs explicit Save, autosave recovery, version diff, and an "Amended on {date} by {user}" banner on the document itself.
- **One versioned template schema per survey type**, authored in the admin template builder — not a React component per type. A single canonical field dictionary (Tare Weight, not Tear; one verdict vocabulary; one photo-slot model) shared by every template.
- **Cross-field date validation**: inspection end ≥ start, both within the survey date window, none in the future. Reject at capture, flag on existing records.
- **New RFQs must have a forward action** — Accept (which generates job orders from the RFQ lines), Revise Quote, or Decline — not only Cancel. Add an ageing alert for anything sitting in New beyond an SLA, and triage the 38 stranded records.
- **Status deep-links must actually filter** (`/rfqs?status=new`), and filters belong in the URL so views are shareable and bookmarkable.
- **Allocation**: one drawer that spans in-house and independent surveyors, searchable and filterable on both, multi-select across jobs as well as surveyors, with labelled checkboxes, select-all, and a confirmation summary.
- **Job order drawer**: correct Requester vs Vendor labelling, dates inherited from one source, no clipped labels, named actions instead of bare icons.
- **Invoicing**: multi-job and whole-RFQ invoices with line items and quantities, a GST-compliant tax block (rate, CGST/SGST/IGST, HSN/SAC, GSTIN, computed totals), currency inherited from the RFQ, PDF generation, send-with-tracking, and payment status driven by recorded payments rather than a free dropdown.

### Sources
- [Inclips Portal — Dashboard](https://portal.inclipsmarine.com/#/dashboard)
- [RFQs](https://portal.inclipsmarine.com/#/requesterslist) · [Job Orders](https://portal.inclipsmarine.com/#/jobOrders) · [My Customers](https://portal.inclipsmarine.com/#/mycustomer) · [Reports](https://portal.inclipsmarine.com/#/reports)
- [Proforma Invoice](https://portal.inclipsmarine.com/#/invoices) · [User Management](https://portal.inclipsmarine.com/#/user) · [Purchase Package](https://portal.inclipsmarine.com/#/vendorpackages) · [Support](https://portal.inclipsmarine.com/#/vendorsupport)
- [Submit RFQ wizard](https://portal.inclipsmarine.com/#/submitarequestvendor)
- [Inclips Marine public site](https://inclipsmarine.com/)

---

# Additional Required Workflow Requirements From Project Owner

> **Important:** The requirements below are additions to the existing audit/rebuild specification. Do not remove, simplify, or replace any of the existing functionality, screens, architecture, domain models, validation rules, or recommendations above. The existing Claude analysis remains the baseline specification; these requirements explicitly add the intended end-to-end marine survey vendor workflow.

## 1. Customer Intake Must Be Explicitly Supported

The vendor's workflow begins when a customer contacts the survey company to request a survey.

Customers may initially contact the vendor through channels such as:

- Phone call
- Email
- WhatsApp or other communication channels
- Other offline/direct communication

The system should therefore support recording the **request source/channel** when creating or updating a customer/RFQ.

The intended flow is:

1. Customer contacts the vendor.
2. Vendor searches the existing **Customers** list.
3. If the customer already exists, the vendor selects/reuses the existing customer record.
4. If the customer is new, the vendor adds the customer to **Customers** first.
5. Vendor then proceeds to **Submit RFQ** for that customer.

Customer information should be maintained as a reusable master record rather than repeatedly creating duplicate customer information for every RFQ.

### Recommended request-source fields

Where applicable, support:

- Request Source: Phone / Email / WhatsApp / Website / Other
- Request Received Date & Time
- Contact Person
- Contact Details
- Initial Request Notes

The request source should be visible in the RFQ/activity history where useful.

---

## 2. Submit RFQ Must Explicitly Create an RFQ Record

After the vendor completes the existing **Submit RFQ** wizard, the system must explicitly create a persistent RFQ record.

The required flow is:

**Customer → Submit RFQ → RFQ Created → Unique RFQ ID Generated → RFQ Added to RFQ List**

On successful submission:

- Generate a unique RFQ ID.
- Persist the RFQ in the database.
- Associate the RFQ with the selected Customer.
- Set the initial RFQ status to **NEW**.
- Make the RFQ immediately visible in the vendor's **RFQ List**.
- Record the creator and creation timestamp.
- Add the creation event to the activity/audit timeline.

The RFQ ID must be used consistently across related job orders, survey assignments, surveys, reports, attachments, invoices, and audit history.

---

## 3. Surveyors Must Be Maintained as a Separate Managed Resource

Surveyors are a core operational resource and must have their own management area in the vendor portal, similar to **Customers**.

The vendor should be able to maintain:

- Company/in-house surveyors
- Independent surveyors
- Surveyor profile information
- Contact information
- Availability/status
- Survey capabilities/types
- Location/coverage information where applicable
- Relevant documents/KYC information where applicable
- Assignment history

This must work alongside the existing **User Management** functionality rather than replacing it.

The distinction between **in-house/company surveyors** and **independent surveyors** must remain explicit throughout allocation and assignment workflows.

---

## 4. RFQ/Job Allocation to Surveyors

Once the RFQ/job is created, the vendor must be able to allocate it to an appropriate surveyor.

The allocation workflow is:

**RFQ/Job → Allocate Surveyor → Select In-House or Independent Surveyor → Assignment Created → Surveyor Notified**

The existing Claude analysis already identifies the need for an allocation drawer with in-house and independent surveyor tabs. Preserve all of those requirements and additionally ensure that the resulting assignment is a first-class workflow entity with its own status and history.

The vendor should be able to see at allocation time, where applicable:

- Surveyor type: In-house / Independent
- Name
- Availability
- Current assignments/workload
- Location/coverage
- Relevant survey capabilities
- Assignment history
- Rate/fee information where applicable

Multiple surveyors may be assigned to the same job when a joint inspection is required, consistent with the existing analysis.

---

## 5. Surveyor Must Have a Separate Surveyor-Side Application/Dashboard

The surveyor workflow must not depend on the vendor portal being used directly by the surveyor.

A separate **Surveyor application/dashboard** is required.

When a vendor allocates a job to a surveyor, the assignment must appear in that surveyor's application.

The surveyor should be able to see at minimum:

- New assignments
- Accepted assignments
- Rejected assignments
- In-progress surveys
- Completed surveys
- Assignment/job details
- Survey location
- Scheduled date/time
- Customer/request information relevant to execution
- Survey type and scope
- Attachments/instructions
- Ability to start/continue the survey
- Ability to submit the completed survey

The existing PWA/offline survey-capture requirements in this document remain applicable to the surveyor application.

---

## 6. Surveyor Accept / Reject Workflow Is Mandatory

When a job is allocated to a surveyor, the surveyor must explicitly be able to **Accept** or **Reject** the assignment.

### Accept

When the surveyor accepts:

**Assignment: NEW → ACCEPTED**

The vendor must be able to see that the surveyor accepted the assignment.

The operational job/survey workflow can then proceed to:

**ACCEPTED → IN PROGRESS → COMPLETED**

### Reject

When the surveyor rejects:

**Assignment: NEW → REJECTED**

The surveyor should provide a rejection reason where appropriate.

The vendor must be notified that the assignment was rejected.

The RFQ itself should **not** automatically become "Rejected" merely because a surveyor rejected the assignment.

This distinction is critical:

- **RFQ Rejected/Declined** = the RFQ/business request itself is rejected or declined.
- **Assignment Rejected** = a particular surveyor declined the assignment.

A surveyor rejection must therefore allow the vendor to reassign the same job/RFQ to another surveyor without creating a duplicate RFQ.

---

## 7. Reassignment After Surveyor Rejection

When a surveyor rejects an assignment, the vendor must be able to allocate the same job to another surveyor.

Required behavior:

1. Original assignment is retained with status **REJECTED**.
2. Rejection reason is retained.
3. Rejection timestamp and rejecting surveyor are retained.
4. Vendor receives a notification/action item.
5. Vendor can open allocation again.
6. Vendor selects another in-house or independent surveyor.
7. A new assignment record is created for the same job.
8. New assignment starts at **NEW**.
9. The complete assignment history remains visible.

Do not overwrite the original rejected assignment.

The system should therefore maintain an assignment history similar to:

```text
Job Order #JO-001
    ├── Assignment #A-001 → Surveyor A → REJECTED → "Unavailable"
    ├── Assignment #A-002 → Surveyor B → ACCEPTED
    └── Assignment #A-002 → IN PROGRESS → COMPLETED
```

This provides an auditable record of who was offered the job, who rejected it, who accepted it, and who eventually completed it.

---

## 8. Survey Execution and Completion

After accepting an assignment, the surveyor performs the actual survey using the existing survey/PWA workflow described in this specification.

The intended operational sequence is:

**Accepted → Start Survey → In Progress → Complete Survey → Submit Survey Data → Job Completed**

The surveyor must have an explicit **Complete/Submit Survey** action.

Completion should capture:

- Survey completion timestamp
- Surveyor identity
- Structured survey data
- Required checklist/template fields
- Photos/evidence
- Attachments
- Observations/findings
- Any required signatures/confirmation
- Completion notes

The system must validate required fields before allowing final submission.

Once the surveyor submits the completed survey, the vendor should see the job as completed/submitted according to the existing Job Order and Survey status model.

---

## 9. Reports Must Follow Survey Completion

The report workflow must be explicitly connected to successful survey completion.

The intended flow is:

**Survey Completed → Survey Data Available → Report Generated → Report Reviewed → Report Issued**

The final report should become available in the vendor's **Reports** section after the survey has been completed and the required report-generation/review process has been satisfied.

The existing five-stage report workflow and the existing report integrity/versioning requirements in this document must be preserved.

A report must remain linked to:

- Customer
- RFQ
- Job Order
- Survey
- Surveyor
- Report version/history

---

## 10. Separate Status Lifecycles Must Be Maintained

Do not use one generic status field to represent every stage of the workflow.

The following are separate concepts and should have separate status fields/entities where appropriate.

### RFQ Status

```text
NEW
  ↓
ASSIGNED
  ↓
IN_PROGRESS
  ↓
COMPLETED
```

Alternative terminal/business states may include:

```text
CANCELLED
DECLINED
```

The exact status vocabulary should remain compatible with the unified status vocabulary already specified elsewhere in this document.

### Survey Assignment Status

```text
NEW
 ↓
ACCEPTED
 ↓
IN_PROGRESS
 ↓
COMPLETED
```

Alternative path:

```text
NEW → REJECTED → REASSIGNED → NEW
```

### Job Order Status

Preserve the existing Job Order lifecycle and make sure it can represent the operational progress:

```text
NEW
 ↓
ASSIGNED
 ↓
IN_PROGRESS
 ↓
SUBMITTED
 ↓
COMPLETED
```

With cancellation available where applicable.

### Survey Status

The survey execution itself should be independently trackable, for example:

```text
NOT_STARTED
IN_PROGRESS
SUBMITTED
COMPLETED
```

### Report Status

Preserve the existing report lifecycle and versioning requirements, including the existing stages:

```text
NOT_GENERATED
GENERATED
UNDER_REVIEW
ISSUED
```

Where amendments are required:

```text
ISSUED → AMENDED → REISSUED
```

These statuses must not be conflated with the RFQ's status.

---

## 11. Vendor Activity Timeline

The vendor should have an end-to-end activity timeline for every RFQ/job.

The timeline should make it possible to understand the complete history without manually checking multiple screens.

Example:

```text
Customer contacted vendor
        ↓
Customer created/selected
        ↓
RFQ submitted
        ↓
RFQ ID generated
        ↓
RFQ created
        ↓
Job order created
        ↓
Surveyor A assigned
        ↓
Surveyor A rejected assignment
        ↓
Vendor notified
        ↓
Surveyor B assigned
        ↓
Surveyor B accepted
        ↓
Survey started
        ↓
Survey completed
        ↓
Report generated
        ↓
Report reviewed
        ↓
Report issued
```

Each event should record, where applicable:

- Event type
- Date/time
- User/actor
- Previous status
- New status
- Relevant reason/notes
- Related entity/assignment/version

This should integrate with the existing AuditLog/activity-trail requirements.

---

## 12. Notifications

The workflow requires explicit notifications between vendor and surveyor.

At minimum:

### Vendor → Surveyor

- New survey assignment
- Assignment updated
- Assignment date/time changed
- Assignment cancelled
- Important survey instructions/attachments updated

### Surveyor → Vendor

- Assignment accepted
- Assignment rejected
- Rejection reason
- Survey started
- Survey completed/submitted
- Issues requiring vendor attention

Notifications may be implemented through the application's notification system and/or appropriate email/push channels, while preserving an in-app notification/history record.

---

## 13. Required End-to-End Business Workflow

The complete intended business workflow for the rebuilt system is:

```text
CUSTOMER CONTACTS VENDOR
        ↓
VENDOR CREATES/SELECTS CUSTOMER
        ↓
SUBMIT RFQ
        ↓
RFQ ID GENERATED
        ↓
RFQ APPEARS IN RFQ LIST
        ↓
VENDOR REVIEWS RFQ
        ↓
JOB ORDER CREATED / RFQ ACCEPTED
        ↓
VENDOR ALLOCATES SURVEYOR
        ↓
┌───────────────────────────────┐
│ In-house Surveyor             │
│ OR                            │
│ Independent Surveyor          │
└───────────────────────────────┘
        ↓
ASSIGNMENT APPEARS IN SURVEYOR APP
        ↓
      ┌───────────────┐
      │ Surveyor      │
      │ Accept /      │
      │ Reject        │
      └───────┬───────┘
              │
       ┌──────┴──────┐
       ↓             ↓
    ACCEPT         REJECT
       ↓             ↓
IN PROGRESS       VENDOR NOTIFIED
       ↓             ↓
SURVEY COMPLETE   REASSIGN SAME JOB
       ↓             ↓
SURVEY SUBMITTED   NEW ASSIGNMENT
       ↓
REPORT GENERATED
       ↓
REPORT REVIEWED
       ↓
FINAL REPORT ISSUED
```

### Key business rule

**A surveyor rejecting an assignment must not reject the RFQ.**

The RFQ/job remains active until the vendor cancels/declines it or the overall workflow reaches completion.

---

## 14. Required Entity Relationship for This Workflow

The existing domain model should be extended/implemented so that the workflow can be represented without duplicating records:

```text
Customer
   │
   └── RFQ
        │
        ├── RFQ Lines
        │
        ├── Job Orders
        │      │
        │      ├── Survey Assignments
        │      │       └── Surveyor
        │      │
        │      └── Survey
        │             │
        │             └── Reports / Report Versions
        │
        ├── Attachments
        ├── Invoices
        └── Activity / Audit History
```

A Job Order can have multiple historical Survey Assignments because a surveyor may reject the job and the vendor may reassign it.

Only the currently active assignment should be treated as the active operational assignment, while historical assignments remain immutable records.

---

## 15. Do Not Remove Existing Claude Specification

The original detailed Claude analysis remains authoritative for all functionality already documented above, including but not limited to:

- Existing portal navigation
- RFQ screens and detailed fields
- Job Orders
- Customers
- Reports and report stages
- Proforma Invoice
- User Management
- Purchase Package
- Support
- Five-step RFQ wizard
- Survey taxonomy
- Survey templates and schemas
- PWA/offline survey capture
- Roles and permissions
- Multi-tenant architecture
- Database/domain model
- Audit logging
- Authentication/security
- Validation
- Attachments
- Billing/invoicing
- Admin functionality
- UI/UX requirements
- Accessibility
- Observability
- Demo data
- Existing audit findings
- Existing recommended fixes

The requirements in this section are **additive**. They exist specifically to make the vendor → surveyor → completion → report workflow explicit and complete based on the intended business process.
