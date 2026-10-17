import { randomBytes } from "node:crypto";
import { connectToDatabase } from "@/lib/db";
import { HttpError } from "@/lib/api";
import { appBaseUrl } from "@/lib/url";
import { serializeInvoice } from "@/lib/serialize";
import { sendInvoiceEmail } from "@/lib/email";
import type {
  InvoiceDto,
  InvoiceLineItem,
  InvoicePdfData,
  InvoiceStatus,
  PublicInvoiceDto,
} from "@/lib/types";
import BusinessModel from "@/models/business";
import BookingModel from "@/models/booking";
import CustomerModel from "@/models/customer";
import ServiceModel from "@/models/service";
import InvoiceModel from "@/models/invoice";

/**
 * Invoice domain logic (spec §10, PLAN P6-T1).
 *
 * Invoice numbers come from an atomic `$inc` on `Business.invoiceCounter`, so
 * concurrent creations never collide. Prices are integers in the smallest
 * currency unit; tax is a percentage from the booking rules and is rounded
 * server-side — nothing about an invoice is trusted from the client.
 */

function isObjectIdLike(value: string): boolean {
  return /^[0-9a-fA-F]{24}$/.test(value);
}

function paymentConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

/** Generate the invoice's public URL secret (spec §9). */
export function generateInvoiceToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Recompute subtotal / tax / total from line items and a tax rate. */
export function computeInvoiceTotals(
  lineItems: Array<{ qty: number; unitPrice: number }>,
  taxRatePercent: number
): { subtotal: number; tax: number; total: number } {
  const subtotal = lineItems.reduce(
    (sum, item) => sum + item.qty * item.unitPrice,
    0
  );
  const rate = Number.isFinite(taxRatePercent) ? taxRatePercent : 0;
  const tax = Math.round((subtotal * rate) / 100);
  return { subtotal, tax, total: subtotal + tax };
}

function normalizeLineItems(
  lineItems: Array<{ description: string; qty: number; unitPrice: number }>
): InvoiceLineItem[] {
  return lineItems.map((item) => ({
    description: item.description,
    qty: item.qty,
    unitPrice: item.unitPrice,
  }));
}

/**
 * Atomically reserve the next invoice number for a business. `$inc` on a
 * single document is atomic in MongoDB, so parallel calls get distinct
 * counters (P6-T10). Format follows the spec example: `INV-2026-0042`.
 */
export async function nextInvoiceNumber(
  businessId: unknown,
  now = new Date()
): Promise<string> {
  const business = await BusinessModel.findOneAndUpdate(
    { _id: businessId },
    { $inc: { invoiceCounter: 1 } },
    { new: true, projection: { invoiceCounter: 1 } }
  ).lean();

  if (!business) {
    throw new HttpError("NOT_FOUND", "Business not found.", 404);
  }

  const counter = business.invoiceCounter ?? 1;
  return `INV-${now.getUTCFullYear()}-${String(counter).padStart(4, "0")}`;
}

/** Load a business-scoped invoice with populated refs and serialize it. */
async function loadInvoiceDto(
  businessId: string,
  invoiceId: unknown
): Promise<InvoiceDto | null> {
  const invoice = await InvoiceModel.findOne({
    _id: invoiceId,
    businessId,
  })
    .populate("customerId", "name email")
    .populate("bookingId", "startAt status")
    .lean();
  if (!invoice) return null;
  return serializeInvoice(invoice);
}

/**
 * Create a draft invoice from a booking (P6-T1). Only confirmed/completed
 * bookings can be invoiced. Repeat calls for the same booking return the
 * existing non-void invoice instead of creating a duplicate.
 */
export async function createInvoiceFromBooking(input: {
  businessId: string;
  bookingId: string;
}): Promise<InvoiceDto> {
  await connectToDatabase();
  const { businessId, bookingId } = input;

  if (!isObjectIdLike(bookingId)) {
    throw new HttpError("NOT_FOUND", "Booking not found.", 404);
  }

  const booking = await BookingModel.findOne({
    _id: bookingId,
    businessId,
  }).lean();
  if (!booking) {
    throw new HttpError("NOT_FOUND", "Booking not found.", 404);
  }
  if (booking.status !== "confirmed" && booking.status !== "completed") {
    throw new HttpError(
      "CONFLICT",
      "Only confirmed or completed bookings can be invoiced.",
      409
    );
  }

  const existing = await InvoiceModel.findOne({
    businessId,
    bookingId: booking._id,
    status: { $ne: "void" },
  });
  if (existing) {
    const dto = await loadInvoiceDto(businessId, existing._id);
    if (dto) return dto;
  }

  const business = await BusinessModel.findById(businessId).lean();
  const customer = await CustomerModel.findById(booking.customerId).lean();
  if (!business || !customer) {
    throw new HttpError("NOT_FOUND", "Booking not found.", 404);
  }

  const service = booking.serviceId
    ? await ServiceModel.findById(booking.serviceId).lean()
    : null;

  const lineItems: InvoiceLineItem[] = [
    {
      description: service?.name ?? "Service",
      qty: 1,
      unitPrice: booking.priceSnapshot,
    },
  ];
  const taxRatePercent = business.bookingRules?.taxRatePercent ?? 0;
  const { subtotal, tax, total } = computeInvoiceTotals(
    lineItems,
    taxRatePercent
  );

  const number = await nextInvoiceNumber(business._id);
  const invoice = await InvoiceModel.create({
    businessId: business._id,
    bookingId: booking._id,
    customerId: customer._id,
    number,
    lineItems,
    subtotal,
    tax,
    total,
    status: "draft",
    publicToken: generateInvoiceToken(),
  });

  const dto = await loadInvoiceDto(businessId, invoice._id);
  if (!dto) {
    throw new HttpError(
      "INTERNAL",
      "Invoice was created but could not be loaded.",
      500
    );
  }
  return dto;
}

export type InvoiceListFilter = {
  businessId: string;
  /** Raw status values, or `unpaid` for draft+sent (P6-T8 filter). */
  status?: string[];
};

/** Business-scoped invoice list, newest first (P6-T2). */
export async function listInvoices(
  filter: InvoiceListFilter
): Promise<InvoiceDto[]> {
  await connectToDatabase();

  const query: Record<string, unknown> = { businessId: filter.businessId };
  if (filter.status && filter.status.length > 0) {
    query.status = { $in: filter.status };
  }

  const invoices = await InvoiceModel.find(query)
    .sort({ createdAt: -1 })
    .limit(500)
    .populate("customerId", "name email")
    .populate("bookingId", "startAt status")
    .lean();

  return invoices.map((invoice) => serializeInvoice(invoice));
}

/** Single business-scoped invoice (P6-T2). */
export async function getInvoiceDetail(
  businessId: string,
  invoiceId: string
): Promise<InvoiceDto | null> {
  await connectToDatabase();
  if (!isObjectIdLike(invoiceId)) return null;
  return loadInvoiceDto(businessId, invoiceId);
}

/**
 * Edit a draft (line items, totals recomputed) or void a non-paid invoice
 * (P6-T2). Paid invoices are immutable.
 */
export async function updateInvoice(input: {
  businessId: string;
  invoiceId: string;
  lineItems?: InvoiceLineItem[];
  status?: "void";
}): Promise<InvoiceDto> {
  await connectToDatabase();
  const { businessId, invoiceId } = input;

  if (!isObjectIdLike(invoiceId)) {
    throw new HttpError("NOT_FOUND", "Invoice not found.", 404);
  }

  const invoice = await InvoiceModel.findOne({ _id: invoiceId, businessId });
  if (!invoice) {
    throw new HttpError("NOT_FOUND", "Invoice not found.", 404);
  }
  if (invoice.status === "paid") {
    throw new HttpError(
      "CONFLICT",
      "Paid invoices can no longer be edited.",
      409
    );
  }

  if (input.lineItems) {
    if (invoice.status !== "draft") {
      throw new HttpError(
        "CONFLICT",
        "Only draft invoices can be edited.",
        409
      );
    }
    const business = await BusinessModel.findById(businessId).lean();
    const taxRatePercent = business?.bookingRules?.taxRatePercent ?? 0;
    const lineItems = normalizeLineItems(input.lineItems);
    const { subtotal, tax, total } = computeInvoiceTotals(
      lineItems,
      taxRatePercent
    );

    invoice.lineItems = lineItems;
    invoice.subtotal = subtotal;
    invoice.tax = tax;
    invoice.total = total;
    await invoice.save();
  }

  if (input.status === "void") {
    invoice.status = "void";
    await invoice.save();
  }

  const dto = await loadInvoiceDto(businessId, invoiceId);
  if (!dto) {
    throw new HttpError("NOT_FOUND", "Invoice not found.", 404);
  }
  return dto;
}

/**
 * Email the public invoice link and move a draft to `sent` (P6-T2). Resending
 * an already-sent invoice is allowed; paid/void are rejected.
 */
export async function sendInvoice(input: {
  businessId: string;
  invoiceId: string;
}): Promise<InvoiceDto> {
  await connectToDatabase();
  const { businessId, invoiceId } = input;

  if (!isObjectIdLike(invoiceId)) {
    throw new HttpError("NOT_FOUND", "Invoice not found.", 404);
  }

  const invoice = await InvoiceModel.findOne({ _id: invoiceId, businessId });
  if (!invoice) {
    throw new HttpError("NOT_FOUND", "Invoice not found.", 404);
  }
  if (invoice.status === "paid" || invoice.status === "void") {
    throw new HttpError(
      "CONFLICT",
      "This invoice can no longer be sent.",
      409
    );
  }

  const [business, customer] = await Promise.all([
    BusinessModel.findById(businessId).lean(),
    CustomerModel.findById(invoice.customerId).lean(),
  ]);
  if (!business) {
    throw new HttpError("NOT_FOUND", "Business not found.", 404);
  }
  if (!customer?.email) {
    throw new HttpError(
      "VALIDATION_ERROR",
      "This customer has no email address to send the invoice to.",
      400
    );
  }

  const publicUrl = `${appBaseUrl()}/invoice/${invoice.publicToken}`;
  await sendInvoiceEmail({
    to: customer.email,
    customerName: customer.name,
    businessName: business.name,
    invoiceNumber: invoice.number,
    total: invoice.total,
    currency: business.currency ?? "USD",
    publicUrl,
  });

  if (invoice.status === "draft") {
    invoice.status = "sent";
    await invoice.save();
  }

  const dto = await loadInvoiceDto(businessId, invoiceId);
  if (!dto) {
    throw new HttpError("NOT_FOUND", "Invoice not found.", 404);
  }
  return dto;
}

// ---------------------------------------------------------------------------
// Public (token-scoped) access — P6-T4/T5
// ---------------------------------------------------------------------------

export async function getInvoiceByPublicToken(
  token: string
): Promise<PublicInvoiceDto | null> {
  await connectToDatabase();
  if (!token) return null;

  const invoice = await InvoiceModel.findOne({ publicToken: token }).lean();
  if (!invoice) return null;

  const [business, customer, booking] = await Promise.all([
    BusinessModel.findById(invoice.businessId).lean(),
    CustomerModel.findById(invoice.customerId).lean(),
    invoice.bookingId
      ? BookingModel.findById(invoice.bookingId).lean()
      : Promise.resolve(null),
  ]);

  let serviceName: string | null = null;
  if (booking?.serviceId) {
    const service = await ServiceModel.findById(booking.serviceId)
      .select("name")
      .lean();
    serviceName = service?.name ?? null;
  }

  return {
    number: invoice.number,
    status: invoice.status as InvoiceStatus,
    lineItems: normalizeLineItems(invoice.lineItems ?? []),
    subtotal: invoice.subtotal,
    tax: invoice.tax ?? 0,
    total: invoice.total,
    currency: business?.currency ?? "USD",
    timezone: business?.timezone ?? "UTC",
    paidAt: invoice.paidAt ? new Date(invoice.paidAt).toISOString() : null,
    createdAt: invoice.createdAt
      ? new Date(invoice.createdAt).toISOString()
      : null,
    customer: customer
      ? { name: customer.name, email: customer.email ?? null }
      : null,
    serviceName,
    business: {
      name: business?.name ?? "BookKeep",
      slug: business?.slug ?? "",
      timezone: business?.timezone ?? "UTC",
      currency: business?.currency ?? "USD",
      phone: business?.phone ?? null,
      address: business?.address ?? null,
      logoUrl: business?.logoUrl ?? null,
    },
    paymentConfigured: paymentConfigured(),
  };
}

export type InvoiceCheckoutContext = {
  invoiceId: string;
  status: InvoiceStatus;
  lineItems: InvoiceLineItem[];
  tax: number;
  total: number;
  currency: string;
  customerEmail: string | null;
};

/** Data the checkout route needs to build a Stripe Checkout Session. */
export async function getInvoiceCheckoutContext(
  token: string
): Promise<InvoiceCheckoutContext | null> {
  await connectToDatabase();
  if (!token) return null;

  const invoice = await InvoiceModel.findOne({ publicToken: token }).lean();
  if (!invoice) return null;

  const [business, customer] = await Promise.all([
    BusinessModel.findById(invoice.businessId).lean(),
    CustomerModel.findById(invoice.customerId).lean(),
  ]);

  return {
    invoiceId: String(invoice._id),
    status: invoice.status as InvoiceStatus,
    lineItems: normalizeLineItems(invoice.lineItems ?? []),
    tax: invoice.tax ?? 0,
    total: invoice.total,
    currency: (business?.currency ?? "USD").toLowerCase(),
    customerEmail: customer?.email ?? null,
  };
}

/** Record the Stripe Checkout Session id on the invoice (P6-T5). */
export async function setInvoiceCheckoutSession(input: {
  invoiceId: string;
  sessionId: string;
}): Promise<void> {
  if (!isObjectIdLike(input.invoiceId)) return;
  await InvoiceModel.updateOne(
    { _id: input.invoiceId },
    { $set: { stripeSessionId: input.sessionId } }
  );
}

/**
 * Mark an invoice paid and (if linked) flag its booking paid (P6-T6). The
 * conditional update makes concurrent/duplicate webhooks idempotent: only the
 * first transition reports `transitioned: true`.
 */
export async function markInvoicePaidBySession(input: {
  invoiceId: string;
  stripeSessionId?: string | null;
}): Promise<{ transitioned: boolean }> {
  await connectToDatabase();
  if (!isObjectIdLike(input.invoiceId)) return { transitioned: false };

  const set: Record<string, unknown> = {
    status: "paid",
    paidAt: new Date(),
  };
  if (input.stripeSessionId) set.stripeSessionId = input.stripeSessionId;

  const updated = await InvoiceModel.findOneAndUpdate(
    { _id: input.invoiceId, status: { $ne: "paid" } },
    { $set: set },
    { new: true }
  );
  if (!updated) return { transitioned: false };

  if (updated.bookingId) {
    await BookingModel.updateOne(
      { _id: updated.bookingId },
      { $set: { paymentStatus: "paid" } }
    );
  }
  return { transitioned: true };
}

/** Fallback reconciliation keyed by the stored Stripe session id (P6-T6). */
export async function markInvoicePaidBySessionId(input: {
  stripeSessionId: string;
}): Promise<{ transitioned: boolean }> {
  await connectToDatabase();
  if (!input.stripeSessionId) return { transitioned: false };

  const invoice = await InvoiceModel.findOne({
    stripeSessionId: input.stripeSessionId,
  })
    .select("_id")
    .lean();
  if (!invoice) return { transitioned: false };

  return markInvoicePaidBySession({
    invoiceId: String(invoice._id),
    stripeSessionId: input.stripeSessionId,
  });
}

// ---------------------------------------------------------------------------
// PDF data (P6-T3)
// ---------------------------------------------------------------------------

/** Everything the PDF template needs for a business-scoped invoice. */
export async function getInvoicePdfData(
  businessId: string,
  invoiceId: string
): Promise<InvoicePdfData | null> {
  await connectToDatabase();
  if (!isObjectIdLike(invoiceId)) return null;

  const invoice = await InvoiceModel.findOne({
    _id: invoiceId,
    businessId,
  }).lean();
  if (!invoice) return null;

  const [business, customer, booking] = await Promise.all([
    BusinessModel.findById(invoice.businessId).lean(),
    CustomerModel.findById(invoice.customerId).lean(),
    invoice.bookingId
      ? BookingModel.findById(invoice.bookingId).lean()
      : Promise.resolve(null),
  ]);

  let serviceName: string | null = null;
  if (booking?.serviceId) {
    const service = await ServiceModel.findById(booking.serviceId)
      .select("name")
      .lean();
    serviceName = service?.name ?? null;
  }

  return {
    number: invoice.number,
    status: invoice.status as InvoiceStatus,
    currency: business?.currency ?? "USD",
    timezone: business?.timezone ?? "UTC",
    createdAt: invoice.createdAt
      ? new Date(invoice.createdAt).toISOString()
      : null,
    paidAt: invoice.paidAt ? new Date(invoice.paidAt).toISOString() : null,
    business: {
      name: business?.name ?? "BookKeep",
      phone: business?.phone ?? null,
      address: business?.address ?? null,
      logoUrl: business?.logoUrl ?? null,
    },
    customer: customer
      ? { name: customer.name, email: customer.email ?? null }
      : null,
    booking: booking
      ? {
          startAt: new Date(booking.startAt).toISOString(),
          serviceName,
        }
      : null,
    lineItems: normalizeLineItems(invoice.lineItems ?? []),
    subtotal: invoice.subtotal,
    tax: invoice.tax ?? 0,
    total: invoice.total,
  };
}
