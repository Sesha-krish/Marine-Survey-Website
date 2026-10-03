# HANDOFF — Marine Survey Portal

**Spec:** `README.md` (this folder). It contains the audit of the old Inclips portal, the rebuild prompt (Parts 5, 7, 9 and 10), and the owner's workflow requirements (sections 1–15).
**Code:** `portal/`. Read `portal/README.md` first for setup, layout and invariants.
**Session end:** 2026-10-01. Production build passes with 0 errors and 0 warnings. `tsc` is clean. All 41 routes return 200 for the right roles, and cross-tenant access returns not-found.

---

## 1. How to run

```bash
cd portal
npm install
npx prisma db push && npm run db:seed     # SQLite at prisma/dev.db, files in storage/
npm run build && npx next start -p 3100   # or: npm run dev
```

- Log in at `/login`. All accounts use password `Demo@1234`: admin@coastal.demo, ops@coastal.demo, surveyor@coastal.demo, indie@msp.demo, veera@demo-customer.in, admin@harbour.demo, admin@msp.demo.
- Port 3000 was already in use on the original machine, so testing used 3100. `scripts/smoke.mjs` defaults to 3100 (override with `BASE=`).
- **Windows / Git-Bash gotcha:** run scripts with `MSYS_NO_PATHCONV=1`, otherwise `/dashboard` gets rewritten into a Windows path.
- **Gotcha:** a stray `next dev` process that is still alive while you run `next build` corrupts `.next`. The symptom is `TypeError: a[d] is not a function` and 500s. Kill every node/next process, `rm -rf .next`, then rebuild.
- **npm on this machine** needs the `allowScripts` field in `package.json` (already set) because the user's `.npmrc` has `allow-scripts`.
- `prisma db push --force-reset` (the `db:reset` script) is blocked for AI agents by Prisma. To reseed, delete `prisma/dev.db*` and `storage/` yourself, or ask the user to run `npm run db:reset`.

## 2. What is built (done and verified)

### Foundation
- **Data model** (`prisma/schema.prisma`): Organization (tenant: VENDOR / REQUESTER / PLATFORM, credits, auto-renew), User, Session, Counter (ID sequences), LegacyIdMap, Customer, Agent + contacts, Surveyor (IN_HOUSE / INDEPENDENT; `orgId=null` means marketplace) + capabilities + per-location rates with effective dates + KYC docs, taxonomy (Category → SubCategory → SurveyType + ScopeItem), RateOverride, SurveyTemplate (versioned JSON), Rfq + lines + joint inspectors + agent contacts, RfqDraft, JobOrder, **Assignment** (a first-class entity with full history, `previousId` links a reassignment to the rejected one, joint inspection uses `isLead`), Survey (answers JSON, `revision` for offline merge) + SurveyPhoto, Report + ReportVersion (immutable snapshots, `locked`), Letterhead (versioned), Attachment, Invoice + lines + Payment, Package, Purchase, CreditLedger, SupportTicket + messages, Notification, AuditLog (with `rfqId` denormalised for timelines).
- **Separate status lifecycles** (`src/lib/constants.ts`): RFQ, Job, Assignment, Survey, Report, Invoice, Ticket. One `StatusPill` component with one colour per status.
- **One ID scheme:** `RFQ-/JOB-/ASN-/SVY-/RPT-/INV-/PUR-/TKT-YYYY-00001` (`src/lib/ids.ts`). Legacy IDs are stored in `legacyNumber` and `LegacyIdMap`, and search matches both.
- **Validation:** ISO 6346 container numbers with check digit and whitespace normalisation (`src/lib/iso6346.ts`). E.164 phones and a single canonical ISO-3166 country list shared by the address and phone pickers (`src/lib/countries.ts`, from libphonenumber + Intl). zod schemas are shared between client and server (`src/lib/schemas.ts`). Survey date can't be in the past; inspection date can't be in the future; inspection end must be after start; gross weight must exceed tare.
- **Security:** sessions are server-side and revocable. TOTP 2FA (own RFC 6238 implementation in `src/lib/totp.ts`). Login is rate-limited (in-memory) with no account enumeration. Nonce-based strict CSP plus security headers in `src/middleware.ts`. Server actions get Next's built-in origin check against CSRF. Private files are only reachable through expiring HMAC-signed URLs. Tenant `orgId` always comes from the session. Uploads are checked for MIME type and size. CSV export guards against formula injection.
- **Audit trail** on every state change (`audit()`), plus in-app notifications (`notifyUsers`, `notifyVendor`).

### Vendor portal (`src/app/(app)`)
- **Shell:** collapsible sidebar, top bar with credit pill (low-balance warning), Submit RFQ button, notification bell (polls every 30s, mark read), ⌘K/Ctrl-K command palette (searches RFQs, jobs, containers, customers, surveyors), dark mode without flash, skip link, mobile drawer nav, demo banner, skeleton loading.
- **Dashboard:** KPI tiles that link to their lists, a "Needs your attention" queue (rejected assignments to reassign, unassigned jobs, stale New RFQs, submitted surveys to review, unissued reports, overdue invoices, low credits), a receivables card, a 6-month RFQ status chart, a monthly performance chart and a recent-activity feed.
- **List pattern** (shared `ListToolbar`, `DataTable`, `Pagination`, `BulkBar`): server-side search, filter, sort and pagination. Filters live in the URL, so deep links work (e.g. `/rfqs?status=NEW`). Filter popover has Apply and Clear-all, plus removable chips. Date range, density toggle, saved views (localStorage), CSV export of exactly the filtered view or the selected rows. Sticky Actions column. Tables become stacked cards on mobile. Empty states have a call to action.
- **Customers:** one canonical form (`CustomerDrawer`) shared with the RFQ wizard. Duplicate guard, deactivate instead of delete. Adding a customer leads straight into Submit RFQ for them.
- **Submit RFQ wizard (6 steps):** Customer & request intake (source: phone, email, WhatsApp, website, other; received-at; contact; notes) → Survey types (category → sub category → type cascade that hides empty branches; quantity label follows the sub category; per-type scope checklist plus Other; lines are editable) → Survey details (area type with dynamic name label; location gazetteer of ports/terminals/ICDs plus "use my location" plus OSM map preview; currency bound to the rate label; joint inspection repeater) → Agent (autocomplete over past agents that fills every field) → Attachments (drag-and-drop, document-type tagging, limits stated and enforced) → **Review & Submit** with credit cost and balance. Server-side draft autosave (resumable on any device, "Draft saved" indicator), free navigation between reached steps, per-step error chips, errors clear once fixed. Submitting creates the RFQ (NEW), generates its ID, charges credits (ledger), writes an audit entry, and auto-renews or sends a low-credit alert when needed.
- **RFQ detail:** tabs for Overview, Survey Allocation, Bulk Survey, Reports, Invoices and Activity (full timeline). **Accept** creates one job order per unit, with optional validated container numbers. **Decline** and **Cancel** require a reason and refund credits if no work has started. Bulk-accept, bulk-decline and bulk-cancel from the list.
- **Allocation drawer** (`components/app/allocation-drawer.tsx`): in-house and independent surveyors in one drawer, searchable, filterable by capability, availability and location. Shows workload, completed count, rating, rate, and "rejected this job before". Multi-select surveyors (joint inspection, first one is lead) and multi-select jobs. Fee and instructions fields, a confirmation summary, and surveyors are notified.
- **Reassignment after rejection:** the rejected assignment is kept with its reason, the job returns to NEW, the vendor is notified with a deep link (`/jobs/:id?allocate=1` opens the drawer), and the new assignment links back to the old one. The RFQ is never rejected by this.
- **Job orders:** list (filter by status, type, surveyor, `rejected=1`), detail with correct Requester/Vendor labels, assignment history, withdraw assignment, edit (container/date/location, which notifies the surveyors), cancel job, view survey data, **approve** or **return to surveyor**, generate Preliminary report.
- **Bulk Survey grid:** keyboard navigation (Enter/↑/↓), paste a column of containers from Excel, FIT/UNFIT radios, All FIT, undo, save, ISO validation.
- **Reports:** list, plus a detail view with stage navigation (Certificate / Preliminary / Completion / Formal / Signed). Rendered only from a frozen snapshot; a DRAFT watermark shows until issued. Flow is send for review → **issue (locks the version)**. Issuing the Formal report automatically creates the Signed Report with a SHA-256 hash. **Tracked amendment** edits structured values plus verdict and a plain-text narrative, requires a reason, creates a new version, records the diff in the audit log, shows an "Amended on … by …" banner, and then needs re-issue. Version history viewer, per-report letterhead choice before issue, print to PDF, and **send to requester**, which creates a public link valid for 30 days (`/verify/:token`).
- **Invoices:** multi-job or whole-RFQ invoices with line items, SAC, GST rate, and a CGST+SGST vs IGST split computed from place of supply (USD invoices are zero-rated). Draft → Sent → payments recorded → PARTIALLY_PAID / PAID (derived, never set by hand) → OVERDUE (computed). Aging buckets, printable tax invoice, cancel (blocked once paid).
- **Packages & Credits:** package cards (the page refuses to sell a ₹0 plan), rate card (with negotiated overrides), purchase history with expiry, full credit ledger, low-balance threshold and auto-renew settings. **Payment is simulated.**
- **Surveyors:** "My surveyors" vs "Independent marketplace", add/edit (capabilities, availability, coverage, optional app login with a one-time password), profile with stats, rate card (type × location × effective-from), KYC documents (upload, expiry, verify/reject by vendor admin), assignment history (this vendor's jobs only).
- **User Management:** add/edit (Vendor Admin / Vendor Staff / Surveyor; a surveyor login automatically gets a surveyor profile), deactivate (revokes sessions), admin password reset with a one-time password, 2FA status.
- **Support:** tickets with priority-based SLA (Low < Medium < High < Urgent from one constant), support types including Billing and Account, attachments, threaded conversation, status workflow, notifications both ways.
- **Settings:** profile, password change (signs out other devices), TOTP 2FA with QR code, "sign out other devices", company details (GSTIN validation, state used for GST), **letterhead manager** (in-browser cropper to exactly 3811×780 under 1 MB, versions, revert).
- **Notifications** history page.

### Surveyor app (`src/app/s`, mobile-first, separate from the vendor portal)
- Inbox tabs: New, Accepted, In progress, Completed, Rejected/cancelled. Accept, or Reject with a reason (preset reasons plus free text).
- Assignment detail: where and when (map link), instructions, scope, customer and agent contacts (tap to call), joint inspectors, documents (signed links), Start / Continue survey.
- **Offline-first survey capture:** schema-driven form for every template. Device draft in localStorage. Photos are compressed on the device (max 1600px JPEG), geotagged and timestamped, then queued in IndexedDB. Sync status chip, auto-sync every 1.5s after edits and every 20s, plus on reconnect. Conflict-safe field-level merge on the server through `revision`. Named photo slots plus additional photos, retake and remove, signature pad. Final validation (fields, cross-field rules, required photos, signatures, FIT/UNFIT with a mandatory reason for UNFIT) with an error summary that jumps to each section. Submitting generates the Certificate, Completion and Formal reports and notifies the vendor.
- PWA: `public/manifest.webmanifest`, `public/sw.js` (network-first `/s` pages, cache-first static assets; registered in production only).
- Profile page with the same security settings.

### Requester portal (`/r`) and platform admin (`/admin`)
- Requester: read-only list of RFQs where the vendor's customer email matches the requester's login email, with links to issued reports.
- Admin: overview tiles, tenants (suspend/reactivate, manual credit adjustment written to the ledger, negotiated rate overrides), taxonomy editor (credit cost, active flag, scope checklists, add type; a type is only orderable once it has a published template), **template publisher** (JSON editor with live structural validation; publishing creates a new version and leaves in-flight surveys on their version), audit-log search across tenants, support queue across tenants.

### Survey templates shipped (`src/lib/templates/definitions.ts`)
Condition of Container v1 (exactly as specified), Tally Stuffing, Tally Unstuffing, Flat Bed, Flat Rack Loading, Open Top, Pre Delivery, Pre Dispatch, **Draft Survey** (the Ship Board branch that was dead in the old system), Warehouse Tally and Weighbridge Tally. They share one field dictionary: "Tare Weight" everywhere, one FIT/UNFIT verdict vocabulary, and named photo slots with typos fixed.

### Verification done
- Seed runs end to end through the real services: 39 RFQs, 48 jobs, 46 assignments including reject → reassign histories, surveys, 112 reports, 14 invoices, ~716 audit events.
- `scripts/smoke.mjs`: every page for every role returns 200; wrong roles are redirected; the second tenant gets not-found on the first tenant's IDs.
- `scripts/api-test.mjs`: sync works, stale-revision merge keeps both edits, photo upload works, signed file is served, tampered signature returns 403, bad MIME returns 400, another surveyor's survey returns 409.
- Browser check: dashboard, RFQ allocation tab, formal report with photos and signature, surveyor inbox, capture form, submit validation.
- **`npm test` (Vitest): 37 tests passing.**
  - `tests/core.test.ts`: ISO 6346, TOTP (RFC 6238 vector), countries/E.164, every shipped template passes the admin validator, cross-field rules, schemas, CSV injection guard.
  - `tests/workflow.test.ts`: the full owner workflow through the real services on a throwaway `prisma/test.db`. Covers RFQ creation and credits, tenant isolation, invalid containers, reject → reassign with history (RFQ stays active), offline merge, submit gating on photos/signature, approve, issue/lock and signed hash, amend → v2 → re-issue → send, GST invoice + partial/full payment, decline refund, insufficient credits, and timeline completeness.
- **Layout fix (late in the session):** page-level horizontal scroll at tablet widths on the RFQ wizard. Cause: an `sr-only` label escaping a non-positioned `overflow-x-auto` strip, plus grid children without `min-w-0`. Fixed globally in `globals.css` (`.grid > *` / `main` get `min-width:0`; `.overflow-x-auto` gets `position:relative`). Verified scrollWidth == clientWidth on `/rfqs/new`.

---

## 3. Remaining work (prioritised)

### P0: verify before calling it production-ready
1. **Click-through test every mutation in a browser.** (The wizard click-through was in progress when the browser tool hit the account's usage limit. There is also a "Ramesh Kumar" RFQ draft in the dev DB that the user created; don't delete it.) These were built and typecheck, but were only exercised through services or the seed, not by clicking: wizard submit, accept with containers, allocation drawer (single and bulk), withdraw assignment, bulk-survey save, approve/return survey, issue/amend/re-issue/send report, letterhead change, invoice create / send / payment / cancel, package purchase, credit settings, customer/user/surveyor CRUD, KYC upload, ticket create/reply/status, 2FA setup, password change, admin taxonomy/template/override/credit actions, surveyor accept/reject/start/submit through the UI.
2. **Automated tests:** Vitest unit tests and a service-level workflow test are DONE (`npm test`, 37 passing). Still to do: Playwright browser e2e of the same flow through the UI, and tests for server actions' role checks.
3. **Not-found status codes:** with `(app)/loading.tsx`, `notFound()` streams a 404 UI but returns HTTP 200. Return a real 404 (move the loading skeleton per-segment, or check existence before streaming).
4. **Seed timestamps:** assignment `assignedAt` / `respondedAt` / `completedAt` and audit dates of seeded jobs still show the seed day in some places. Backdate them in `prisma/seed.ts` the same way RFQs are backdated. `scripts/backdate-demo.mjs` already fixes jobs and reports for existing DBs.
5. **Mobile pass:** check every page at 360px (the wizard, report view, invoice view and admin tables especially).

### P1: features the spec asks for that are stubbed or missing
6. **PostgreSQL:** switch the provider, create real migrations (`prisma migrate`), add Postgres row-level-security policies as defence in depth, and replace `contains` with case-insensitive `mode: "insensitive"` (SQLite `contains` is case-sensitive for non-ASCII).
7. **Payments:** Razorpay or Stripe checkout for packages (create order → client checkout → verified webhook → `postCredits`). Today `purchasePackage` completes instantly (see the comment in `src/server/billing.ts`). Add GST invoices for package purchases and credit expiry (EXPIRY ledger entries when a purchase's validity ends).
8. **Email / push:** none is sent. Add a notification dispatcher (outbox table + BullMQ worker) for assignment notifications, report send (with open tracking), invoice send and reminders, ticket replies, and invites. `sendReport` currently returns a link for the user to copy.
9. **Server-side PDF:** reports and invoices use browser print-to-PDF. Add Puppeteer or React-PDF rendering in a BullMQ job, store the PDF per version, and attach it to emails.
10. **S3 storage:** swap `readStored` / `saveUpload` in `src/lib/storage.ts` for a private S3 bucket with presigned GETs. The API is already isolated there.
11. **Background jobs:** BullMQ + Redis for exports, PDFs, email, SLA breach escalation, overdue invoice flips (currently computed on read), credit expiry, and draft cleanup.
12. **Observability:** Sentry, structured logging (pino), request IDs, and a Redis-backed rate limiter for all mutations (the limiter is in-memory and only covers login).
13. **Visual template builder:** admin currently edits template JSON with live validation. The spec asks for a drag-and-drop builder with field palette, photo slots, rules and a preview.
14. **Map picker:** add Google Maps or Mapbox geocoding biased to the tenant region and last-used site. Today it is the gazetteer in `src/lib/ports.ts` plus free text, OSM preview and geolocation.
15. **Job orders calendar/map view and drag-to-assign** (spec Part 5, screen 4).
16. **Requester side:** requesters cannot submit RFQs or download PDFs, and the requester-to-customer link is by email only. Add an explicit `Customer.portalUserId`, invitations, and an RFQ request form.
17. **Legacy migration tooling:** an importer from the old Frappe data, with an ID map, ISO cleanup report and test-data purge.
18. **Saved views** use `window.prompt` and localStorage. Replace with an inline name field and server-side storage so views are shared.
19. **Refresh-token rotation** (the spec mentions NextAuth). The current design uses revocable server-side sessions with a 7-day expiry. Decide whether that is acceptable or add sliding expiry and rotation.
20. **Unsaved-changes guard** exists on drawers and the wizard (beforeunload), but not on in-page forms such as settings and the bulk grid when navigating away.
21. **Survey photos:** HEIC from iPhones may not decode in `createImageBitmap`. Add a fallback (server-side `sharp` conversion) and check the real MIME type on the server rather than trusting the `File.type` the client sends.
22. **Independent surveyor marketplace management** (platform admin CRUD for marketplace profiles and their KYC review). Vendors can only view marketplace profiles today.
23. **i18n**, configurable time zone per tenant (IST is hard-coded in `src/lib/format.ts`), and currency beyond INR/USD.

### P2: polish
24. Run an accessibility audit with axe and a screen reader. Known gaps: the chart `role="img"` has no data-table alternative; the custom comboboxes (location, agent) need full ARIA listbox keyboard handling (arrow keys).
25. Make the dashboard "Receivables" respect USD invoices too.
26. Add a "first is lead" reorder control in the allocation drawer, and let surveyors see supporting surveyors' contact details.
27. Add `next.config.ts` hardening (`poweredByHeader: false`, image config) and HSTS in production.
28. Remove leftover scaffold assets in `portal/public/*.svg`.

---

## 4. Continuation prompt (paste this into the next model)

> You are continuing an in-progress build of a multi-tenant **Marine Survey Portal** in `C:\Users\raahu\Downloads\Inclips Marine\portal` (Next.js 15 App Router + TypeScript + Tailwind v4 + Prisma 6/SQLite + zod 4). The product spec is `C:\Users\raahu\Downloads\Inclips Marine\README.md`; read it fully, especially Parts 5, 7, 9 and 10 and the owner's workflow sections 1–15. Then read `HANDOFF.md` (same folder) and `portal/README.md`. They describe exactly what is built, the invariants, how to run and test, the environment gotchas (port 3000 is taken, so use 3100; set `MSYS_NO_PATHCONV=1` for scripts in Git-Bash; kill stray `next` processes before `next build`; Prisma blocks `--force-reset` for agents), and a prioritised remaining-work list.
>
> Rules: keep the architecture. State changes go through services in `src/server/*` inside `db.$transaction`, each writing `audit()`. Server actions in `src/app/actions/*` wrap services with `run(roles, …)`. Tenant `orgId` always comes from the session. Statuses come from `src/lib/constants.ts`, and each entity has its own lifecycle (a surveyor rejecting never rejects the RFQ). Reports render only from immutable `ReportVersion` snapshots. Survey templates are versioned JSON. Reuse the existing UI kit (`components/ui/*`: `EntityDrawer`, `Field`, `ConfirmButton`, `StatusPill`, `DataTable`, `ListToolbar`, `BulkBar`) and match the surrounding code style. After each change, run `npx tsc --noEmit` and `npx next build`, then `node scripts/smoke.mjs <email> <paths…>` against `next start -p 3100`.
>
> Work through HANDOFF.md §3 in order, starting with P0: (1) click-test every mutation in a browser and fix what breaks, (2) add Vitest unit tests and a Playwright e2e test of the full workflow (customer → RFQ → accept → allocate → surveyor rejects → reassign → accept → offline capture → submit → vendor approves → issue → send to requester → invoice → payment), (3) return real 404 status codes, (4) backdate the remaining seed timestamps, (5) do a 360px mobile pass. Then continue with P1 and P2. Update HANDOFF.md as you go: tick off finished items and record anything new you find.

---

## 5. File map: where to change things

| Concern | File |
|---|---|
| Enums, status colours, limits | `src/lib/constants.ts` |
| Validation schemas | `src/lib/schemas.ts` |
| RFQ / job / assignment / survey state machine | `src/server/workflow.ts` |
| Reports (generate / issue / amend / send / sign) | `src/server/reports.ts` |
| Invoices, GST, payments, packages | `src/server/billing.ts` |
| Credits ledger | `src/server/credits.ts` |
| List filters (shared with CSV) | `src/server/queries.ts` |
| Templates (definitions, validation, admin check) | `src/lib/templates/*` |
| Auth / sessions / rate limit | `src/lib/auth.ts`, `src/app/actions/session.ts` |
| CSP / route gate | `src/middleware.ts` |
| Private files and signed links | `src/lib/storage.ts`, `src/app/api/files/[id]/route.ts` |
| Offline queue (surveyor) | `src/lib/offline.ts`, `src/app/s/surveys/[id]/survey-form.tsx`, `public/sw.js` |
| Seed | `prisma/seed.ts` |
