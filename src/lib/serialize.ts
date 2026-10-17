import type { BookingDto, InvoiceDto } from "@/lib/types";

export function serializeId(value: unknown): string {
  return String(value);
}

export function serializeCustomer(doc: {
  _id: unknown;
  businessId: unknown;
  name: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  preferredChannel?: "email" | "sms" | "whatsapp" | null;
  createdAt?: Date | string | null;
}) {
  return {
    id: serializeId(doc._id),
    businessId: serializeId(doc.businessId),
    name: doc.name,
    email: doc.email ?? null,
    phone: doc.phone ?? null,
    notes: doc.notes ?? null,
    preferredChannel: doc.preferredChannel ?? "email",
    createdAt: doc.createdAt ?? null,
  };
}

export function serializeService(doc: {
  _id: unknown;
  businessId: unknown;
  name: string;
  description?: string | null;
  durationMinutes: number;
  bufferMinutes?: number | null;
  price: number;
  staffIds?: unknown[];
  isActive?: boolean | null;
  createdAt?: Date | string | null;
}) {
  return {
    id: serializeId(doc._id),
    businessId: serializeId(doc.businessId),
    name: doc.name,
    description: doc.description ?? null,
    durationMinutes: doc.durationMinutes,
    bufferMinutes: doc.bufferMinutes ?? 0,
    price: doc.price,
    staffIds: (doc.staffIds ?? []).map(serializeId),
    isActive: doc.isActive ?? true,
    createdAt: doc.createdAt ?? null,
  };
}

export function serializeStaff(doc: {
  _id: unknown;
  businessId: unknown;
  name: string;
  email?: string | null;
  photoUrl?: string | null;
  weeklyHours?: Array<{
    weekday: number;
    ranges: Array<{ start: string; end: string }>;
  }> | null;
  daysOff?: Array<{
    date: string;
    reason?: string | null;
    hoursOverride?: string | null;
  }> | null;
  isActive?: boolean | null;
  createdAt?: Date | string | null;
}) {
  return {
    id: serializeId(doc._id),
    businessId: serializeId(doc.businessId),
    name: doc.name,
    email: doc.email ?? null,
    photoUrl: doc.photoUrl ?? null,
    weeklyHours: (doc.weeklyHours ?? []).map((wh) => ({
      weekday: wh.weekday,
      ranges: (wh.ranges ?? []).map((r) => ({
        start: r.start,
        end: r.end,
      })),
    })),
    daysOff: (doc.daysOff ?? []).map((d) => ({
      date: d.date,
      reason: d.reason ?? null,
      hoursOverride: d.hoursOverride ?? null,
    })),
    isActive: doc.isActive ?? true,
    createdAt: doc.createdAt ?? null,
  };
}

/** A ref that may be an ObjectId, a populated document, or null. */
function refObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && "_id" in (value as object)) {
    return value as Record<string, unknown>;
  }
  return null;
}

/**
 * Dashboard booking serializer (P5-T1/T2). Expects the route to have
 * populated `serviceId`/`staffId`/`customerId`; unpopulated refs serialize
 * to `null` for the nested object rather than leaking raw ids.
 */
export function serializeBooking(doc: {
  _id: unknown;
  businessId: unknown;
  serviceId: unknown;
  staffId: unknown;
  customerId: unknown;
  status: string;
  paymentStatus?: string | null;
  source?: string | null;
  startAt: Date | string;
  endAt: Date | string;
  priceSnapshot: number;
  createdAt?: Date | string | null;
  cancelledAt?: Date | string | null;
  seriesId?: unknown;
  recurrence?: {
    freq?: "weekly" | "monthly" | null;
    interval?: number | null;
    count?: number | null;
  } | null;
}): BookingDto {
  const service = refObject(doc.serviceId);
  const staff = refObject(doc.staffId);
  const customer = refObject(doc.customerId);
  const recurrence = doc.recurrence;

  return {
    id: serializeId(doc._id),
    businessId: serializeId(doc.businessId),
    status: doc.status as BookingDto["status"],
    paymentStatus: (doc.paymentStatus ?? "unpaid") as BookingDto["paymentStatus"],
    source: (doc.source ?? "online") as BookingDto["source"],
    startAt: new Date(doc.startAt).toISOString(),
    endAt: new Date(doc.endAt).toISOString(),
    price: doc.priceSnapshot,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
    cancelledAt: doc.cancelledAt
      ? new Date(doc.cancelledAt).toISOString()
      : null,
    seriesId: doc.seriesId ? serializeId(doc.seriesId) : null,
    recurrence:
      recurrence && recurrence.freq
        ? {
            freq: recurrence.freq,
            interval: recurrence.interval ?? 1,
            count: recurrence.count ?? 1,
          }
        : null,
    service: service
      ? {
          id: serializeId(service._id),
          name: String(service.name ?? ""),
          durationMinutes: Number(service.durationMinutes ?? 0),
          price: Number(service.price ?? doc.priceSnapshot),
        }
      : null,
    staff: staff
      ? { id: serializeId(staff._id), name: String(staff.name ?? "") }
      : null,
    customer: customer
      ? {
          id: serializeId(customer._id),
          name: String(customer.name ?? ""),
          email: (customer.email as string | undefined) ?? null,
          phone: (customer.phone as string | undefined) ?? null,
        }
      : null,
  };
}

/**
 * Dashboard invoice serializer (P6-T1/T2). Expects the route to have
 * populated `customerId` (name/email) and `bookingId` (startAt/status); an
 * unpopulated ref serializes to `null` rather than leaking a raw id.
 */
export function serializeInvoice(doc: {
  _id: unknown;
  businessId: unknown;
  bookingId?: unknown;
  customerId: unknown;
  number: string;
  lineItems?: Array<{
    description: string;
    qty: number;
    unitPrice: number;
  }> | null;
  subtotal: number;
  tax?: number | null;
  total: number;
  status: string;
  stripeSessionId?: string | null;
  paidAt?: Date | string | null;
  createdAt?: Date | string | null;
}): InvoiceDto {
  const customer = refObject(doc.customerId);
  const booking = refObject(doc.bookingId);

  return {
    id: serializeId(doc._id),
    businessId: serializeId(doc.businessId),
    number: doc.number,
    status: doc.status as InvoiceDto["status"],
    lineItems: (doc.lineItems ?? []).map((item) => ({
      description: item.description,
      qty: item.qty,
      unitPrice: item.unitPrice,
    })),
    subtotal: doc.subtotal,
    tax: doc.tax ?? 0,
    total: doc.total,
    paidAt: doc.paidAt ? new Date(doc.paidAt).toISOString() : null,
    createdAt: doc.createdAt
      ? new Date(doc.createdAt).toISOString()
      : null,
    stripeSessionId: doc.stripeSessionId ?? null,
    customer: customer
      ? {
          id: serializeId(customer._id),
          name: String(customer.name ?? ""),
          email: (customer.email as string | undefined) ?? null,
        }
      : null,
    booking: booking
      ? {
          id: serializeId(booking._id),
          startAt: new Date(
            booking.startAt as string | Date
          ).toISOString(),
          status: (booking.status as BookingDto["status"]) ?? "confirmed",
        }
      : null,
  };
}