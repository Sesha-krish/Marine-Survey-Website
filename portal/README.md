# Marine Survey Portal

A multi-tenant marine survey platform. It covers the whole chain: a customer calls in, the vendor raises an RFQ, the RFQ becomes job orders, surveyors are assigned (in-house or independent), the surveyor accepts or rejects on their phone, captures the survey (works offline), and the vendor reviews it and issues versioned, locked reports and GST invoices.

The build spec is `../README.md`. Build status and the list of remaining work are in `../HANDOFF.md`.

## Quick start

```bash
npm install                 # also runs prisma generate
npx prisma db push          # creates prisma/dev.db (SQLite)
npm run db:seed             # demo data, created through the real workflow services
npm run dev                 # http://localhost:3000  (or: npm run build && npm start)
```

All demo accounts use the password `Demo@1234`:

| Role | Email |
|---|---|
| Vendor admin | admin@coastal.demo |
| Vendor staff | ops@coastal.demo |
| In-house surveyor | surveyor@coastal.demo |
| Independent surveyor | indie@msp.demo |
| Requester | veera@demo-customer.in |
| Second vendor (tenant-isolation check) | admin@harbour.demo |
| Platform admin | admin@msp.demo |

To reseed from scratch, stop the app, delete `prisma/dev.db*` and `storage/`, then run `npx prisma db push && npm run db:seed`.

## Stack

- Next.js 15 (App Router, TypeScript), React 19, Tailwind v4, lucide icons, Recharts
- Prisma 6 on SQLite for dev. For production, switch `provider` to `postgresql`; every field type is portable.
- zod 4 schemas, shared between client (inline validation) and server
- Auth: bcrypt passwords, server-side sessions (revocable) in an httpOnly signed JWT cookie, optional TOTP 2FA
- Files: private disk storage (`STORAGE_DIR`), served only through HMAC-signed, expiring URLs (`/api/files/:id?exp&sig`)

## Layout

```
prisma/schema.prisma      domain model (tenancy, RFQ → job → assignment → survey → report, billing, audit)
prisma/seed.ts            demo data seeded through the real workflow services
src/lib/                  auth, totp, storage, audit, notify, ids, iso6346, countries, ports, schemas, constants, templates/
src/server/               domain services: workflow.ts (RFQ/job/assignment/survey), reports.ts, billing.ts, credits.ts,
                          queries.ts (list filters shared with CSV export), list.ts, action.ts (auth wrapper for actions)
src/app/actions/          server actions (thin: authorize → call service → revalidate)
src/app/(app)/            vendor + platform-admin portal (sidebar shell)
src/app/s/                surveyor app (mobile-first, offline queue, PWA)
src/app/r/                requester portal (read-only: their RFQs and issued reports)
src/app/verify/[token]    public, expiring, signed report viewer
src/app/api/              files, export CSV, search, notifications, survey sync + photo upload
scripts/                  smoke.mjs (route sweep), api-test.mjs (sync/photo/signing checks), backdate-demo.mjs
```

## Invariants to keep

- **Tenant scope always comes from the session.** Every query takes `orgId` from `requireUser()` / `getSession()`, never from the URL or the request body.
- **State changes go through `src/server/*` services** inside `db.$transaction`, and each one writes an `AuditLog` row with `audit()`.
- **Statuses are separate per entity** (RFQ / Job / Assignment / Survey / Report / Invoice). The vocabularies live in `src/lib/constants.ts`. A surveyor rejecting an assignment never rejects the RFQ.
- **Reports render only from frozen `ReportVersion.snapshot`.** Once issued, a version is locked. Corrections go through `amendReport()`, which creates a new version.
- **Survey templates are data.** They are versioned JSON (`src/lib/templates/`), and one schema drives the capture form, validation, the report and the API.

## Checks

```bash
npm run typecheck
npm run build
node scripts/smoke.mjs admin@coastal.demo /dashboard /rfqs /jobs     # against a running server (BASE env, default :3100)
node scripts/api-test.mjs                                            # surveyor sync / photo / signed-URL checks
```
