# BookKeep — Master Implementation Plan

> **Every agent working in this repo must read this file first.**
> Executable breakdown of `BookKeep Full Project Specification.md` (the prose spec — keep it for background; this file is what you build against).
> Created 2026-10-16. Update checkboxes as you work.

## 0. How agents use this file

1. Read §3 (binding conventions) before writing any code.
2. Work phases in order (they are sequential). Within a phase, tasks are ordered; respect the Depends-on line.
3. Claim tasks by editing checkboxes: `- [ ]` todo · `- [~] @agent` in progress · `- [x]` done · `- [!]` blocked (add reason inline).
4. A task is done only when: implementation complete, `yarn lint` passes, `yarn typecheck` passes, relevant tests pass, and the task's Acceptance criteria are verifiably met.
5. If a contract in this file must change, change it here in the same PR and note it — other agents build against these names.
6. When you finish a phase, run its full verification and leave a `**Phase status:** done (date, agent)` line.

## 1. Confirmed scope

- **Full MVP** — all 10 must-have features (spec §2).
- **All 6 stretch features** — deposits, recurring bookings, Google Calendar sync, WhatsApp/SMS reminders, revenue analytics, EN/BN multi-language (user decision: everything, no skips).
- Stripe only for payments (SSLCommerz/bKash explicitly out of scope).

## 2. Repository state at plan creation

- Fresh `create-next-app`: **Next.js 16.4.2**, React 19.3, Tailwind v4 via Turbopack, TypeScript strict, ESLint 9 flat config.
- `next.config.ts`: `cacheComponents: true`, `partialPrefetching: true`, `experimental.agentFeedback: true`.
- One git commit; only default `app/` pages; **no `.env`**, no dependencies beyond the scaffold.
- Package manager: **yarn 1.22** (`packageManager` field) — always use `yarn add`, never npm/pnpm.

## 3. Binding conventions (all tasks, all agents)

### 3.1 Next.js 16 — this is NOT Next 14 (the spec examples assume 14)

- Consult bundled docs first: `node_modules/next/dist/docs/` (see AGENTS.md).
- **`middleware.ts` no longer exists → use `src/proxy.ts`** (same level as `src/app/`). Optimistic auth redirects only — real authorization happens in layouts/routes/API.
- **Async request APIs**: always `await params`, `await searchParams`, `await cookies()`, `await headers()`.
- **Cache Components is ON** — binding patterns:
  - Session: `getCurrentUser()` lives in `src/lib/session.ts`, marked `'use cache: private'` (docs: authentication-with-cache-components.md); returns `{ id, name, email, role, businessId, staffProfileId }` or null; server pages call it and redirect when null.
  - Dashboard data: **client components + TanStack Query** against `/api/*` (also what spec §3 prescribes) — no per-request server-side data reads in dashboard pages.
  - Public pages: server components with `'use cache'` + `cacheLife('minutes')` for static-ish content; interactive parts fetch from public APIs at request time.
  - Route handlers reading `request.url`/DB run at request time automatically — no extra flags needed.
- Lint = `yarn lint` → `eslint .` (`next lint` was removed in v16).
- `route.ts` cannot sit in the same segment as `page.tsx`.
- Before using any unfamiliar Next API, check the bundled docs — heed deprecation notices.

### 3.2 API conventions

- **Route Handlers only** — no Server Actions (spec §3: one consistent style).
- Every input validated with Zod from `src/lib/validators/`.
- Errors are always `{ "error": { "code": "...", "message": "..." } }` JSON with proper status (400/401/403/404/409/429/500).
- Codes: `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `SLOT_TAKEN`, `CONFLICT`, `RATE_LIMITED`, `STRIPE_NOT_CONFIGURED`, `INTERNAL`.
- Success responses: the resource object, or `{ items: [...] }` for lists — consistent per endpoint (contracts in §6).

### 3.3 Tenancy & authorization

- Every business-owned query filters `businessId` **from the session** — never from body/params.
- Staff users: only their own bookings (`staffId == session.staffProfileId`) and own availability; read-only elsewhere.
- Cross-tenant id access → **404** (do not leak existence).
- `requireRole(['owner'])` guards owner-only API routes; `requireRole(['owner','staff'])` otherwise.

### 3.4 Time & money

- Store dates in UTC (`Date`); compute/display with **Luxon** in `business.timezone`.
- Money is integers in smallest unit (cents/paisa); never trust client prices — recalculate server-side (or use `priceSnapshot`).

### 3.5 Security

- bcrypt password hashes (`passwordHash` select:false, never serialized).
- Manage links: random secret in URL, **sha256 stored** (`manageTokenHash`).
- Stripe webhook: signature verification + idempotent processing.
- Cron: `Authorization: Bearer $CRON_SECRET` else 401.
- Public endpoints rate-limited via `src/lib/rate-limit.ts`.

### 3.6 Graceful degradation (no external creds required to develop)

- Only `MONGODB_URI` is required to run the app. Missing Stripe/Resend/Twilio/Google/Upstash keys → warn + stub (emails log to console, checkout returns 503 `STRIPE_NOT_CONFIGURED`, buttons hidden). Documented in README.

## 4. Environment variables & scripts

`.env.example` — create exactly these:

```text
MONGODB_URI=
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
RESEND_API_KEY=
EMAIL_FROM="BookKeep <onboarding@resend.dev>"
CRON_SECRET=change-me
APP_URL=http://localhost:3000
UPSTASH_REDIS_REST_URL=        # optional rate limiting
UPSTASH_REDIS_REST_TOKEN=
GOOGLE_CLIENT_ID=              # stretch: calendar sync
GOOGLE_CLIENT_SECRET=
TWILIO_ACCOUNT_SID=            # stretch: SMS/WhatsApp
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=
```

`package.json` scripts:

```json
{
  "lint": "eslint .",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:unit": "vitest run tests/unit",
  "test:integration": "vitest run tests/integration",
  "test:e2e": "playwright test",
  "seed": "tsx scripts/seed.ts"
}
```

`vercel.json` (Phase 7):

```json
{
  "crons": [
    { "path": "/api/cron/reminders", "schedule": "*/15 * * * *" },
    { "path": "/api/cron/cleanup", "schedule": "0 * * * *" }
  ]
}
```

---
## 5. Data model (Mongoose — `src/models/`)

Every business-owned document carries `businessId: ObjectId` (indexed).

**User** — email (unique, lowercase), passwordHash (bcrypt, select:false), name, role `owner|staff`, businessId, staffProfileId?, invite { tokenHash?, expiresAt? }, createdAt.

**Business** — name, slug (unique), timezone (`Asia/Dhaka`), currency (`BDT`), phone?, address?, logoUrl?, bookingRules { minNoticeHours, maxDaysAhead, cancelWindowHours, slotIntervalMinutes, autoConfirm, depositEnabled, depositPercent, taxRatePercent }, stripeAccountId?, invoiceCounter (number, starts 0), googleCalendar { connected, refreshTokenEnc?, calendarId? }, notify { defaultChannel, reminderHoursAhead }, createdAt.

**Service** — businessId, name, description?, durationMinutes, bufferMinutes, price (smallest unit), staffIds [ObjectId], isActive, createdAt.

**Staff** — businessId, name, email?, photoUrl?, weeklyHours [{ weekday 0–6, ranges [{ start '09:00', end '17:00' }] }], daysOff [{ date 'YYYY-MM-DD', reason?, hoursOverride? }], isActive, createdAt.

**Customer** — businessId, name, email?, phone?, notes?, preferredChannel `email|sms|whatsapp` (default email), createdAt. Unique per business on email and on phone (partial — only when present).

**Booking** — businessId, serviceId, staffId, customerId, startAt (UTC), endAt (UTC), status `pending|confirmed|completed|cancelled|no_show`, slotKeys [string], manageTokenHash, priceSnapshot, depositAmount?, paymentStatus `unpaid|paid|refunded`, source `online|manual`, seriesId? (recurring, P8), recurrence? { freq `weekly|monthly`, interval, count }, emailReminderSentAt?, smsReminderSentAt?, whatsappReminderSentAt?, googleEventId?, createdAt, cancelledAt?.

**Invoice** — businessId, bookingId?, customerId, number (`INV-2026-0042`), lineItems [{ description, qty, unitPrice }], subtotal, tax, total, status `draft|sent|paid|void`, stripeSessionId?, paidAt?, publicToken, createdAt.

**Indexes (exact — spec §4):**

```text
users:      { email: 1 }                                    unique
businesses: { slug: 1 }                                     unique
services:   { businessId: 1, isActive: 1 }
bookings:   { businessId: 1, startAt: 1 }
bookings:   { staffId: 1, startAt: 1 }
bookings:   { slotKeys: 1 }                                 unique, partial: status in [pending, confirmed]
invoices:   { businessId: 1, number: 1 }                    unique
customers:  { businessId: 1, email: 1 }
customers:  { businessId: 1, phone: 1 }                     partial where phone exists
```

**slotKeys rule (spec §8):** partition `[startAt, startAt + durationMinutes + bufferMinutes)` into the `slotIntervalMinutes` grid in **business timezone** minute format; one key per grid point strictly before end:

```text
slotKeys: ['665f…staffId_2026-10-20T10:00', '665f…staffId_2026-10-20T10:15', '665f…staffId_2026-10-20T10:30']
```

Duplicate insert while another pending/confirmed booking owns a key → Mongo error **11000** → API returns **409 `SLOT_TAKEN`**. Cancelled bookings fall out of the partial index → slots free automatically.

**Lifecycle (spec §9):** autoConfirm → created `confirmed`; deposit enabled → created `pending`, webhook deposit payment → `confirmed`; `pending` > 15 min unpaid → cron `cancelled`; owner completes → `completed` → invoice; missed → `no_show`; cancel → `cancelled`.

## 6. Route inventory & contracts (binding)

### UI routes

| Route | Purpose | Roles |
|---|---|---|
| `/`, `/pricing` | landing, pricing | public |
| `/login`, `/register` | auth | public |
| `/b/[slug]` | public business page | public |
| `/b/[slug]/book` | booking wizard | public |
| `/booking/[token]` | customer manage page | token |
| `/invoice/[publicToken]` | public invoice + Pay | token |
| `/dashboard` | today, summary, upcoming | owner+staff |
| `/dashboard/calendar` | day/week/month | owner+staff |
| `/dashboard/bookings`, `/[id]`, `/new` | list/detail/manual | owner+staff |
| `/dashboard/services` | CRUD + hide | owner |
| `/dashboard/staff` | CRUD, invite, hours, days off | owner |
| `/dashboard/availability` | own hours | staff |
| `/dashboard/customers`, `/[id]` | list/history/notes | owner |
| `/dashboard/invoices`, `/[id]` | list/view/send/PDF | owner |
| `/dashboard/settings` | profile, rules, payments, notifications | owner |
| `/dashboard/analytics` | revenue charts (P10) | owner |

### API routes

| Method | Path | Auth |
|---|---|---|
| POST | `/api/auth/register` | none |
| * | `/api/auth/[...nextauth]` | none |
| POST | `/api/staff/invite` | owner |
| GET | `/api/public/[slug]` | none (rate-limited) |
| GET | `/api/public/[slug]/slots?serviceId=&staffId=&date=` | none (rate-limited) |
| POST | `/api/public/[slug]/bookings` | none (rate-limited) |
| GET | `/api/public/bookings/[token]` | token |
| POST | `/api/public/bookings/[token]/cancel` | token |
| POST | `/api/public/bookings/[token]/reschedule` | token |
| GET, POST | `/api/services` | session |
| GET, PATCH, DELETE | `/api/services/[id]` | session |
| GET, POST | `/api/staff` | session |
| PATCH | `/api/staff/[id]` | session (staff: own only) |
| GET, POST | `/api/bookings` | session (staff: own only) |
| GET, PATCH | `/api/bookings/[id]` | session (staff: own only) |
| GET | `/api/customers`, `/api/customers/[id]` | owner |
| GET, POST | `/api/invoices` | owner |
| GET, PATCH | `/api/invoices/[id]` | owner |
| POST | `/api/invoices/[id]/send` | owner |
| GET | `/api/invoices/[id]/pdf` | owner |
| POST | `/api/invoices/public/[token]/checkout` | none |
| POST | `/api/webhooks/stripe` | Stripe signature |
| GET | `/api/dashboard/summary` | session |
| GET | `/api/dashboard/analytics` | owner (P10) |
| PATCH | `/api/business` | owner |
| GET | `/api/cron/reminders`, `/api/cron/cleanup` | Bearer CRON_SECRET |
| GET/POST | `/api/calendar/google/connect`, `/callback`, `/disconnect` | owner (P9) |

**Key request/response contracts:**

```text
POST /api/auth/register
  in:  { name, email, password, businessName, timezone?, currency? }
  out: 201 { user, business } | 400 VALIDATION_ERROR | 409 CONFLICT (email/slug taken)

GET /api/public/[slug]/slots?serviceId=&staffId=&date=YYYY-MM-DD
  out: 200 { timezone, slots: [{ startAt: ISO UTC, label: '10:00 AM' }] } | 404 NOT_FOUND

POST /api/public/[slug]/bookings
  in:  { serviceId, staffId?, startAt ISO, name, email, phone }
  out: 201 { bookingId, startAt, manageUrl } | 409 SLOT_TAKEN | 429 RATE_LIMITED
  (P8 deposit flow: response gains checkoutUrl? and booking starts pending)

POST /api/webhooks/stripe   (raw body; signature verified)
  out: 200 { received: true } | 400 bad signature | 503 STRIPE_NOT_CONFIGURED

GET /api/cron/reminders | /api/cron/cleanup
  out: 200 { processed: number } | 401 UNAUTHORIZED
```

---
## 7. Phases, tasks, acceptance

> Phases are strictly ordered: P0 → P1 → … → P11.

### Phase 0 — Bootstrap
Depends on: —
**Phase status:** done (2026-10-16, Copilot)

- [x] P0-T1 Write `PLAN.md` (this file) — @main
- [x] P0-T2 Create `.env.example` (§4); git-add the spec file `BookKeep Full Project Specification.md`
- [x] P0-T3 Migrate to `src/` layout: `app/` → `src/app/`; `tsconfig.json` → `"@/*": ["./src/*"]`; verify `yarn dev` still renders
- [x] P0-T4 Add scripts (§4) to `package.json`
- [x] P0-T5 Add PLAN.md pointer to `AGENTS.md` (outside the nextjs-agent-rules block — never edit inside it)
- [x] P0-T6 Replace default home page content with a temporary BookKeep placeholder (real landing in P11-T5)

Acceptance: `yarn dev`, `yarn lint`, `yarn typecheck` all pass after the `src/` move.

### Phase 1 — Foundation: DB, models, auth, dashboard shell
Depends on: P0
**Phase status:** done (2026-10-16, Copilot)

- [x] P1-T1 Install deps: `mongoose zod bcryptjs luxon next-auth @tanstack/react-query react-hook-form @hookform/resolvers`; dev: `vitest vite-tsconfig-paths mongodb-memory-server tsx @types/luxon @types/bcryptjs`; `npx shadcn@latest init` + components: button input label card dialog select textarea badge table tabs dropdown-menu sonner form skeleton avatar switch popover sheet tooltip (verify Next 16 peer deps; record issues in §8)
- [x] P1-T2 `src/lib/db.ts` — Mongoose connection cached on `globalThis` (spec §13 warning)
- [x] P1-T3 Models `src/models/{user,business,service,staff,customer,booking,invoice}.ts` per §5 incl. **all indexes**; export from `src/models/index.ts`
- [x] P1-T4 `src/lib/validators/*.ts` — Zod schemas: auth, business, service, staff, booking, invoice (shared by API + forms)
- [x] P1-T5 `src/lib/api.ts` — `jsonError()`, `parseJsonBody()`, `handleMongoError()` (11000 → 409 SLOT_TAKEN)
- [x] P1-T6 `src/lib/auth.ts` — NextAuth Credentials (bcrypt compare, generic errors), JWT callbacks embed `userId/role/businessId/staffProfileId`; `requireRole()` for route handlers
- [x] P1-T7 `src/lib/session.ts` — `getCurrentUser()` with `'use cache: private'`; `requireUser()` that redirects
- [x] P1-T8 `src/proxy.ts` — matcher `/dashboard/:path*`: no session cookie → redirect `/login`; also bounce logged-in users off `/login` and `/register`
- [x] P1-T9 APIs: `POST /api/auth/register` (owner + business, slugify + uniqueness, default bookingRules per spec §4), `/api/auth/[...nextauth]`
- [x] P1-T10 UI: `/login`, `/register` (RHF+Zod, generic auth errors); root layout metadata/fonts
- [x] P1-T11 `src/app/dashboard/layout.tsx` — auth gate (getCurrentUser + Suspense per Cache Components), role-aware sidebar (links per §6), topbar with sign-out
- [x] P1-T12 `/dashboard` placeholder page
- [x] P1-T13 Vitest setup: `vitest.config.mts` (vite-tsconfig-paths, node env), `tests/helpers/memory-mongo.ts` (mongodb-memory-server + models + syncIndexes)
- [x] P1-T14 Tests: register → login → session contains businessId; passwordHash absent from every auth response

Acceptance: `yarn test` green; anonymous `/dashboard` redirects to `/login`; owner sees dashboard shell.

### Phase 2 — Services & staff CRUD + working hours
Depends on: P1
**Phase status:** done (2026-10-16)

- [x] P2-T1 API services: `GET/POST /api/services`, `GET/PATCH/DELETE /api/services/[id]` (DELETE = `isActive:false`), tenant-scoped, Zod, integer prices
- [x] P2-T2 API staff: `GET/POST /api/staff`, `PATCH /api/staff/[id]` (weeklyHours, daysOff, isActive) — staff role may PATCH only own profile
- [x] P2-T3 `POST /api/staff/invite` (owner): create Staff + User (role staff, random temp password), email invite via `lib/email` (console stub without key), link `staffProfileId`
- [x] P2-T4 `src/lib/email.ts` — Resend wrapper + `src/emails/` React Email templates (start with StaffInvite); console transport when no `RESEND_API_KEY`
- [x] P2-T5 `/dashboard/services` — table + create/edit dialog (duration, buffer, price, staff multi-select, active toggle); TanStack Query mutations + invalidation
- [x] P2-T6 `/dashboard/staff` — list, invite dialog, **weekly hours editor** (7 weekdays, add/remove ranges, HH:mm inputs), days-off editor (date + reason); holidays are full days-off entries
- [x] P2-T7 `/dashboard/availability` — staff self-service hours editor (own profile only)
- [x] P2-T8 Tests: tenant isolation (A cannot read/PATCH B's service/staff → 404); staff cannot PATCH another staff

Acceptance: full CRUD works in UI; invite email logs/flows; isolation tests green.

---
### Phase 3 — Availability engine + public pages
Depends on: P2
**Phase status:** done (2026-10-17)

- [x] P3-T1 `src/lib/time.ts` — Luxon helpers: date-in-TZ → UTC range bounds, weekday lookup, label formatting, slot-grid iteration, DST-safe arithmetic
- [x] P3-T2 `src/lib/availability.ts` — **pure** `getSlots(input): Slot[]` implementing spec §7 steps 1–6 (no DB, no globals): working ranges for weekday → daysOff/override → grid candidates fitting `duration+buffer` → minNotice/maxDaysAhead filter → overlap removal → `{ startAt ISO, label }`
- [x] P3-T3 `tests/unit/availability.test.ts` — ≥20 cases: empty hours, multi-range day, buffer pushes past range end, interval 15/30, days-off blocks, custom hours override on a day-off, min-notice boundary, max-days-ahead, existing booking overlap (pending+confirmed block; cancelled does not), **Asia/Dhaka** (no DST) and **America/New_York** (Jan vs Jul, DST transition day)
- [x] P3-T4 `GET /api/public/[slug]` → `{ business: {name,slug,timezone,currency,phone,address,logoUrl}, services: [active], staff: [active] }` | 404
- [x] P3-T5 `GET /api/public/[slug]/slots` → §6 contract; rate-limited; validates service/staff belong to the slug's business
- [x] P3-T6 `/b/[slug]` page — server component (`use cache` + `cacheLife('minutes')`): header, service cards (name, description, duration, price formatted in business currency/TZ), staff avatars, Book now → wizard; 404 for unknown slug
- [x] P3-T7 `/b/[slug]/book` wizard steps 1–3 — service → staff (incl. Any available: union of slots across eligible staff, pin staffId at booking time) → date picker (bounded by maxDaysAhead) → time grid from `/slots`, with loading/disabled states

Acceptance: unit suite green; slots endpoint verified against a manually inserted booking in an integration test.

### Phase 4 — Booking creation, manage page, emails
Depends on: P3
**Phase status:** done (2026-10-17)

- [x] P4-T1 `src/lib/booking.ts` — `buildSlotKeys()` (§5 rule), `createBooking()` (find-or-create Customer by email/phone per business; generate 32-byte token, store sha256; conflict-safe insert, 11000 → SLOT_TAKEN; autoConfirm logic), `cancelBooking()` (enforce cancelWindowHours), `rescheduleBooking()` (validate new slot, free old keys + insert new atomically), `expirePendingBookings()` (used by cron)
- [x] P4-T2 `POST /api/public/[slug]/bookings` → §6 contract; rate-limited; server-side price from Service → `priceSnapshot`; confirmation email dispatched
- [x] P4-T3 Public token APIs: `GET /api/public/bookings/[token]`, `POST .../cancel`, `POST .../reschedule` (new startAt re-validated; token matched by hash)
- [x] P4-T4 Email templates: `BookingConfirmation`, `BookingReminder`, `BookingCancelled` (React Email, EN strings; BN added in P10)
- [x] P4-T5 Wizard steps 4–5 — details form (name/email/phone, RHF+Zod) → POST → success screen showing **manage link** (token kept in sessionStorage for refresh); email sent (console stub without key)
- [x] P4-T6 `/booking/[token]` — booking details displayed in business timezone (with TZ note), status badge, cancel (disabled outside window with explanation), reschedule flow (date+time picker hitting public /slots), cancelled/not-found states
- [x] P4-T7 Integration tests `tests/integration/booking-conflict.test.ts` — two concurrent `createBooking` for the same slot: exactly one succeeds, one 409; cancel then rebook succeeds; reschedule frees old keys (+ `tests/integration/booking-flow.test.ts` HTTP flow)

Acceptance: end-to-end customer flow manually verified; conflict tests green.

### Phase 5 — Dashboard: bookings, calendar, customers, summary
Depends on: P4
**Phase status:** done (2026-10-17)

- [x] P5-T1 `GET/POST /api/bookings` — filters `status, from, to, staffId, q`; **staff scoping**; POST = manual booking (`source:'manual'`, same conflict-safe path)
- [x] P5-T2 `GET/PATCH /api/bookings/[id]` — PATCH: status transitions (confirm, complete, no_show, cancel) and reschedule with slot validation; role guards
- [x] P5-T3 `GET /api/dashboard/summary` → `{ today: { total, pending, confirmed, completed, cancelled }, revenue: { today, month }, noShowRate }`
- [x] P5-T4 `GET /api/customers`, `GET /api/customers/[id]` → profile + booking history + total spent (owner-only)
- [x] P5-T5 `/dashboard/bookings` — filter bar (status, date range, staff), search box, status badges, empty/loading states, row click → detail
- [x] P5-T6 `/dashboard/bookings/[id]` — full detail, status action buttons, inline reschedule, customer block, Create invoice CTA (wired in P6 — disabled until then)
- [x] P5-T7 `/dashboard/bookings/new` — manual booking form (service → staff → date/time, customer search-or-create, source manual)
- [x] P5-T8 `/dashboard/calendar` — week view default (business-hours rows, 7 day columns, bookings positioned by time), day + month modes, staff filter, click → detail
- [x] P5-T9 `/dashboard` — real home: today's bookings (list + counts), revenue summary cards, upcoming next 7 days (uses summary + bookings endpoints)
- [x] P5-T10 `/dashboard/customers` (search) + `/dashboard/customers/[id]` (history, editable notes, total spent)
- [x] P5-T11 Integration test: staff role gets only own bookings from `GET /api/bookings` (`tests/integration/booking-dashboard.test.ts`)

Acceptance: owner and staff roles both usable; filters/scoping verified; tests green.

---
### Phase 6 — Invoices, PDF, Stripe, settings
Depends on: P5
**Phase status:** done (2026-10-17)
Deps installed: `stripe@^23` `@react-pdf/renderer@^4.9` (peer deps include React 19 — §8 item 2); `@react-pdf/renderer` + `stripe` added to `serverExternalPackages` in `next.config.ts`.

- [x] P6-T1 `src/lib/invoice.ts` — `nextInvoiceNumber()` via `findOneAndUpdate({_id: businessId}, {$inc: {invoiceCounter: 1}})` atomic; `createInvoiceFromBooking()` (line items from service + `priceSnapshot`, tax from business settings, totals); `publicToken` generation
- [x] P6-T2 APIs — `GET/POST /api/invoices` (POST from bookingId, owner, booking completed/confirmed), `GET/PATCH /api/invoices/[id]` (draft edits only), `POST .../send` (emails public link, status → sent), `GET .../pdf` (streams application/pdf)
- [x] P6-T3 `src/lib/pdf.tsx` — `InvoiceDocument` (@react-pdf/renderer): business header/logo, invoice number, customer, line items, totals, booking ref, currency
- [x] P6-T4 `/invoice/[publicToken]` — public view (business TZ/currency), status states, Pay button → checkout; paid state with paid date
- [x] P6-T5 `POST /api/invoices/public/[token]/checkout` — creates Stripe Checkout Session (line items, `currency` from business, `metadata: { invoiceId }`, success/cancel URLs back to the public invoice); no key → 503 `STRIPE_NOT_CONFIGURED`
- [x] P6-T6 `POST /api/webhooks/stripe` — **raw body** signature verify (`constructEvent`); on `checkout.session.completed`: find invoice by metadata/stripeSessionId → if already `paid` **no-op (idempotent)** else set `status:'paid'`, `paidAt`, booking `paymentStatus:'paid'` (P8 also confirms deposit bookings); other events → 200 ignored; 400 on bad signature
- [x] P6-T7 `PATCH /api/business` + `/dashboard/settings` — profile form (name, slug with uniqueness feedback, timezone select, currency, phone, address, logoUrl), booking rules form (minNoticeHours, maxDaysAhead, cancelWindowHours, slotIntervalMinutes), autoConfirm toggle, deposit settings (fields exist; **activation in P8**), notifications (reminder hours ahead, default channel), payments panel (Stripe key configured? webhook secret set?)
- [x] P6-T8 `/dashboard/invoices` (paid/unpaid/void filters) + `/dashboard/invoices/[id]` (view, edit draft line items, Send, Download PDF)
- [x] P6-T9 Wire Create invoice CTA on booking detail → POST /api/invoices → navigate to new invoice
- [x] P6-T10 Tests: webhook idempotency (same signed event twice → one paid transition, booking updated once); invoice number uniqueness (10 parallel increments → 10 distinct numbers); tenant isolation on invoices

Acceptance: PDF renders; with Stripe test keys the full pay flow works; without keys → 503 + sensible UI; tests green.

### Phase 7 — Cron, rate limiting, security pass
Depends on: P6
**Phase status:** todo

- [ ] P7-T1 `GET /api/cron/reminders` — Bearer CRON_SECRET; bookings starting ~24h from now (now+23h…now+25h), status `confirmed|pending`, per-channel reminder stamp null → send via `lib/notify` → stamp; returns `{ processed }`; idempotent
- [ ] P7-T2 `GET /api/cron/cleanup` — cancel `pending` bookings older than 15 min **without deposit checkout** (deposit-pending: expire at 24h, P8 rule); sets `cancelledAt` + reason; slots freed via partial index
- [ ] P7-T3 `vercel.json` crons (§4)
- [ ] P7-T4 `src/lib/rate-limit.ts` — `@upstash/ratelimit` when env present else in-memory sliding window (Map + periodic sweep); apply to: `POST /api/public/[slug]/bookings` (10/min/IP), `/slots` (60/min/IP), register + signin (10/min/IP)
- [ ] P7-T5 Security audit pass — checklist executed and recorded here: all routes Zod-validated; grep test asserting `passwordHash|manageTokenHash|invite.tokenHash` never in any API JSON; `requireRole` on every owner-only route; generic auth failure messages; webhook signature verified; cron secret enforced; proxy matcher covers `/dashboard/:path*`; no prices trusted from client; rate limits live
- [ ] P7-T6 `tests/integration/tenant-isolation.test.ts` — **every collection**: business A vs B ids → 404/403 for bookings, services, staff, customers, invoices, summary, business PATCH; cron → 401 without secret

Acceptance: curl cron without header → 401; with secret → 200; suite green; audit checklist checked in this file.

### Phase 8 — Stretch: deposits + recurring bookings
Depends on: P4, P6
**Phase status:** todo

- [ ] P8-T1 Deposit flow — `bookingRules.depositEnabled/depositPercent` (settings UI from P6 now functional): wizard shows Pay X% deposit (amount) to confirm; `createBooking` computes `depositAmount`, creates booking `pending`; response gains `checkoutUrl` (Stripe Checkout for the deposit, metadata `{ bookingId, kind: 'deposit' }`); webhook with `kind: 'deposit'` → booking `confirmed`, `paymentStatus:'paid'` (deposit); balance collected later via invoice
- [ ] P8-T2 Manage page deposit state — pending shows Awaiting payment + Pay button (checkout via token endpoint); **cleanup rule**: deposit-pending expire after 24h (non-deposit pending after 15 min) — implemented in `expirePendingBookings`, documented in its docstring
- [ ] P8-T3 Recurring bookings — `recurrence { freq: 'weekly'|'monthly', interval, count }` on Booking, shared `seriesId`; `createBookingSeries()` in lib/booking.ts: pre-validate **all** occurrences against availability, bulk insert `ordered:false`; if any 11000 → delete docs inserted by this attempt → 409 SLOT_TAKEN (all-or-nothing); offered in wizard step 5 + manual booking (repeat N times)
- [ ] P8-T4 Manage page series controls — Cancel this booking vs Cancel all N (seriesId query, same token)
- [ ] P8-T5 Tests: deposit state machine (pending → confirmed via simulated webhook; cleanup timing); series atomicity (conflict in occurrence 3 → zero bookings persisted); series cancel frees all slots

Acceptance: deposit end-to-end with Stripe test key; series conflict test green.

---
### Phase 9 — Stretch: Google Calendar sync + WhatsApp/SMS
Depends on: P4, P7
**Phase status:** todo

- [ ] P9-T1 `src/lib/google-calendar.ts` + routes `/api/calendar/google/connect|callback|disconnect` — OAuth 2.0 offline access (googleapis), refresh token **encrypted** (AES-256-GCM) on `Business.googleCalendar`; booking create/confirm/reschedule/complete/cancel → create/update/delete calendar event (`googleEventId` stored); env-gated, failures logged (never block a booking)
- [ ] P9-T2 `src/lib/notify.ts` — `sendNotification({ channel, template, to, vars })` dispatching: `email` (Resend), `sms` (Twilio), `whatsapp` (Twilio); text templates for sms/whatsapp; single point used by confirmation/reminder/cancellation/invoice/invite (refactor P2 email calls to it)
- [ ] P9-T3 Channel preference — `Customer.preferredChannel` + opt-in checkbox on booking form (default email; sms/whatsapp options shown when business has Twilio); `Business.notify.defaultChannel`; settings UI toggles
- [ ] P9-T4 Reminder cron per channel — per-channel stamps (`emailReminderSentAt`, `smsReminderSentAt`, `whatsappReminderSentAt`); cron sends on enabled channels where stamp is null; confirmation also dispatched on preferred channel
- [ ] P9-T5 Settings UI — Connect Google Calendar button (hidden without creds), channel status indicators (email/SMS/WhatsApp configured?)
- [ ] P9-T6 Tests: notify dispatcher routing + per-channel stamp idempotency (unit); calendar sync with mocked client (event created on booking create); creds absent → logged no-op

Acceptance: booking creates a calendar event with creds; without creds nothing crashes; reminders per channel never duplicate.

### Phase 10 — Stretch: analytics + EN/BN multi-language
Depends on: P5 (analytics), all UI phases (i18n)
**Phase status:** todo

- [ ] P10-T1 `GET /api/dashboard/analytics?from=&to=` — aggregation pipelines: revenue by day (paid invoices), bookings by status/service/staff, no-show rate, utilization (booked vs working hours), AOV, deltas vs previous period
- [ ] P10-T2 `/dashboard/analytics` + sidebar link — date presets 7/30/90 days + custom range; KPI cards; **recharts** via shadcn/ui Chart: revenue line, bookings-by-service bar, status pie; loading/empty states; owner-only
- [ ] P10-T3 i18n foundation — install `next-intl`; `src/i18n/{en,bn}.json` dictionaries; routing with `localePrefix: 'as-needed'` (default locale keeps **bare URLs** per §6); locale handling integrated into `src/proxy.ts` per next-intl + Next 16 docs; language switcher (topbar + footer) persisting locale cookie
- [ ] P10-T4 Route restructure — move public + dashboard routes under `src/app/[locale]/...`; locale-aware internal links; verify proxy auth + locale coexist (read next-intl and bundled Next 16 proxy docs before coding)
- [ ] P10-T5 Translate everything — nav, forms, validation messages, status labels, empty states, marketing pages, booking wizard, manage page, invoice page, **email templates** (template lang from business/customer locale); locale-aware date/currency/number formatting via Intl
- [ ] P10-T6 Tests — dictionary key-parity (`en` vs `bn`, CI fails on missing keys); analytics endpoint shape; smoke: `/bn/dashboard` renders

Acceptance: `/` and `/b/slug` unchanged for EN; `/bn/...` fully Bangla; charts render with seed data; parity test green.

### Phase 11 — E2E, seed, CI, README, deploy
Depends on: P0–P10
**Phase status:** todo

- [ ] P11-T1 Playwright — `playwright.config.ts` (webServer: dev or build+start), `tests/e2e/booking-flow.spec.ts`: anonymous → `/b/<slug>` → wizard → book → manage link → cancel; owner login → dashboard → sees cancelled booking; second spec: invoice create → public view (Pay button present; checkout step skipped without Stripe keys)
- [ ] P11-T2 `scripts/seed.ts` (`yarn seed`) — idempotent: demo owner `demo@bookkeep.app` (password in README), business **Glow Salon** (Asia/Dhaka, BDT, default bookingRules), 4 services, 3 staff with weekly hours + one day off, 8 customers, ~25 bookings across past/future (mixed statuses, valid slotKeys!), 5 invoices (1 paid); reuses app model code
- [ ] P11-T3 CI — `.github/workflows/ci.yml`: lint → typecheck → unit+integration (mongodb-memory-server) → `yarn build`; cache yarn + mongod binary; e2e job on main/nightly only
- [ ] P11-T4 README (spec §18 checklist) — problem paragraph; screenshot/GIF placeholders; demo link + demo login; architecture mermaid (spec §3); **Problems I solved**: DB-enforced slot uniqueness via unique multikey partial index, UTC storage + business-TZ display, session-scoped tenant isolation, idempotent signature-verified webhooks, cron-route handlers vs worker (+ what changes at scale); stack, setup, env table, tests; known limitations; next steps
- [ ] P11-T5 Real landing `/` + `/pricing` replacing the P0 placeholder (features grid, how-it-works, CTA to `/register`, static pricing tiers)
- [ ] P11-T6 Deploy checklist — Vercel env vars set; Stripe webhook endpoint → `/api/webhooks/stripe` (signing secret); Atlas network access; crons verified via curl with Bearer CRON_SECRET; seed run against target; smoke on prod URL
- [ ] P11-T7 Final regression — full suite + manual script: register → setup services/staff → book → confirm → complete → invoice → PDF → pay → reminder cron → analytics → Bangla locale

Acceptance: CI green on push; README matches spec §18; deployed URL reachable.

## 8. Risks & fallbacks (record decisions here)

1. **next-auth@5 beta vs Next 16** — verify peer deps at P1-T1 install. Fallback: `src/lib/auth-jose.ts` (jose-signed HTTP-only cookie) exposing the same `getCurrentUser`/`requireRole` surface; swap inside `lib/auth.ts` only. → **Decision:** ______
2. **@react-pdf/renderer vs React 19** — verify at P6-T1. Fallback: `pdf-lib` programmatic generation. → **Decision:** keep `@react-pdf/renderer@^4.9` — its `peerDependencies.react` includes `^19.0.0`; `renderToBuffer` produces a valid PDF both via native ESM `import` and Node's `require(esm)`, so it works in Route Handlers. Listed in `serverExternalPackages` to keep its internal ESM (yoga-layout/fontkit) out of the bundle.
3. **next-intl route restructure (P10-T4)** is the riskiest UI change — do it last, after all pages exist; `as-needed` prefix keeps spec URLs stable.
4. **mongodb-memory-server** downloads a mongod binary on first run — cache in CI; document offline limitation.
5. **External credentials unavailable** — everything gated by §3.6; e2e payment steps conditionally skip when no Stripe key.
6. **Availability regressions** — never edit `lib/availability.ts` without running `tests/unit/availability.test.ts`.
7. **Model index specs (P4)** — MongoDB rejects mixing `sparse: true` with `partialFilterExpression`. Fixed `bookings.slotKeys` (unique partial on `status in [pending,confirmed]`) and `customers.phone` (unique partial on `{ phone: { $type: "string" } }`, since `$ne: null` is also unsupported in partial filters). `tests/helpers/memory-mongo.ts` now runs `syncIndexes()` so the double-booking index is real in tests. → **Decision:** partialFilterExpression only, no `sparse`.
8. **Dashboard scope decisions (P5)** — (a) `GET /api/bookings` staff scoping forces `staffId = session.staffProfileId`; POST manual bookings likewise pin staff callers to their own profile. (b) Summary **revenue** = sum of `priceSnapshot` for `completed` bookings (today / current month, business TZ); P10 switches analytics to paid invoices once P6 exists. `noShowRate` = `no_show / (completed + no_show)` over the trailing 30 days. (c) Customer reads (`GET /api/customers`, `[id]`) are owner-only per spec §5; the `[id]` payload now includes `totalSpent` + booking history. (d) Two session-scoped helper endpoints were added beyond §6's list: `GET /api/business` (dashboard TZ/currency; P6-T7 adds PATCH) and `GET /api/slots` (dashboard availability for manual booking + reschedule, mirroring the public slots route). → **Decision:** revenue from completed bookings until P6; helpers allowed.
9. **Invoice decisions (P6)** — (a) Public invoice view is **server-rendered** from `getInvoiceByPublicToken` (no extra public GET route; §6 only lists the checkout POST). (b) `createInvoiceFromBooking` is idempotent per booking: an existing non-void invoice is returned instead of creating a duplicate. (c) `PATCH /api/invoices/[id]` accepts draft `lineItems` (totals recomputed from the business `taxRatePercent`) and a `void` transition; paid invoices are immutable. (d) The webhook is idempotent via a conditional `findOneAndUpdate({ status: { $ne: 'paid' } })` — only the first transition flips the invoice and its booking. (e) Invoice model keeps `publicToken` in plaintext (it is the URL secret) rather than a hash; it is not a credential and P7's secret-grep test targets `passwordHash`/`manageTokenHash`/`invite.tokenHash`. (f) The public `/invoice/[publicToken]` and the `.../checkout`+`/api/webhooks/stripe` routes stay unauthenticated/rate-limited by P7. → **Decision:** as above.

## 9. Definition of Done (global)

- [ ] `yarn lint` · `yarn typecheck` · `yarn test` pass at every phase boundary
- [ ] `yarn build` passes (checked at P11 and after any structural change)
- [ ] Every API: Zod-validated, tenant-scoped, error-envelope, matches §6
- [ ] No `passwordHash` / token hashes / secrets in any response (grep test)
- [ ] All §7 checkboxes updated; decisions recorded in §8
- [ ] Spec coverage proven: MVP 10 + stretch 6 all demonstrably working (P11-T7 script)

---

*End of PLAN.md.*
