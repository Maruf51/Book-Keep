import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { DateTime } from "luxon";
import {
  startMemoryMongo,
  stopMemoryMongo,
} from "../helpers/memory-mongo";
import { HttpError } from "@/lib/api";
import {
  buildSlotKeys,
  cancelBookingByToken,
  createBooking,
  expirePendingBookings,
  getPublicBookingByToken,
  hashManageToken,
  rescheduleBookingByToken,
  type CreateBookingResult,
} from "@/lib/booking";
import BusinessModel from "@/models/business";
import ServiceModel from "@/models/service";
import StaffModel from "@/models/staff";
import CustomerModel from "@/models/customer";
import BookingModel from "@/models/booking";

/**
 * Double-booking protection & manage-token flows (PLAN P4-T7).
 * Slot uniqueness is enforced by Mongo's unique multikey partial index on
 * `slotKeys`; these tests prove the race is safe, not just the happy path.
 */

const TZ = "Asia/Dhaka";
const SLUG = "conflict-salon";

const businessData = {
  name: "Conflict Salon",
  slug: SLUG,
  timezone: TZ,
  currency: "BDT",
  bookingRules: {
    minNoticeHours: 0,
    maxDaysAhead: 60,
    cancelWindowHours: 24,
    slotIntervalMinutes: 30,
    autoConfirm: true,
    depositEnabled: false,
    depositPercent: 0,
    taxRatePercent: 0,
  },
};

const weeklyHours = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  ranges: [{ start: "09:00", end: "17:00" }],
}));

describe("booking creation & conflicts (integration)", () => {
  let businessId: string;
  let serviceId: string;
  let staffId: string;

  beforeAll(async () => {
    await startMemoryMongo();
  });

  afterAll(async () => {
    await BookingModel.deleteMany({});
    await CustomerModel.deleteMany({});
    await StaffModel.deleteMany({});
    await ServiceModel.deleteMany({});
    await BusinessModel.deleteMany({});
    await stopMemoryMongo();
  });

  beforeEach(async () => {
    await BookingModel.deleteMany({});
    await CustomerModel.deleteMany({});
    await StaffModel.deleteMany({});
    await ServiceModel.deleteMany({});
    await BusinessModel.deleteMany({});

    const business = await BusinessModel.create(businessData);
    businessId = String(business._id);

    const service = await ServiceModel.create({
      businessId,
      name: "Haircut",
      durationMinutes: 60,
      bufferMinutes: 0,
      price: 150000,
      staffIds: [],
      isActive: true,
    });
    serviceId = String(service._id);

    const staff = await StaffModel.create({
      businessId,
      name: "Anika",
      weeklyHours,
      isActive: true,
    });
    staffId = String(staff._id);
  });

  /** ISO instant for a future slot, in the business timezone. */
  function targetISO(daysAhead: number, hour: number, minute = 0): string {
    return DateTime.now()
      .setZone(TZ)
      .plus({ days: daysAhead })
      .set({ hour, minute, second: 0, millisecond: 0 })
      .toUTC()
      .toISO()!;
  }

  function input(overrides: Partial<Parameters<typeof createBooking>[0]> = {}) {
    return {
      slug: SLUG,
      serviceId,
      staffId,
      startAt: targetISO(3, 10),
      name: "Rahim",
      email: "rahim@example.com",
      phone: "+8801700000000",
      ...overrides,
    };
  }

  it("two concurrent bookings for the same slot: exactly one wins with 409", async () => {
    const payload = input();
    const results = await Promise.allSettled([
      createBooking(payload),
      createBooking(payload),
    ]);

    const ok = results.filter(
      (r): r is PromiseFulfilledResult<CreateBookingResult> =>
        r.status === "fulfilled"
    );
    const failed = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected"
    );

    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);

    const reason = failed[0].reason as HttpError;
    expect(reason).toBeInstanceOf(HttpError);
    expect(reason.code).toBe("SLOT_TAKEN");

    const bookings = await BookingModel.find({ businessId });
    expect(bookings).toHaveLength(1);
    expect(bookings[0].status).toBe("confirmed");
    // Server-side pricing — never trusted from the client.
    expect(bookings[0].priceSnapshot).toBe(150000);

    const winner = ok[0].value;
    expect(winner.status).toBe("confirmed");
    expect(winner.manageUrl).toContain("/booking/");
    expect(winner.token.length).toBeGreaterThan(20);
    // Only the hash is persisted, never the plaintext token.
    expect(bookings[0].manageTokenHash).toBe(hashManageToken(winner.token));
    expect(bookings[0].manageTokenHash).not.toBe(winner.token);

    // The customer race also resolves to a single customer.
    expect(await CustomerModel.countDocuments({ businessId })).toBe(1);
  });

  it("cancel frees the slot so another customer can book it", async () => {
    const created = await createBooking(input());

    const cancelled = await cancelBookingByToken(created.token);
    expect(cancelled.status).toBe("cancelled");

    const again = await createBooking(
      input({ email: "other@example.com", phone: "+8801711111111" })
    );
    expect(again.status).toBe("confirmed");

    expect(
      await BookingModel.countDocuments({ businessId, status: "confirmed" })
    ).toBe(1);
  });

  it("cancelling is idempotent and rejects unknown tokens", async () => {
    const created = await createBooking(input());
    await cancelBookingByToken(created.token);
    const second = await cancelBookingByToken(created.token);
    expect(second.status).toBe("cancelled");

    expect(await getPublicBookingByToken("not-a-real-token")).toBeNull();
    await expect(cancelBookingByToken("bogus")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("enforces the cancel window (409 when too late)", async () => {
    const created = await createBooking(input());
    // Push the window out past the booking start (start is ~72h away).
    await BusinessModel.updateOne(
      { _id: businessId },
      { $set: { "bookingRules.cancelWindowHours": 100 } }
    );

    await expect(cancelBookingByToken(created.token)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    const reloaded = await BookingModel.findById(created.bookingId).lean();
    expect(reloaded?.status).toBe("confirmed");
  });

  it("reschedule frees the old slot and claims the new one", async () => {
    const soon = targetISO(3, 10);
    const later = targetISO(3, 14);
    const created = await createBooking(input({ startAt: soon }));

    const moved = await rescheduleBookingByToken(created.token, later);
    expect(new Date(moved.startAt).toISOString()).toBe(
      new Date(later).toISOString()
    );

    // Old slot is bookable again.
    const rebook = await createBooking(
      input({ startAt: soon, email: "b@example.com", phone: "+8801722222222" })
    );
    expect(rebook.status).toBe("confirmed");

    // New slot is taken.
    await expect(
      createBooking(
        input({ startAt: later, email: "c@example.com", phone: "+8801733333333" })
      )
    ).rejects.toMatchObject({ code: "SLOT_TAKEN" });
  });

  it("a conflicting reschedule leaves the original booking untouched", async () => {
    const first = targetISO(3, 10);
    const second = targetISO(3, 14);
    await createBooking(input({ startAt: second })); // occupies the target
    const movable = await createBooking(
      input({ startAt: first, email: "b@example.com", phone: "+8801744444444" })
    );

    await expect(
      rescheduleBookingByToken(movable.token, second)
    ).rejects.toMatchObject({ code: "SLOT_TAKEN" });

    const reloaded = await BookingModel.findById(movable.bookingId).lean();
    expect(reloaded?.status).toBe("confirmed");
    expect(new Date(reloaded!.startAt).toISOString()).toBe(
      new Date(first).toISOString()
    );
  });

  it("expires abandoned pending bookings and frees their slots", async () => {
    await BusinessModel.updateOne(
      { _id: businessId },
      { $set: { "bookingRules.autoConfirm": false } }
    );
    const startAt = targetISO(3, 10);
    const created = await createBooking(input({ startAt }));
    expect(created.status).toBe("pending");

    // Backdate creation beyond the 15-minute pending TTL (bypass timestamps).
    await BookingModel.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(created.bookingId) },
      { $set: { createdAt: new Date(Date.now() - 20 * 60 * 1000) } }
    );

    const expired = await expirePendingBookings();
    expect(expired).toBe(1);

    const reloaded = await getPublicBookingByToken(created.token);
    expect(reloaded?.status).toBe("cancelled");

    // Slot is free for a fresh booking.
    const rebook = await createBooking(
      input({ startAt, email: "p@example.com", phone: "+8801755555555" })
    );
    expect(rebook.status).toBe("pending");
  });

  it("builds slotKeys on the business-timezone grid", () => {
    const keys = buildSlotKeys({
      staffId: "staff1",
      startAt: new Date(targetISO(3, 10)),
      durationMinutes: 60,
      bufferMinutes: 15,
      timezone: TZ,
      slotIntervalMinutes: 15,
    });
    const dateLabel = DateTime.now()
      .setZone(TZ)
      .plus({ days: 3 })
      .toISODate();
    expect(keys).toEqual([
      `staff1_${dateLabel}T10:00`,
      `staff1_${dateLabel}T10:15`,
      `staff1_${dateLabel}T10:30`,
      `staff1_${dateLabel}T10:45`,
      `staff1_${dateLabel}T11:00`,
    ]);
  });
});
