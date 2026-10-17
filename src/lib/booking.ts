import { createHash, randomBytes } from "node:crypto";
import { DateTime } from "luxon";
import { connectToDatabase } from "@/lib/db";
import { HttpError } from "@/lib/api";
import { dateInTzToUtcRange } from "@/lib/time";
import { getSlots, type AvailabilityBooking } from "@/lib/availability";
import { serializeBooking } from "@/lib/serialize";
import type { BookingDto, BookingStatus, PublicBookingDto } from "@/lib/types";
import BusinessModel from "@/models/business";
import ServiceModel from "@/models/service";
import StaffModel from "@/models/staff";
import CustomerModel from "@/models/customer";
import BookingModel from "@/models/booking";

/**
 * Booking domain logic (spec §7–§9, PLAN P4-T1).
 *
 * Slot uniqueness is enforced by Mongo's unique multikey partial index on
 * `slotKeys` (spec §8): a race between two creates/updates for the same slot
 * surfaces as duplicate-key error 11000, which we translate to 409
 * `SLOT_TAKEN`. Nothing here trusts client pricing — `priceSnapshot` is
 * copied from the server-side Service document.
 */

const BLOCKING_STATUSES = ["pending", "confirmed"] as const;

type BookingRules = {
  minNoticeHours?: number | null;
  maxDaysAhead?: number | null;
  slotIntervalMinutes?: number | null;
  cancelWindowHours?: number | null;
  autoConfirm?: boolean | null;
  depositEnabled?: boolean | null;
};

type BusinessLike = {
  _id: unknown;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  phone?: string | null;
  address?: string | null;
  bookingRules?: BookingRules | null;
};

type ServiceLike = {
  _id: unknown;
  name: string;
  durationMinutes: number;
  bufferMinutes?: number | null;
  price: number;
  staffIds?: unknown[] | null;
};

type StaffLike = {
  _id: unknown;
  name: string;
  weeklyHours?: Array<{
    weekday: number;
    ranges: Array<{ start: string; end: string }>;
  }> | null;
  daysOff?: Array<{
    date: string;
    reason?: string | null;
    hoursOverride?: string | null;
  }> | null;
};

export type CreateBookingInput = {
  slug: string;
  serviceId: string;
  /** Omit or null for "any available" — the first free eligible staff wins. */
  staffId?: string | null;
  /** Requested start as an ISO-8601 instant (UTC). */
  startAt: string;
  name: string;
  email: string;
  phone?: string | null;
  preferredChannel?: "email" | "sms" | "whatsapp";
};

export type CreateBookingResult = {
  bookingId: string;
  startAt: string;
  endAt: string;
  status: BookingStatus;
  timezone: string;
  manageUrl: string;
  /** Plaintext manage token — never persisted, only its sha256 is stored. */
  token: string;
  email: string;
  customerName: string;
  serviceName: string;
  staffName: string;
  price: number;
  currency: string;
  businessName: string;
  businessPhone: string | null;
  businessAddress: string | null;
};

// ---------------------------------------------------------------------------
// Token helpers (spec §3.5 / §9: random secret in URL, sha256 stored)
// ---------------------------------------------------------------------------

export function generateManageToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashManageToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Build the slot keys for a booking (spec §5/§8 slotKeys rule): partition
 * `[startAt, startAt + durationMinutes + bufferMinutes)` on the
 * `slotIntervalMinutes` grid, formatted in the **business timezone**
 * minute precision; one key per grid point strictly before the end.
 *
 * e.g. 60-min service + 15-min buffer, 15-min interval starting 10:00 →
 * `staff_2026-10-20T10:00`, `…T10:15`, `…T10:30`, `…T10:45`.
 */
export function buildSlotKeys(input: {
  staffId: string;
  startAt: Date;
  durationMinutes: number;
  bufferMinutes?: number | null;
  timezone: string;
  slotIntervalMinutes: number;
}): string[] {
  const duration = Math.max(0, Math.floor(input.durationMinutes || 0));
  const buffer = Math.max(0, Math.floor(input.bufferMinutes ?? 0));
  const window = duration + buffer;
  if (window <= 0) return [];

  const interval = Math.max(
    1,
    Math.floor(input.slotIntervalMinutes || 30)
  );
  const start = DateTime.fromJSDate(input.startAt, { zone: input.timezone });
  const end = start.plus({ minutes: window });

  const keys: string[] = [];
  let cursor = start;
  while (cursor < end) {
    keys.push(`${input.staffId}_${cursor.toFormat("yyyy-LL-dd'T'HH:mm")}`);
    cursor = cursor.plus({ minutes: interval });
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Availability helpers
// ---------------------------------------------------------------------------

function isObjectIdLike(value: string): boolean {
  return /^[0-9a-fA-F]{24}$/.test(value);
}

function normaliseRules(rules: BookingRules | null | undefined) {
  return {
    minNoticeHours: rules?.minNoticeHours ?? 0,
    maxDaysAhead: rules?.maxDaysAhead ?? 60,
    slotIntervalMinutes: rules?.slotIntervalMinutes ?? 30,
    cancelWindowHours: rules?.cancelWindowHours ?? 24,
    autoConfirm: rules?.autoConfirm ?? true,
    depositEnabled: rules?.depositEnabled ?? false,
  };
}

async function loadDayBookings(
  businessId: unknown,
  staffId: unknown,
  date: string,
  timezone: string
): Promise<Array<AvailabilityBooking & { _id?: unknown }>> {
  const { startUtc, endUtc } = dateInTzToUtcRange(date, timezone);
  return BookingModel.find({
    businessId,
    staffId,
    startAt: { $lt: endUtc },
    endAt: { $gt: startUtc },
    status: { $in: BLOCKING_STATUSES },
  })
    .select("startAt endAt status")
    .lean();
}

/**
 * True when `startAt` is one of the slots the staff member offers that day.
 * This is the single validation used by create (incl. "any available") and
 * reschedule, so both honour working hours, days off, min-notice, horizon and
 * existing bookings.
 */
async function staffOffersSlot(input: {
  business: BusinessLike;
  service: ServiceLike;
  staff: StaffLike;
  startAt: Date;
  excludeBookingId?: unknown;
}): Promise<boolean> {
  const { business, service, staff, startAt } = input;
  const date = DateTime.fromJSDate(startAt)
    .setZone(business.timezone)
    .toISODate();
  if (!date) return false;

  let bookings = await loadDayBookings(
    business._id,
    staff._id,
    date,
    business.timezone
  );
  if (input.excludeBookingId !== undefined) {
    const excluded = String(input.excludeBookingId);
    bookings = bookings.filter(
      (booking) => String(booking._id) !== excluded
    );
  }

  const rules = normaliseRules(business.bookingRules);
  const slots = getSlots({
    timezone: business.timezone,
    date,
    now: new Date(),
    bookingRules: {
      minNoticeHours: rules.minNoticeHours,
      maxDaysAhead: rules.maxDaysAhead,
      slotIntervalMinutes: rules.slotIntervalMinutes,
    },
    service: {
      durationMinutes: service.durationMinutes,
      bufferMinutes: service.bufferMinutes ?? 0,
    },
    staff: {
      weeklyHours: staff.weeklyHours ?? [],
      daysOff: staff.daysOff ?? [],
    },
    bookings,
  });

  const target = startAt.getTime();
  return slots.some((slot) => new Date(slot.startAt).getTime() === target);
}

// ---------------------------------------------------------------------------
// Customer find-or-create (unique per business on email and phone)
// ---------------------------------------------------------------------------

async function findOrCreateCustomer(input: {
  businessId: unknown;
  name: string;
  email?: string | null;
  phone?: string | null;
  preferredChannel?: "email" | "sms" | "whatsapp";
}) {
  const email = input.email?.trim() ? input.email.trim().toLowerCase() : undefined;
  const phone = input.phone?.trim() ? input.phone.trim() : undefined;

  let customer = email
    ? await CustomerModel.findOne({
        businessId: input.businessId,
        email,
      })
    : null;
  if (!customer && phone) {
    customer = await CustomerModel.findOne({
      businessId: input.businessId,
      phone,
    });
  }

  if (customer) {
    const updates: Record<string, unknown> = {};
    if (phone && !customer.phone) updates.phone = phone;
    if (input.preferredChannel && customer.preferredChannel !== input.preferredChannel) {
      updates.preferredChannel = input.preferredChannel;
    }
    if (Object.keys(updates).length > 0) {
      await CustomerModel.updateOne({ _id: customer._id }, { $set: updates });
    }
    return customer;
  }

  try {
    return await CustomerModel.create({
      businessId: input.businessId,
      name: input.name,
      email,
      phone,
      preferredChannel: input.preferredChannel ?? "email",
    });
  } catch (error) {
    // Concurrent create for the same email/phone — reuse the winner.
    if ((error as { code?: number }).code === 11000) {
      const or: Array<Record<string, unknown>> = [];
      if (email) or.push({ email });
      if (phone) or.push({ phone });
      const existing = or.length
        ? await CustomerModel.findOne({
            businessId: input.businessId,
            $or: or,
          })
        : null;
      if (existing) return existing;
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

function toPublicBookingDto(
  booking: {
    _id: unknown;
    status: BookingStatus;
    paymentStatus?: "unpaid" | "paid" | "refunded" | null;
    startAt: Date | string;
    endAt: Date | string;
    priceSnapshot: number;
    createdAt?: Date | string | null;
    cancelledAt?: Date | string | null;
  },
  business: BusinessLike | null,
  service: ServiceLike | null,
  staff: StaffLike | null,
  customer: { name: string; email?: string | null } | null
): PublicBookingDto {
  const rules = normaliseRules(business?.bookingRules);
  const startAt = new Date(booking.startAt);
  const now = Date.now();

  const statusAllowsChange =
    booking.status === "pending" || booking.status === "confirmed";
  const cancelDeadline = DateTime.fromJSDate(startAt)
    .minus({ hours: rules.cancelWindowHours })
    .toJSDate();

  const cancelWindowSeconds = Math.max(0, rules.cancelWindowHours) * 3600;
  const cancelDeadlineMs = startAt.getTime() - cancelWindowSeconds * 1000;

  return {
    id: String(booking._id),
    status: booking.status,
    paymentStatus: booking.paymentStatus ?? "unpaid",
    startAt: startAt.toISOString(),
    endAt: new Date(booking.endAt).toISOString(),
    durationMinutes: service?.durationMinutes ?? 0,
    price: booking.priceSnapshot,
    createdAt: booking.createdAt ? new Date(booking.createdAt).toISOString() : null,
    cancelledAt: booking.cancelledAt
      ? new Date(booking.cancelledAt).toISOString()
      : null,
    service: service
      ? {
          id: String(service._id),
          name: service.name,
          durationMinutes: service.durationMinutes,
        }
      : null,
    staff: staff ? { id: String(staff._id), name: staff.name } : null,
    customer: customer
      ? { name: customer.name, email: customer.email ?? null }
      : null,
    business: {
      name: business?.name ?? "BookKeep",
      slug: business?.slug ?? "",
      timezone: business?.timezone ?? "UTC",
      currency: business?.currency ?? "USD",
      phone: business?.phone ?? null,
      address: business?.address ?? null,
    },
    cancelWindowHours: rules.cancelWindowHours,
    maxDaysAhead: rules.maxDaysAhead,
    cancelDeadline: cancelDeadline.toISOString(),
    canCancel: statusAllowsChange && now <= cancelDeadlineMs,
    canReschedule: statusAllowsChange && now < startAt.getTime(),
  };
}

function appBaseUrl(): string {
  return (
    process.env.APP_URL ??
    process.env.NEXTAUTH_URL ??
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}

async function buildPublicBookingDto(
  booking: {
    _id: unknown;
    businessId: unknown;
    serviceId: unknown;
    staffId: unknown;
    customerId: unknown;
    status: BookingStatus;
    paymentStatus?: "unpaid" | "paid" | "refunded" | null;
    startAt: Date | string;
    endAt: Date | string;
    priceSnapshot: number;
    createdAt?: Date | string | null;
    cancelledAt?: Date | string | null;
  }
): Promise<PublicBookingDto> {
  const [business, service, staff, customer] = await Promise.all([
    BusinessModel.findById(booking.businessId).lean(),
    ServiceModel.findById(booking.serviceId).lean(),
    StaffModel.findById(booking.staffId).lean(),
    CustomerModel.findById(booking.customerId).lean(),
  ]);

  return toPublicBookingDto(
    booking,
    business as BusinessLike | null,
    service as ServiceLike | null,
    staff as StaffLike | null,
    customer as { name: string; email?: string | null } | null
  );
}

// ---------------------------------------------------------------------------
// Conflict-safe insert (shared by public + manual creation)
// ---------------------------------------------------------------------------

type InsertBookingRecordInput = {
  business: BusinessLike;
  service: ServiceLike;
  staff: StaffLike;
  customerId: unknown;
  startAt: Date;
  source: "online" | "manual";
};

type InsertBookingRecordResult = {
  bookingId: string;
  token: string;
  status: BookingStatus;
  endAt: Date;
};

/**
 * Shared conflict-safe insert (P5-T1). Re-validates the slot against the
 * availability engine, claims the slot keys, and translates a duplicate-key
 * race into 409 `SLOT_TAKEN`. Manual bookings are always `confirmed` (an
 * owner/staff member is making the call); online bookings honour the
 * auto-confirm/deposit rules implemented in P4.
 */
async function insertBookingRecord(
  input: InsertBookingRecordInput
): Promise<InsertBookingRecordResult> {
  const { business, service, staff, customerId, startAt, source } = input;

  const available = await staffOffersSlot({ business, service, staff, startAt });
  if (!available) {
    throw new HttpError("SLOT_TAKEN", "That time is not available.", 409);
  }

  const rules = normaliseRules(business.bookingRules);
  const duration = Math.max(0, Math.floor(service.durationMinutes || 0));
  const buffer = Math.max(0, Math.floor(service.bufferMinutes ?? 0));
  // endAt is the busy-until instant so it matches the slotKeys window exactly;
  // the service itself ends at startAt + durationMinutes.
  const endAt = DateTime.fromJSDate(startAt)
    .plus({ minutes: duration + buffer })
    .toJSDate();
  const slotKeys = buildSlotKeys({
    staffId: String(staff._id),
    startAt,
    durationMinutes: duration,
    bufferMinutes: buffer,
    timezone: business.timezone,
    slotIntervalMinutes: rules.slotIntervalMinutes,
  });

  const status: BookingStatus =
    source === "manual" || (rules.autoConfirm && !rules.depositEnabled)
      ? "confirmed"
      : "pending";

  const token = generateManageToken();
  const manageTokenHash = hashManageToken(token);

  try {
    const booking = await BookingModel.create({
      businessId: business._id,
      serviceId: service._id,
      staffId: staff._id,
      customerId,
      startAt,
      endAt,
      status,
      slotKeys,
      manageTokenHash,
      priceSnapshot: service.price,
      paymentStatus: "unpaid",
      source,
    });
    return { bookingId: String(booking._id), token, status, endAt };
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      throw new HttpError(
        "SLOT_TAKEN",
        "That time was just taken. Please choose another.",
        409
      );
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// createBooking
// ---------------------------------------------------------------------------

export async function createBooking(
  input: CreateBookingInput
): Promise<CreateBookingResult> {
  await connectToDatabase();

  const business = (await BusinessModel.findOne({
    slug: input.slug.toLowerCase(),
  }).lean()) as BusinessLike | null;
  if (!business) {
    throw new HttpError("NOT_FOUND", "Business not found.", 404);
  }

  if (!isObjectIdLike(input.serviceId)) {
    throw new HttpError("NOT_FOUND", "Service not found.", 404);
  }
  const service = (await ServiceModel.findOne({
    _id: input.serviceId,
    businessId: business._id,
    isActive: true,
  }).lean()) as ServiceLike | null;
  if (!service) {
    throw new HttpError("NOT_FOUND", "Service not found.", 404);
  }

  const startAt = new Date(input.startAt);
  if (!Number.isFinite(startAt.getTime())) {
    throw new HttpError("VALIDATION_ERROR", "startAt must be a valid ISO date.", 400);
  }

  // Resolve the staff member: an explicit id must belong to this business and
  // be assigned to the service; otherwise pick the first eligible staff who
  // actually offers the requested slot ("any available").
  const assignedIds = (service.staffIds ?? []).map((id) => String(id));
  let candidates: StaffLike[];
  if (input.staffId) {
    if (!isObjectIdLike(input.staffId)) {
      throw new HttpError("NOT_FOUND", "Staff member not found.", 404);
    }
    const staff = (await StaffModel.findOne({
      _id: input.staffId,
      businessId: business._id,
      isActive: true,
    }).lean()) as StaffLike | null;
    if (!staff) {
      throw new HttpError("NOT_FOUND", "Staff member not found.", 404);
    }
    if (assignedIds.length > 0 && !assignedIds.includes(String(staff._id))) {
      throw new HttpError(
        "NOT_FOUND",
        "That staff member is not assigned to this service.",
        404
      );
    }
    candidates = [staff];
  } else {
    candidates = (await StaffModel.find({
      businessId: business._id,
      isActive: true,
      ...(assignedIds.length > 0 ? { _id: { $in: assignedIds } } : {}),
    }).lean()) as StaffLike[];
  }

  let chosen: StaffLike | null = null;
  for (const staff of candidates) {
    if (await staffOffersSlot({ business, service, staff, startAt })) {
      chosen = staff;
      break;
    }
  }
  if (!chosen) {
    throw new HttpError("SLOT_TAKEN", "That time is not available.", 409);
  }

  const customer = await findOrCreateCustomer({
    businessId: business._id,
    name: input.name,
    email: input.email,
    phone: input.phone,
    preferredChannel: input.preferredChannel,
  });

  const record = await insertBookingRecord({
    business,
    service,
    staff: chosen,
    customerId: customer._id,
    startAt,
    source: "online",
  });

  return {
    bookingId: record.bookingId,
    startAt: startAt.toISOString(),
    endAt: record.endAt.toISOString(),
    status: record.status,
    timezone: business.timezone,
    manageUrl: `${appBaseUrl()}/booking/${record.token}`,
    token: record.token,
    email: input.email,
    customerName: input.name,
    serviceName: service.name,
    staffName: chosen.name,
    price: service.price,
    currency: business.currency,
    businessName: business.name,
    businessPhone: business.phone ?? null,
    businessAddress: business.address ?? null,
  };
}

// ---------------------------------------------------------------------------
// Shared reschedule (token + dashboard paths)
// ---------------------------------------------------------------------------

/**
 * Move a booking to a new slot after validating it against the availability
 * engine (P5-T2). Replacing the whole `slotKeys` array on one document is
 * atomic: old keys are freed and new ones claimed in a single write, and a
 * conflict aborts the write leaving the old keys intact.
 */
async function performReschedule(input: {
  bookingId: unknown;
  business: BusinessLike;
  service: ServiceLike;
  staff: StaffLike;
  startAt: Date;
}) {
  const { bookingId, business, service, staff, startAt } = input;

  const available = await staffOffersSlot({
    business,
    service,
    staff,
    startAt,
    excludeBookingId: bookingId,
  });
  if (!available) {
    throw new HttpError(
      "SLOT_TAKEN",
      "That time is not available. Please choose another.",
      409
    );
  }

  const rules = normaliseRules(business.bookingRules);
  const duration = Math.max(0, Math.floor(service.durationMinutes || 0));
  const buffer = Math.max(0, Math.floor(service.bufferMinutes ?? 0));
  const endAt = DateTime.fromJSDate(startAt)
    .plus({ minutes: duration + buffer })
    .toJSDate();
  const slotKeys = buildSlotKeys({
    staffId: String(staff._id),
    startAt,
    durationMinutes: duration,
    bufferMinutes: buffer,
    timezone: business.timezone,
    slotIntervalMinutes: rules.slotIntervalMinutes,
  });

  let updated;
  try {
    updated = await BookingModel.findOneAndUpdate(
      { _id: bookingId, status: { $in: BLOCKING_STATUSES } },
      { $set: { startAt, endAt, slotKeys } },
      { new: true }
    );
  } catch (error) {
    if ((error as { code?: number }).code === 11000) {
      throw new HttpError(
        "SLOT_TAKEN",
        "That time was just taken. Please choose another.",
        409
      );
    }
    throw error;
  }

  if (!updated) {
    throw new HttpError(
      "CONFLICT",
      "This booking can no longer be rescheduled.",
      409
    );
  }

  return updated;
}

// ---------------------------------------------------------------------------
// Manage-token lookups: fetch / cancel / reschedule
// ---------------------------------------------------------------------------

export async function getPublicBookingByToken(
  token: string
): Promise<PublicBookingDto | null> {
  await connectToDatabase();
  const booking = await BookingModel.findOne({
    manageTokenHash: hashManageToken(token),
  }).lean();
  if (!booking) return null;
  return buildPublicBookingDto(booking);
}

export async function cancelBookingByToken(
  token: string
): Promise<PublicBookingDto> {
  await connectToDatabase();
  const booking = await BookingModel.findOne({
    manageTokenHash: hashManageToken(token),
  });
  if (!booking) {
    throw new HttpError("NOT_FOUND", "Booking not found.", 404);
  }

  // Cancelling an already-cancelled booking is idempotent.
  if (booking.status === "cancelled") {
    return buildPublicBookingDto(booking.toObject());
  }

  if (booking.status !== "pending" && booking.status !== "confirmed") {
    throw new HttpError(
      "CONFLICT",
      "This booking can no longer be cancelled.",
      409
    );
  }

  const business = (await BusinessModel.findById(
    booking.businessId
  ).lean()) as BusinessLike | null;
  const { cancelWindowHours } = normaliseRules(business?.bookingRules);
  const cancelDeadline = DateTime.fromJSDate(booking.startAt)
    .minus({ hours: cancelWindowHours })
    .toJSDate();

  if (Date.now() > cancelDeadline.getTime()) {
    throw new HttpError(
      "CONFLICT",
      `Bookings can only be cancelled at least ${cancelWindowHours} hour(s) in advance.`,
      409
    );
  }

  booking.status = "cancelled";
  booking.cancelledAt = new Date();
  await booking.save();

  return buildPublicBookingDto(booking.toObject());
}

export async function rescheduleBookingByToken(
  token: string,
  startAtISO: string
): Promise<PublicBookingDto> {
  await connectToDatabase();

  const booking = await BookingModel.findOne({
    manageTokenHash: hashManageToken(token),
  });
  if (!booking) {
    throw new HttpError("NOT_FOUND", "Booking not found.", 404);
  }
  if (booking.status !== "pending" && booking.status !== "confirmed") {
    throw new HttpError(
      "CONFLICT",
      "This booking can no longer be rescheduled.",
      409
    );
  }

  const startAt = new Date(startAtISO);
  if (!Number.isFinite(startAt.getTime())) {
    throw new HttpError("VALIDATION_ERROR", "startAt must be a valid ISO date.", 400);
  }

  const business = (await BusinessModel.findById(
    booking.businessId
  ).lean()) as BusinessLike | null;
  const service = (await ServiceModel.findById(
    booking.serviceId
  ).lean()) as ServiceLike | null;
  const staff = (await StaffModel.findById(
    booking.staffId
  ).lean()) as StaffLike | null;
  if (!business || !service || !staff) {
    throw new HttpError("NOT_FOUND", "Booking not found.", 404);
  }

  if (startAt.getTime() === new Date(booking.startAt).getTime()) {
    return buildPublicBookingDto(booking.toObject());
  }

  const updated = await performReschedule({
    bookingId: booking._id,
    business,
    service,
    staff,
    startAt,
  });

  return buildPublicBookingDto(updated.toObject());
}

// ---------------------------------------------------------------------------
// Expiry (used by the cleanup cron, P7-T2)
// ---------------------------------------------------------------------------

/**
 * Cancel abandoned `pending` bookings. Non-deposit pending bookings expire
 * 15 minutes after creation; deposit-pending bookings (once the deposit flow
 * lands in P8) expire after 24 hours. Paid bookings are never touched.
 */
export async function expirePendingBookings(now = new Date()): Promise<number> {
  await connectToDatabase();

  const standardCutoff = DateTime.fromJSDate(now)
    .minus({ minutes: 15 })
    .toJSDate();
  const depositCutoff = DateTime.fromJSDate(now)
    .minus({ hours: 24 })
    .toJSDate();

  const standard = await BookingModel.updateMany(
    {
      status: "pending",
      paymentStatus: { $ne: "paid" },
      createdAt: { $lte: standardCutoff },
      $or: [
        { depositAmount: { $exists: false } },
        { depositAmount: null },
        { depositAmount: { $lte: 0 } },
      ],
    },
    { $set: { status: "cancelled", cancelledAt: now } }
  );

  const deposit = await BookingModel.updateMany(
    {
      status: "pending",
      paymentStatus: { $ne: "paid" },
      depositAmount: { $gt: 0 },
      createdAt: { $lte: depositCutoff },
    },
    { $set: { status: "cancelled", cancelledAt: now } }
  );

  return standard.modifiedCount + deposit.modifiedCount;
}

// ---------------------------------------------------------------------------
// Dashboard operations (P5-T1 / P5-T2)
// ---------------------------------------------------------------------------

export type BookingListFilter = {
  businessId: string;
  status?: string[];
  staffId?: string;
  fromUtc?: Date;
  toUtc?: Date;
  customerIds?: unknown[];
};

/** Filtered booking list with service/staff/customer names (P5-T1). */
export async function listBookings(
  filter: BookingListFilter
): Promise<BookingDto[]> {
  await connectToDatabase();

  const query: Record<string, unknown> = { businessId: filter.businessId };
  if (filter.status && filter.status.length > 0) {
    query.status = { $in: filter.status };
  }
  if (filter.staffId) query.staffId = filter.staffId;
  if (filter.customerIds) query.customerId = { $in: filter.customerIds };
  if (filter.fromUtc || filter.toUtc) {
    const startAt: Record<string, Date> = {};
    if (filter.fromUtc) startAt.$gte = filter.fromUtc;
    if (filter.toUtc) startAt.$lt = filter.toUtc;
    query.startAt = startAt;
  }

  const bookings = await BookingModel.find(query)
    .sort({ startAt: 1 })
    .limit(500)
    .populate("serviceId", "name durationMinutes price")
    .populate("staffId", "name")
    .populate("customerId", "name email phone")
    .lean();
  return bookings.map((booking) => serializeBooking(booking));
}

/** Single booking with names (P5-T2). Returns null when out of scope. */
export async function getBookingDetail(
  businessId: string,
  bookingId: string
): Promise<BookingDto | null> {
  await connectToDatabase();
  if (!isObjectIdLike(bookingId)) return null;

  const booking = await BookingModel.findOne({ _id: bookingId, businessId })
    .populate("serviceId", "name durationMinutes price")
    .populate("staffId", "name")
    .populate("customerId", "name email phone")
    .lean();
  if (!booking) return null;
  return serializeBooking(booking);
}

/**
 * Apply a dashboard status transition (P5-T2). Only `pending`/`confirmed`
 * bookings can change; the same target is a no-op so double clicks are safe.
 * Cancelling frees the slot keys automatically via the partial index.
 */
export async function updateBookingStatus(input: {
  businessId: string;
  bookingId: string;
  status: "confirmed" | "completed" | "no_show" | "cancelled";
}): Promise<BookingDto> {
  await connectToDatabase();
  const { businessId, bookingId, status } = input;

  if (!isObjectIdLike(bookingId)) {
    throw new HttpError("NOT_FOUND", "Booking not found.", 404);
  }
  const booking = await BookingModel.findOne({ _id: bookingId, businessId });
  if (!booking) {
    throw new HttpError("NOT_FOUND", "Booking not found.", 404);
  }

  if (booking.status !== status) {
    if (booking.status !== "pending" && booking.status !== "confirmed") {
      throw new HttpError(
        "CONFLICT",
        "This booking can no longer be updated.",
        409
      );
    }
    const update: Record<string, unknown> = { status };
    if (status === "cancelled") update.cancelledAt = new Date();
    await BookingModel.updateOne(
      { _id: booking._id, status: { $in: BLOCKING_STATUSES } },
      { $set: update }
    );
  }

  const detail = await getBookingDetail(businessId, bookingId);
  if (!detail) {
    throw new HttpError("NOT_FOUND", "Booking not found.", 404);
  }
  return detail;
}

/** Reschedule a booking by id with slot validation (P5-T2). */
export async function rescheduleBookingById(input: {
  businessId: string;
  bookingId: string;
  startAt: string;
}): Promise<BookingDto> {
  await connectToDatabase();
  const { businessId, bookingId, startAt: startAtISO } = input;

  if (!isObjectIdLike(bookingId)) {
    throw new HttpError("NOT_FOUND", "Booking not found.", 404);
  }
  const booking = await BookingModel.findOne({ _id: bookingId, businessId });
  if (!booking) {
    throw new HttpError("NOT_FOUND", "Booking not found.", 404);
  }
  if (booking.status !== "pending" && booking.status !== "confirmed") {
    throw new HttpError(
      "CONFLICT",
      "This booking can no longer be rescheduled.",
      409
    );
  }

  const startAt = new Date(startAtISO);
  if (!Number.isFinite(startAt.getTime())) {
    throw new HttpError("VALIDATION_ERROR", "startAt must be a valid ISO date.", 400);
  }

  if (startAt.getTime() !== new Date(booking.startAt).getTime()) {
    const business = (await BusinessModel.findById(
      booking.businessId
    ).lean()) as BusinessLike | null;
    const service = (await ServiceModel.findById(
      booking.serviceId
    ).lean()) as ServiceLike | null;
    const staff = (await StaffModel.findById(
      booking.staffId
    ).lean()) as StaffLike | null;
    if (!business || !service || !staff) {
      throw new HttpError("NOT_FOUND", "Booking not found.", 404);
    }
    await performReschedule({
      bookingId: booking._id,
      business,
      service,
      staff,
      startAt,
    });
  }

  const detail = await getBookingDetail(businessId, bookingId);
  if (!detail) {
    throw new HttpError("NOT_FOUND", "Booking not found.", 404);
  }
  return detail;
}

export type CreateManualBookingInput = {
  businessId: string;
  serviceId: string;
  staffId: string;
  startAt: string;
  customerId?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
};

/**
 * Manual (walk-in / phone) booking created from the dashboard (P5-T1). Uses
 * the same conflict-safe insert as the public flow, pins `source:'manual'`,
 * and starts `confirmed`. The customer is resolved by id or find-or-created
 * from name + email/phone.
 */
export async function createManualBooking(
  input: CreateManualBookingInput
): Promise<BookingDto> {
  await connectToDatabase();

  const business = (await BusinessModel.findById(
    input.businessId
  ).lean()) as BusinessLike | null;
  if (!business) {
    throw new HttpError("NOT_FOUND", "Business not found.", 404);
  }

  if (!isObjectIdLike(input.serviceId)) {
    throw new HttpError("NOT_FOUND", "Service not found.", 404);
  }
  const service = (await ServiceModel.findOne({
    _id: input.serviceId,
    businessId: business._id,
    isActive: true,
  }).lean()) as ServiceLike | null;
  if (!service) {
    throw new HttpError("NOT_FOUND", "Service not found.", 404);
  }

  if (!isObjectIdLike(input.staffId)) {
    throw new HttpError("NOT_FOUND", "Staff member not found.", 404);
  }
  const staff = (await StaffModel.findOne({
    _id: input.staffId,
    businessId: business._id,
    isActive: true,
  }).lean()) as StaffLike | null;
  if (!staff) {
    throw new HttpError("NOT_FOUND", "Staff member not found.", 404);
  }
  const assignedIds = (service.staffIds ?? []).map((id) => String(id));
  if (assignedIds.length > 0 && !assignedIds.includes(String(staff._id))) {
    throw new HttpError(
      "NOT_FOUND",
      "That staff member is not assigned to this service.",
      404
    );
  }

  const startAt = new Date(input.startAt);
  if (!Number.isFinite(startAt.getTime())) {
    throw new HttpError("VALIDATION_ERROR", "startAt must be a valid ISO date.", 400);
  }

  let customerId: unknown;
  if (input.customerId) {
    if (!isObjectIdLike(input.customerId)) {
      throw new HttpError("NOT_FOUND", "Customer not found.", 404);
    }
    const customer = await CustomerModel.findOne({
      _id: input.customerId,
      businessId: business._id,
    }).lean();
    if (!customer) {
      throw new HttpError("NOT_FOUND", "Customer not found.", 404);
    }
    customerId = customer._id;
  } else {
    const name = input.name?.trim();
    const email = input.email?.trim() || undefined;
    const phone = input.phone?.trim() || undefined;
    if (!name) {
      throw new HttpError("VALIDATION_ERROR", "Customer name is required.", 400);
    }
    if (!email && !phone) {
      throw new HttpError(
        "VALIDATION_ERROR",
        "Customer email or phone is required.",
        400
      );
    }
    const customer = await findOrCreateCustomer({
      businessId: business._id,
      name,
      email,
      phone,
    });
    customerId = customer._id;
  }

  const record = await insertBookingRecord({
    business,
    service,
    staff,
    customerId,
    startAt,
    source: "manual",
  });

  const detail = await getBookingDetail(input.businessId, record.bookingId);
  if (!detail) {
    throw new HttpError(
      "INTERNAL",
      "Booking was created but could not be loaded.",
      500
    );
  }
  return detail;
}
