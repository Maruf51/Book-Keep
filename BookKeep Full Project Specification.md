# BookKeep: Full Project Specification

A booking and invoicing SaaS for small service businesses, built with **Next.js (App Router) and MongoDB**, with no separate Node/Express server.

## 1. What the Product Does

Small businesses such as salons, tutors, clinics, and repair shops take bookings through WhatsApp and track payments in notebooks. BookKeep gives each business:

- A **public booking page** (`/b/<business-slug>`) where customers pick a service, staff member, date and time without creating an account.
- A **dashboard** where the owner manages services, staff, working hours, bookings, customers and invoices.
- **Automatic emails** for confirmation and reminders.
- **Invoices** (PDF) generated from completed bookings, with online payment through Stripe (or SSLCommerz/bKash for Bangladesh).

### Users and roles

| Role | Who | Can do |
| --- | --- | --- |
| Owner | Creates the business account | Everything, including staff, settings, payments, invoices |
| Staff | Invited by owner | See and manage own bookings and own availability |
| Customer | Public visitor, no login | Book, view, and cancel their own booking via a secure link |

## 2. Core Features

**MVP (must have)**

1. Owner registration, login, and business setup (name, slug, timezone, currency).
2. Services (name, duration, price, buffer time, active or hidden).
3. Staff members and weekly working hours, plus days off and holidays.
4. Public booking page with real-time slot availability.
5. Double-booking prevention, guaranteed at the database level.
6. Booking confirmation and reminder emails.
7. Dashboard: today's bookings, calendar view, bookings list with filters.
8. Customers list with booking history.
9. Invoices: create from a booking, PDF download, mark paid.
10. Online payment through Stripe Checkout with webhook confirmation.

**Stretch (pick 1 or 2)**

- Deposit at booking time (pay 30 percent to confirm)
- Recurring bookings
- Google Calendar sync
- WhatsApp or SMS reminders
- Revenue analytics charts
- Multi-language (English and Bangla)

## 3. Architecture

```
Browser (customer or owner)
   |
   v
Next.js app on Vercel
   |-- Server Components / pages   (render UI, read data on the server)
   |-- Route Handlers  /api/*      (REST API, webhooks, cron)
   |-- Middleware                  (protect /dashboard, role checks)
   |
   +--> MongoDB Atlas   (Mongoose models)
   +--> Stripe          (Checkout + webhooks)
   +--> Resend          (email)
   +--> Vercel Cron     (reminders and cleanup)
```

### Tech choices

| Concern | Choice | Why |
| --- | --- | --- |
| Framework | Next.js 14+ App Router, TypeScript | UI and API in one project |
| Database | MongoDB Atlas with Mongoose | Flexible schema, a free tier, and transactions on Atlas |
| Auth | Auth.js (NextAuth) with Credentials and optional Google | Sessions, JWT, middleware support |
| Validation | Zod | One schema for client forms and API input |
| UI | Tailwind CSS and shadcn/ui | Fast, clean dashboard |
| Forms and data | React Hook Form, TanStack Query for client data | Good UX on the dashboard |
| Dates and timezones | Luxon (or date-fns-tz) | Correct timezone math |
| Email | Resend and React Email | Simple transactional email |
| Payments | Stripe Checkout and webhooks | Standard, well documented |
| PDF | @react-pdf/renderer | Invoices from a React component |
| Background work | Vercel Cron hitting `/api/cron/*` | No separate worker server needed |
| Tests | Vitest (logic), Playwright (end-to-end) | Covers the risky parts |

### Server Actions vs API routes

Use **Route Handlers** for anything external or public (booking API, webhooks, cron, invoice PDF) because they show REST design clearly. Use **Server Actions** for simple dashboard form submissions if you want. Pick one style and stay consistent.

## 4. Data Model (MongoDB Collections)

Every business-owned document carries `businessId`. **Every query must filter by `businessId` taken from the session**, never from the request body. This is what keeps one business from seeing another's data.

### users

| Field | Type | Notes |
| --- | --- | --- |
| \_id | ObjectId |  |
| email | string | unique, lowercase |
| passwordHash | string | bcrypt, never returned by the API |
| name | string |  |
| role | `owner` or `staff` |  |
| businessId | ObjectId | ref businesses |
| staffProfileId | ObjectId | optional link to staff |
| createdAt | Date |  |

### businesses

| Field | Type | Notes |
| --- | --- | --- |
| \_id | ObjectId |  |
| name | string |  |
| slug | string | unique, used in `/b/<slug>` |
| timezone | string | for example `Asia/Dhaka` |
| currency | string | for example `BDT`, `USD` |
| phone, address, logoUrl | string | shown on the booking page and invoices |
| bookingRules | object | `minNoticeHours`, `maxDaysAhead`, `cancelWindowHours`, `slotIntervalMinutes` |
| stripeAccountId | string | optional, if using Stripe Connect |
| invoiceCounter | number | atomic counter for invoice numbers |

### services

| Field | Type | Notes |
| --- | --- | --- |
| businessId | ObjectId | indexed |
| name, description | string |  |
| durationMinutes | number |  |
| bufferMinutes | number | cleanup time after the service |
| price | number | stored in the smallest unit (cents or paisa) |
| staffIds | ObjectId\[\] | who can perform it |
| isActive | boolean | hidden services are not bookable |

### staff

| Field | Type | Notes |
| --- | --- | --- |
| businessId | ObjectId | indexed |
| name, photoUrl | string |  |
| weeklyHours | array | `{ weekday: 0-6, ranges: [{ start: '09:00', end: '17:00' }] }` |
| daysOff | array | `{ date: 'YYYY-MM-DD', reason }` and custom hours overrides |
| isActive | boolean |  |

### customers

| Field | Type | Notes |
| --- | --- | --- |
| businessId | ObjectId | indexed |
| name, email, phone | string | unique per business on email or phone |
| notes | string | owner-only notes |
| createdAt | Date |  |

### bookings

| Field | Type | Notes |
| --- | --- | --- |
| businessId, serviceId, staffId, customerId | ObjectId |  |
| startAt, endAt | Date | **stored in UTC** |
| status | enum | `pending`, `confirmed`, `completed`, `cancelled`, `no_show` |
| slotKeys | string\[\] | for example `staffId_2026-10-20T10:00` (see section 6) |
| manageTokenHash | string | hash of the secret in the customer's email link |
| priceSnapshot | number | price at booking time, so later edits don't change old bookings |
| paymentStatus | enum | `unpaid`, `paid`, `refunded` |
| source | enum | `online` or `manual` |
| reminderSentAt | Date | prevents duplicate reminders |
| createdAt, cancelledAt | Date |  |

### invoices

| Field | Type | Notes |
| --- | --- | --- |
| businessId, bookingId, customerId | ObjectId |  |
| number | string | for example `INV-2026-0042`, unique per business |
| lineItems | array | `{ description, qty, unitPrice }` |
| subtotal, tax, total | number | smallest currency unit |
| status | enum | `draft`, `sent`, `paid`, `void` |
| stripeSessionId, paidAt | string, Date | filled by the webhook |
| publicToken | string | for the public pay or view link |

### Indexes

```
users:     { email: 1 } unique
businesses:{ slug: 1 } unique
services:  { businessId: 1, isActive: 1 }
bookings:  { businessId: 1, startAt: 1 }
bookings:  { staffId: 1, startAt: 1 }
bookings:  { slotKeys: 1 } unique, partial where status in [pending, confirmed]
invoices:  { businessId: 1, number: 1 } unique
customers: { businessId: 1, email: 1 }
```

## 5. Page Routes (UI)

### Public

| Route | Purpose |
| --- | --- |
| `/` | Landing page: what BookKeep does, features, call to action |
| `/pricing` | Plans (can be static) |
| `/login`, `/register` | Auth pages |
| `/b/[slug]` | Public business page: services list and staff |
| `/b/[slug]/book` | Booking wizard: service, staff, date, time, details, confirm |
| `/booking/[token]` | Customer manage page: view, cancel, reschedule |
| `/invoice/[publicToken]` | Public invoice view with a Pay button |

### Dashboard (protected by middleware)

| Route | Purpose | Roles |
| --- | --- | --- |
| `/dashboard` | Today's bookings, revenue summary, upcoming list | owner, staff |
| `/dashboard/calendar` | Day, week and month calendar of bookings | owner, staff |
| `/dashboard/bookings` | Table with filters (status, date, staff) and search | owner, staff |
| `/dashboard/bookings/[id]` | Detail: change status, reschedule, create invoice | owner, staff |
| `/dashboard/bookings/new` | Manual booking (walk-ins, phone bookings) | owner, staff |
| `/dashboard/services` | List, create, edit, hide services | owner |
| `/dashboard/staff` | Staff list, invite, working hours, days off | owner |
| `/dashboard/availability` | Own working hours and time off | staff |
| `/dashboard/customers` | Customer list and search | owner |
| `/dashboard/customers/[id]` | History, notes, total spent | owner |
| `/dashboard/invoices` | Invoice list with paid and unpaid filter | owner |
| `/dashboard/invoices/[id]` | View, edit draft, send, download PDF | owner |
| `/dashboard/settings` | Business profile, booking rules, payments, notifications | owner |

## 6. API Routes (Route Handlers)

All responses are JSON. Input is validated with Zod, and errors return `{ error: { code, message } }` with the right HTTP status (400, 401, 403, 404, 409, 429).

### Auth and account

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | none | Create owner and business |
| \* | `/api/auth/[...nextauth]` | none | Auth.js handlers (login, session) |
| POST | `/api/staff/invite` | owner | Create staff user and send invite email |

### Public booking API (no login, rate limited)

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/public/[slug]` | Business info, active services, staff |
| GET | `/api/public/[slug]/slots?serviceId=&staffId=&date=` | Available start times for a date |
| POST | `/api/public/[slug]/bookings` | Create a booking (returns 409 if the slot was just taken) |
| GET | `/api/public/bookings/[token]` | Booking details for the manage page |
| POST | `/api/public/bookings/[token]/cancel` | Cancel if inside the allowed window |
| POST | `/api/public/bookings/[token]/reschedule` | Move to a new available slot |

### Dashboard API (session required, scoped by businessId)

| Method | Path | Purpose |
| --- | --- | --- |
| GET, POST | `/api/services` | List and create |
| GET, PATCH, DELETE | `/api/services/[id]` | Read, update, deactivate |
| GET, POST | `/api/staff` | List and create staff profiles |
| PATCH | `/api/staff/[id]` | Update hours and days off |
| GET | `/api/bookings?status=&from=&to=&staffId=` | Filtered list (staff see only their own) |
| POST | `/api/bookings` | Manual booking |
| GET, PATCH | `/api/bookings/[id]` | Detail and status change |
| GET | `/api/customers`, `/api/customers/[id]` | List and detail |
| GET, POST | `/api/invoices` | List and create from a booking |
| GET, PATCH | `/api/invoices/[id]` | Read and edit a draft |
| POST | `/api/invoices/[id]/send` | Email the invoice link |
| GET | `/api/invoices/[id]/pdf` | Stream the PDF |
| GET | `/api/dashboard/summary` | Today's counts, revenue, no-show rate |
| PATCH | `/api/business` | Update settings and booking rules |

### Payments

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/invoices/public/[token]/checkout` | Create a Stripe Checkout session |
| POST | `/api/webhooks/stripe` | **Verify the signature**, then mark the invoice and booking paid |

### Cron (protected with `Authorization: Bearer CRON_SECRET`)

| Method | Path | Schedule | Purpose |
| --- | --- | --- | --- |
| GET | `/api/cron/reminders` | every 15 min | Email customers whose booking starts in about 24 hours and `reminderSentAt` is empty |
| GET | `/api/cron/cleanup` | hourly | Expire `pending` bookings older than 15 minutes (frees the slot) |

## 7. How Availability Works (the key algorithm)

When the customer picks a service, staff member and date, `GET /slots` does this:

1. Load the business, service and staff. Convert the requested date to the **business timezone** (Luxon).
2. Find the staff member's working ranges for that weekday. Apply a day off or hours override if one exists. No ranges means no slots.
3. Build candidate start times every `slotIntervalMinutes` (for example every 15 or 30 minutes) inside each range, where `start + duration + buffer` still fits before the range ends.
4. Remove candidates before `now + minNoticeHours`, and dates beyond `maxDaysAhead`.
5. Load that staff member's bookings for the day with status `pending` or `confirmed`. Remove any candidate whose time window overlaps one.
6. Return the remaining start times as ISO strings in UTC, plus a display label in the business timezone.

Put this logic in one **pure function** (`lib/availability.ts`) that takes plain data and returns slots. A pure function is easy to unit test, and the tests are good proof of quality in your README.

## 8. Preventing Double Bookings (the hard part)

Checking availability and then inserting is not safe: two customers can pass the check at the same moment. The fix is to let **MongoDB enforce it**.

When creating a booking, break its time into grid slots and store them:

```
slotKeys: [
  '665f..staff_2026-10-20T10:00',
  '665f..staff_2026-10-20T10:15',
  '665f..staff_2026-10-20T10:30'
]
```

Create a **unique multikey index on `slotKeys`** with a partial filter so only `pending` and `confirmed` bookings count. If two requests try to take any of the same slots, the second insert fails with a duplicate key error (code 11000). Catch it and return **409 Conflict** with a message like: that time was just taken, please choose another.

Cancelled bookings are excluded by the partial filter, so their slots become free again with no extra cleanup.

## 9. Booking Lifecycle

```
          create                  owner confirms / auto-confirm
(customer) ------> pending ----------------------------------> confirmed
                      |                                            |
                      | 15 min unpaid (cron)                       |-- service done --> completed --> invoice
                      v                                            |-- customer missed --> no_show
                  cancelled <--------------- cancel ---------------+
```

- With **auto-confirm** on, bookings start as `confirmed`.
- With **deposit required**, bookings start as `pending` until the Stripe webhook arrives, then become `confirmed`.
- The customer gets a `manage` link containing a random secret token. Only a **hash** of it is stored in the database.

## 10. Customer Booking Flow (step by step)

1. Customer opens `/b/<slug>` and sees the services.
2. Chooses a service, then a staff member (or Any available).
3. Chooses a date. The page calls `/slots` and shows time buttons.
4. Enters name, email and phone.
5. Submits. The server validates input, finds or creates the customer, inserts the booking (conflict-safe), and generates the manage token.
6. Customer sees a confirmation page and gets an email with the manage link.
7. 24 hours before, the cron job sends a reminder.

## 11. Invoice and Payment Flow

1. After a booking is `completed`, the owner clicks **Create invoice**. Line items are copied from the booking's service and `priceSnapshot`.
2. The invoice number comes from an **atomic counter**: `findOneAndUpdate({ _id: businessId }, { $inc: { invoiceCounter: 1 } })`. This avoids duplicate numbers.
3. The owner downloads the PDF or clicks **Send**, which emails `/invoice/<publicToken>`.
4. The customer opens the link and clicks **Pay**, which creates a Stripe Checkout session.
5. After payment, Stripe calls `/api/webhooks/stripe`. The handler **verifies the signature**, finds the invoice by session id, sets `status: paid` and `paidAt`, and marks the booking `paid`.
6. The webhook must be **idempotent**: if Stripe sends the same event twice, nothing breaks.

## 12. Authentication and Security

- Passwords hashed with bcrypt. Sessions through Auth.js (JWT containing `userId`, `role`, `businessId`).
- **Middleware** blocks `/dashboard/*` for anonymous users. A helper `requireRole(['owner'])` guards owner-only API routes.
- **Tenant isolation:** every query includes `businessId` from the session. Write a test that proves business A cannot read business B's booking.
- Staff can only read and edit bookings where `staffId` is their own.
- Rate limit public endpoints, especially `POST /bookings` (for example Upstash Ratelimit) to stop spam bookings.
- Validate every input with Zod, and return generic error messages for auth failures.
- Verify Stripe webhook signatures. Protect cron routes with `CRON_SECRET`.
- Never return `passwordHash` or token hashes. Never trust prices from the client; recalculate from the service.

## 13. Suggested Folder Structure

```
src/
  app/
    (marketing)/page.tsx, pricing/page.tsx
    (auth)/login/page.tsx, register/page.tsx
    b/[slug]/page.tsx, b/[slug]/book/page.tsx
    booking/[token]/page.tsx
    invoice/[token]/page.tsx
    dashboard/
      layout.tsx, page.tsx
      calendar/, bookings/, services/, staff/,
      availability/, customers/, invoices/, settings/
    api/
      auth/[...nextauth]/route.ts
      public/[slug]/route.ts, slots/route.ts, bookings/route.ts
      services/, staff/, bookings/, customers/, invoices/
      webhooks/stripe/route.ts
      cron/reminders/route.ts, cleanup/route.ts
  lib/
    db.ts            (cached Mongo connection, important on Vercel)
    auth.ts          (Auth.js config, requireRole helper)
    availability.ts  (pure slot logic)
    booking.ts       (create/cancel/reschedule, slotKeys)
    email.ts, stripe.ts, pdf.tsx, rate-limit.ts
    validators/      (Zod schemas)
  models/            (Mongoose: User, Business, Service, Staff,
                      Customer, Booking, Invoice)
  components/        (ui, booking-wizard, calendar, tables)
  middleware.ts
tests/
  availability.test.ts, booking-conflict.test.ts, tenant-isolation.test.ts
  e2e/booking-flow.spec.ts
```

**Important Next.js and MongoDB tip:** cache the Mongoose connection on `globalThis` in `lib/db.ts`, otherwise serverless functions open a new connection on every request and you can exhaust Atlas connection limits.

## 14. Environment Variables

```
MONGODB_URI=
NEXTAUTH_SECRET=
NEXTAUTH_URL=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
RESEND_API_KEY=
EMAIL_FROM=
CRON_SECRET=
APP_URL=
UPSTASH_REDIS_REST_URL=      (optional, rate limiting)
UPSTASH_REDIS_REST_TOKEN=
```

## 15. Testing Plan

| Type | What to test |
| --- | --- |
| Unit (Vitest) | Slot generation: working hours, buffers, days off, min notice, timezone edge cases, DST-free zone like Dhaka and one DST zone |
| Integration (Vitest and mongodb-memory-server) | Two simultaneous bookings for one slot: exactly one succeeds, the other gets 409 |
| Integration | Tenant isolation: business A gets 404 or 403 on business B's ids |
| Integration | Stripe webhook idempotency: the same event twice marks the invoice paid once |
| End-to-end (Playwright) | Customer books a slot, receives a manage link, cancels; owner logs in and sees the booking |
| CI | GitHub Actions runs lint, type-check and tests on every push |

## 16. Deployment

- **Vercel** for the app and cron jobs (`vercel.json` crons), **MongoDB Atlas** free cluster, **Stripe** in test mode, **Resend** free tier.
- Add the Stripe webhook endpoint in the Stripe dashboard, and set all environment variables in Vercel.
- Seed script (`npm run seed`) that creates a demo business, services and staff so reviewers can try it instantly. Put the demo login in the README.

## 17. Build Plan (6 to 8 weeks)

| Week | Goal |
| --- | --- |
| 1 | Project setup, Mongo connection, models, Auth.js, register and login, middleware, dashboard layout |
| 2 | Services and staff CRUD, working hours and days-off UI |
| 3 | `availability.ts` with unit tests, `/slots` API, public business page |
| 4 | Booking wizard, conflict-safe booking creation, customer manage page, emails |
| 5 | Dashboard bookings list and calendar, status changes, manual bookings, customers |
| 6 | Invoices, PDF, Stripe Checkout and webhook |
| 7 | Cron reminders and cleanup, rate limiting, security pass, tenant-isolation tests |
| 8 | Playwright test, polish, seed data, deploy, README and demo video |

## 18. README Checklist (what makes it stand out)

- One-paragraph problem statement and a screenshot or GIF of the booking flow
- Live demo link and demo login
- Architecture diagram (use section 3)
- A section titled **Problems I solved**: double-booking prevention with the unique multikey index, timezone handling, webhook idempotency, tenant isolation
- Tech stack, setup instructions, environment variables, and how to run tests
- Known limitations and what you would build next

## 19. Interview Talking Points

- Why the database enforces slot uniqueness instead of application-level checks alone
- How you stored time in UTC and displayed it in the business timezone
- How you scoped every query by `businessId` to isolate tenants
- Why webhooks must verify signatures and be idempotent
- Why you used cron route handlers instead of a separate worker, and what you would change at larger scale (a real queue)
- What you would do to scale: read replicas, caching public pages, a queue for emails
