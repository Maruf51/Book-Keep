import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";
import { startMemoryMongo, stopMemoryMongo } from "../helpers/memory-mongo";
import { buildRequest } from "../helpers/auth-mock";
import BusinessModel from "@/models/business";
import ServiceModel from "@/models/service";
import StaffModel from "@/models/staff";
import CustomerModel from "@/models/customer";
import BookingModel from "@/models/booking";
import InvoiceModel from "@/models/invoice";

/**
 * Phase 6 (PLAN P6-T1..T10): invoice creation/numbering, draft edits, sending,
 * PDF streaming, public token access, Stripe checkout gating, webhook
 * idempotency and tenant isolation — all through the real route handlers
 * against an in-memory MongoDB.
 */

const TZ = "Asia/Dhaka";

const authState = vi.hoisted(() => ({
  user: {
    id: "507f1f77bcf86cd799439010",
    businessId: "507f1f77bcf86cd799439011",
    role: "owner" as "owner" | "staff",
    staffProfileId: null as string | null,
  },
}));

vi.mock("@/lib/auth", () => ({
  requireRole: vi.fn(async (roles: Array<"owner" | "staff">) => {
    if (!roles.includes(authState.user.role)) {
      throw new Error("FORBIDDEN");
    }
    return { ...authState.user };
  }),
}));

const invoicesRoute = await import("@/app/api/invoices/route");
const invoiceItemRoute = await import("@/app/api/invoices/[id]/route");
const sendRoute = await import("@/app/api/invoices/[id]/send/route");
const pdfRoute = await import("@/app/api/invoices/[id]/pdf/route");
const checkoutRoute = await import("@/app/api/invoices/public/[token]/checkout/route");
const webhookRoute = await import("@/app/api/webhooks/stripe/route");
const { nextInvoiceNumber, getInvoiceByPublicToken } = await import("@/lib/invoice");

let businessId: string;
let serviceId: string;
let staffId: string;
let customerId: string;

function params(value: string) {
  return { params: Promise.resolve({ id: value }) } as never;
}

function tokenParams(token: string) {
  return { params: Promise.resolve({ token }) } as never;
}

function asOwner() {
  authState.user = {
    id: "507f1f77bcf86cd799439010",
    businessId,
    role: "owner",
    staffProfileId: null,
  };
}

function asStaff() {
  authState.user = {
    id: "507f1f77bcf86cd799439030",
    businessId,
    role: "staff",
    staffProfileId: staffId,
  };
}

async function createBooking(overrides: Record<string, unknown> = {}) {
  const startAt = new Date();
  return BookingModel.create({
    businessId,
    serviceId,
    staffId,
    customerId,
    startAt,
    endAt: new Date(startAt.getTime() + 60 * 60_000),
    status: "completed",
    slotKeys: [`direct-${Math.random().toString(36).slice(2)}`],
    manageTokenHash: "hash",
    priceSnapshot: 150000,
    paymentStatus: "unpaid",
    source: "manual",
    ...overrides,
  });
}

async function createInvoice(bookingId: string) {
  const res = await invoicesRoute.POST(buildRequest("POST", { bookingId }));
  expect(res.status).toBe(201);
  return (await res.json()) as {
    id: string;
    number: string;
    status: string;
    total: number;
    tax: number;
    subtotal: number;
    lineItems: Array<{ description: string; qty: number; unitPrice: number }>;
  };
}

describe("invoices, PDF, Stripe (P6)", () => {
  beforeAll(async () => {
    await startMemoryMongo();
  });

  afterAll(async () => {
    await InvoiceModel.deleteMany({});
    await BookingModel.deleteMany({});
    await CustomerModel.deleteMany({});
    await StaffModel.deleteMany({});
    await ServiceModel.deleteMany({});
    await BusinessModel.deleteMany({});
    await stopMemoryMongo();
  });

  beforeEach(async () => {
    await InvoiceModel.deleteMany({});
    await BookingModel.deleteMany({});
    await CustomerModel.deleteMany({});
    await StaffModel.deleteMany({});
    await ServiceModel.deleteMany({});
    await BusinessModel.deleteMany({});
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.RESEND_API_KEY;

    const business = await BusinessModel.create({
      name: "Invoice Salon",
      slug: "invoice-salon",
      timezone: TZ,
      currency: "BDT",
      bookingRules: { taxRatePercent: 5 },
    });
    businessId = String(business._id);

    const staff = await StaffModel.create({
      businessId: business._id,
      name: "Anika",
      isActive: true,
    });
    staffId = String(staff._id);

    const service = await ServiceModel.create({
      businessId: business._id,
      name: "Haircut",
      durationMinutes: 60,
      price: 150000,
      staffIds: [staff._id],
      isActive: true,
    });
    serviceId = String(service._id);

    const customer = await CustomerModel.create({
      businessId: business._id,
      name: "Wanda Client",
      email: "wanda@example.com",
    });
    customerId = String(customer._id);

    asOwner();
  });

  it("creates a draft invoice from a completed booking with tax from the business", async () => {
    const booking = await createBooking();
    const invoice = await createInvoice(String(booking._id));

    expect(invoice.number).toMatch(/^INV-\d{4}-\d{4,}$/);
    expect(invoice.status).toBe("draft");
    expect(invoice.lineItems).toHaveLength(1);
    expect(invoice.lineItems[0]).toMatchObject({
      description: "Haircut",
      qty: 1,
      unitPrice: 150000,
    });
    expect(invoice.subtotal).toBe(150000);
    expect(invoice.tax).toBe(7500); // 5%
    expect(invoice.total).toBe(157500);

    // Repeating the call is idempotent (returns the same invoice).
    const again = await createInvoice(String(booking._id));
    expect(again.id).toBe(invoice.id);
    expect(await InvoiceModel.countDocuments({ businessId })).toBe(1);
  });

  it("refuses to invoice a pending or cancelled booking", async () => {
    const pending = await createBooking({ status: "pending" });
    const res = await invoicesRoute.POST(
      buildRequest("POST", { bookingId: String(pending._id) })
    );
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
      "CONFLICT"
    );
  });

  it("P6-T10: 10 parallel invoice numbers are all distinct", async () => {
    const numbers = await Promise.all(
      Array.from({ length: 10 }, () => nextInvoiceNumber(businessId))
    );
    expect(new Set(numbers).size).toBe(10);
  });

  it("filters the invoice list by status", async () => {
    const completed = await createBooking();
    await createInvoice(String(completed._id));
    const second = await createBooking();
    await createInvoice(String(second._id));

    const all = await invoicesRoute.GET(buildRequest("GET"));
    expect(((await all.json()) as unknown[]).length).toBe(2);

    const unpaid = await invoicesRoute.GET(
      buildRequest("GET", undefined, { status: "unpaid" })
    );
    expect(((await unpaid.json()) as unknown[]).length).toBe(2);

    const paid = await invoicesRoute.GET(
      buildRequest("GET", undefined, { status: "paid" })
    );
    expect(((await paid.json()) as unknown[]).length).toBe(0);
  });

  it("edits draft line items and recomputes totals; blocks edits once sent", async () => {
    const booking = await createBooking();
    const invoice = await createInvoice(String(booking._id));

    const patched = await invoiceItemRoute.PATCH(
      buildRequest("PATCH", {
        lineItems: [
          { description: "Haircut", qty: 2, unitPrice: 100000 },
          { description: "Wash", qty: 1, unitPrice: 20000 },
        ],
      }),
      params(invoice.id)
    );
    expect(patched.status).toBe(200);
    const body = (await patched.json()) as {
      subtotal: number;
      tax: number;
      total: number;
    };
    expect(body.subtotal).toBe(220000);
    expect(body.tax).toBe(11000);
    expect(body.total).toBe(231000);

    // Send → status becomes sent and edits are rejected.
    const sent = await sendRoute.POST(
      buildRequest("POST"),
      params(invoice.id)
    );
    expect(sent.status).toBe(200);
    expect(((await sent.json()) as { status: string }).status).toBe("sent");

    const rejected = await invoiceItemRoute.PATCH(
      buildRequest("PATCH", {
        lineItems: [{ description: "x", qty: 1, unitPrice: 1 }],
      }),
      params(invoice.id)
    );
    expect(rejected.status).toBe(409);
  });

  it("streams the invoice as a PDF", async () => {
    const booking = await createBooking();
    const invoice = await createInvoice(String(booking._id));

    const res = await pdfRoute.GET(buildRequest("GET"), params(invoice.id));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");

    const buffer = Buffer.from(await res.arrayBuffer());
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(buffer.length).toBeGreaterThan(500);
  });

  it("serves the public invoice by token and gates checkout without Stripe", async () => {
    const booking = await createBooking();
    const invoice = await createInvoice(String(booking._id));
    const record = await InvoiceModel.findById(invoice.id).lean();
    const token = record!.publicToken;

    const publicDto = await getInvoiceByPublicToken(token);
    expect(publicDto?.number).toBe(invoice.number);
    expect(publicDto?.currency).toBe("BDT");
    expect(publicDto?.paymentConfigured).toBe(false);

    const checkout = await checkoutRoute.POST(
      buildRequest("POST"),
      tokenParams(token)
    );
    expect(checkout.status).toBe(503);
    expect(
      ((await checkout.json()) as { error: { code: string } }).error.code
    ).toBe("STRIPE_NOT_CONFIGURED");
  });

  it("P6-T10: webhook marks an invoice paid exactly once and updates the booking", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";

    const booking = await createBooking();
    const invoice = await createInvoice(String(booking._id));

    const stripe = new Stripe("sk_test_dummy");
    const payload = JSON.stringify({
      id: "evt_test_1",
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_1",
          object: "checkout.session",
          metadata: { invoiceId: invoice.id, kind: "invoice" },
        },
      },
    });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: "whsec_test_secret",
    });

    function eventRequest(sig: string) {
      return new Request("http://localhost/api/webhooks/stripe", {
        method: "POST",
        headers: { "stripe-signature": sig },
        body: payload,
      });
    }

    const first = await webhookRoute.POST(eventRequest(signature));
    expect(first.status).toBe(200);

    const paid = await InvoiceModel.findById(invoice.id).lean();
    expect(paid!.status).toBe("paid");
    expect(paid!.paidAt).toBeTruthy();
    const paidAt = new Date(paid!.paidAt!).toISOString();

    const bookingAfter = await BookingModel.findById(booking._id).lean();
    expect(bookingAfter!.paymentStatus).toBe("paid");

    // Duplicate delivery is a no-op: status stays paid and paidAt is unchanged.
    const second = await webhookRoute.POST(eventRequest(signature));
    expect(second.status).toBe(200);
    const paidAgain = await InvoiceModel.findById(invoice.id).lean();
    expect(paidAgain!.status).toBe("paid");
    expect(new Date(paidAgain!.paidAt!).toISOString()).toBe(paidAt);

    // A bad signature is rejected.
    const bad = await webhookRoute.POST(eventRequest("t=1,v1=deadbeef"));
    expect(bad.status).toBe(400);
  });

  it("returns 503 for webhooks when Stripe is not configured", async () => {
    const res = await webhookRoute.POST(buildRequest("POST", {}));
    expect(res.status).toBe(503);
  });

  it("falls back to reconciling by stored session id when metadata is absent", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";

    const booking = await createBooking();
    const invoice = await createInvoice(String(booking._id));
    await InvoiceModel.updateOne(
      { _id: invoice.id },
      { $set: { stripeSessionId: "cs_session_only" } }
    );

    const stripe = new Stripe("sk_test_dummy");
    const payload = JSON.stringify({
      id: "evt_test_2",
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_session_only",
          object: "checkout.session",
          metadata: {},
        },
      },
    });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: "whsec_test_secret",
    });

    const res = await webhookRoute.POST(
      new Request("http://localhost/api/webhooks/stripe", {
        method: "POST",
        headers: { "stripe-signature": signature },
        body: payload,
      })
    );
    expect(res.status).toBe(200);

    const paid = await InvoiceModel.findById(invoice.id).lean();
    expect(paid!.status).toBe("paid");
  });

  it("P6-T10: staff cannot access invoices; cross-tenant reads 404", async () => {
    const booking = await createBooking();
    const invoice = await createInvoice(String(booking._id));

    asStaff();
    const forbidden = await invoicesRoute.GET(buildRequest("GET"));
    expect(forbidden.status).toBe(403);

    // A different business cannot read this invoice.
    const otherBusiness = await BusinessModel.create({
      name: "Other",
      slug: "other-salon",
      timezone: TZ,
      currency: "BDT",
    });
    authState.user = {
      id: "507f1f77bcf86cd799439099",
      businessId: String(otherBusiness._id),
      role: "owner",
      staffProfileId: null,
    };
    const crossTenant = await invoiceItemRoute.GET(
      buildRequest("GET"),
      params(invoice.id)
    );
    expect(crossTenant.status).toBe(404);
  });
});
