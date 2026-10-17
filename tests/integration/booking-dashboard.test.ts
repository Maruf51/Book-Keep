import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DateTime } from "luxon";
import { startMemoryMongo, stopMemoryMongo } from "../helpers/memory-mongo";
import { buildRequest } from "../helpers/auth-mock";
import BusinessModel from "@/models/business";
import ServiceModel from "@/models/service";
import StaffModel from "@/models/staff";
import CustomerModel from "@/models/customer";
import BookingModel from "@/models/booking";

/**
 * Phase 5 (PLAN P5-T1/T2/T3/T4/T11): dashboard bookings, summary, business
 * profile, customer history and availability — all through the real route
 * handlers against an in-memory MongoDB.
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

const bookingsRoute = await import("@/app/api/bookings/route");
const bookingItemRoute = await import("@/app/api/bookings/[id]/route");
const summaryRoute = await import("@/app/api/dashboard/summary/route");
const businessRoute = await import("@/app/api/business/route");
const customerItemRoute = await import("@/app/api/customers/[id]/route");
const slotsRoute = await import("@/app/api/slots/route");

const weeklyHours = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  ranges: [{ start: "09:00", end: "17:00" }],
}));

let businessId: string;
let serviceId: string;
let staffAId: string;
let staffBId: string;
let customerId: string;

function params(id: string) {
  return { params: Promise.resolve({ id }) } as never;
}

function targetISO(daysAhead: number, hour: number): string {
  return DateTime.now()
    .setZone(TZ)
    .plus({ days: daysAhead })
    .set({ hour, minute: 0, second: 0, millisecond: 0 })
    .toUTC()
    .toISO()!;
}

function dayISO(daysAhead: number): string {
  return DateTime.now().setZone(TZ).plus({ days: daysAhead }).toISODate()!;
}

function asOwner() {
  authState.user = {
    id: "507f1f77bcf86cd799439010",
    businessId,
    role: "owner",
    staffProfileId: null,
  };
}

function asStaff(staffId: string) {
  authState.user = {
    id: "507f1f77bcf86cd799439030",
    businessId,
    role: "staff",
    staffProfileId: staffId,
  };
}

async function insertBooking(overrides: Record<string, unknown>) {
  const { startAt: startAtInput, ...rest } = overrides;
  const startAt = startAtInput
    ? new Date(startAtInput as string | Date)
    : new Date();
  return BookingModel.create({
    businessId,
    serviceId,
    staffId: staffAId,
    customerId,
    startAt,
    endAt: new Date(startAt.getTime() + 60 * 60_000),
    status: "confirmed",
    slotKeys: [`direct-${Math.random().toString(36).slice(2)}`],
    manageTokenHash: "hash",
    priceSnapshot: 150000,
    paymentStatus: "unpaid",
    source: "manual",
    ...rest,
  });
}

describe("dashboard bookings API (P5)", () => {
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

    const business = await BusinessModel.create({
      name: "Dash Salon",
      slug: "dash-salon",
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
    });
    businessId = String(business._id);

    const staffA = await StaffModel.create({
      businessId: business._id,
      name: "Anika",
      weeklyHours,
      isActive: true,
    });
    staffAId = String(staffA._id);

    const staffB = await StaffModel.create({
      businessId: business._id,
      name: "Bela",
      weeklyHours,
      isActive: true,
    });
    staffBId = String(staffB._id);

    const service = await ServiceModel.create({
      businessId: business._id,
      name: "Haircut",
      durationMinutes: 60,
      bufferMinutes: 0,
      price: 150000,
      staffIds: [staffA._id, staffB._id],
      isActive: true,
    });
    serviceId = String(service._id);

    const customer = await CustomerModel.create({
      businessId: business._id,
      name: "Walkin Wanda",
      email: "wanda@example.com",
      phone: "+8801700000001",
    });
    customerId = String(customer._id);

    asOwner();
  });

  it("creates a manual booking (source manual, confirmed) via POST /api/bookings", async () => {
    const res = await bookingsRoute.POST(
      buildRequest("POST", {
        serviceId,
        staffId: staffAId,
        startAt: targetISO(3, 10),
        name: "Walkin Wanda",
        email: "wanda@example.com",
        phone: "+8801700000001",
      })
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      id: string;
      status: string;
      source: string;
      price: number;
      service: { name: string } | null;
      staff: { name: string } | null;
      customer: { name: string } | null;
    };
    expect(body.status).toBe("confirmed");
    expect(body.source).toBe("manual");
    expect(body.price).toBe(150000);
    expect(body.service?.name).toBe("Haircut");
    expect(body.staff?.name).toBe("Anika");
    expect(body.customer?.name).toBe("Walkin Wanda");

    // No duplicate customer should have been created for the same email.
    expect(await CustomerModel.countDocuments({ businessId })).toBe(1);
  });

  it("rejects a conflicting manual booking with 409 SLOT_TAKEN (same conflict-safe path)", async () => {
    const startAt = targetISO(3, 10);
    const first = await bookingsRoute.POST(
      buildRequest("POST", {
        serviceId,
        staffId: staffAId,
        startAt,
        name: "First",
        email: "first@example.com",
      })
    );
    expect(first.status).toBe(201);

    const second = await bookingsRoute.POST(
      buildRequest("POST", {
        serviceId,
        staffId: staffAId,
        startAt,
        name: "Second",
        email: "second@example.com",
      })
    );
    expect(second.status).toBe(409);
    const body = (await second.json()) as { error: { code: string } };
    expect(body.error.code).toBe("SLOT_TAKEN");
  });

  it("pins staff callers to their own profile on POST", async () => {
    asStaff(staffAId);
    const res = await bookingsRoute.POST(
      buildRequest("POST", {
        serviceId,
        // Malicious/incorrect staffId — must be overridden by the session.
        staffId: staffBId,
        startAt: targetISO(4, 9),
        name: "Staff Guest",
        email: "guest@example.com",
      })
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { staff: { id: string } | null };
    expect(body.staff?.id).toBe(staffAId);
  });

  it("P5-T11: staff only see their own bookings, owners see all", async () => {
    const a = await bookingsRoute.POST(
      buildRequest("POST", {
        serviceId,
        staffId: staffAId,
        startAt: targetISO(3, 10),
        name: "Ann",
        email: "ann@example.com",
      })
    );
    const aId = ((await a.json()) as { id: string }).id;

    await bookingsRoute.POST(
      buildRequest("POST", {
        serviceId,
        staffId: staffBId,
        startAt: targetISO(3, 11),
        name: "Bob",
        email: "bob@example.com",
      })
    );

    // Owner sees both.
    const all = await bookingsRoute.GET(buildRequest("GET"));
    expect(((await all.json()) as unknown[]).length).toBe(2);

    // Staff A sees only their own.
    asStaff(staffAId);
    const mine = await bookingsRoute.GET(buildRequest("GET"));
    const mineBody = (await mine.json()) as Array<{ id: string; staff: { id: string } }>;
    expect(mineBody).toHaveLength(1);
    expect(mineBody[0].id).toBe(aId);

    // Staff A cannot read staff B's booking detail.
    const allOwner = await BookingModel.find({ businessId }).lean();
    const otherId = String(
      allOwner.find((b) => String(b.staffId) === staffBId)?._id
    );
    const detail = await bookingItemRoute.GET(buildRequest("GET"), params(otherId));
    expect(detail.status).toBe(404);

    // And their own detail works.
    const ownDetail = await bookingItemRoute.GET(buildRequest("GET"), params(aId));
    expect(ownDetail.status).toBe(200);
  });

  it("filters by status, staffId, date range and q (owner)", async () => {
    await bookingsRoute.POST(
      buildRequest("POST", {
        serviceId,
        staffId: staffAId,
        startAt: targetISO(3, 10),
        name: "Wanda Search",
        email: "search@example.com",
      })
    );
    await insertBooking({
      staffId: staffBId,
      status: "completed",
      startAt: targetISO(5, 10),
    });

    const byStatus = await bookingsRoute.GET(
      buildRequest("GET", undefined, { status: "completed" })
    );
    expect(((await byStatus.json()) as unknown[]).length).toBe(1);

    const byStaff = await bookingsRoute.GET(
      buildRequest("GET", undefined, { staffId: staffAId })
    );
    expect(((await byStaff.json()) as unknown[]).length).toBe(1);

    const byQ = await bookingsRoute.GET(
      buildRequest("GET", undefined, { q: "search" })
    );
    expect(((await byQ.json()) as unknown[]).length).toBe(1);

    const byRange = await bookingsRoute.GET(
      buildRequest("GET", undefined, { from: dayISO(3), to: dayISO(3) })
    );
    const rangeBody = (await byRange.json()) as unknown[];
    expect(rangeBody.length).toBe(1);
  });

  it("PATCH applies status transitions and blocks illegal ones", async () => {
    const res = await bookingsRoute.POST(
      buildRequest("POST", {
        serviceId,
        staffId: staffAId,
        startAt: targetISO(3, 10),
        name: "Status Test",
        email: "status@example.com",
      })
    );
    const id = ((await res.json()) as { id: string }).id;

    const completed = await bookingItemRoute.PATCH(
      buildRequest("PATCH", { status: "completed" }),
      params(id)
    );
    expect(completed.status).toBe(200);
    expect(((await completed.json()) as { status: string }).status).toBe("completed");

    const illegal = await bookingItemRoute.PATCH(
      buildRequest("PATCH", { status: "cancelled" }),
      params(id)
    );
    expect(illegal.status).toBe(409);
    expect(
      ((await illegal.json()) as { error: { code: string } }).error.code
    ).toBe("CONFLICT");
  });

  it("PATCH reschedules with slot validation", async () => {
    await bookingsRoute.POST(
      buildRequest("POST", {
        serviceId,
        staffId: staffAId,
        startAt: targetISO(3, 10),
        name: "Amy",
        email: "a@example.com",
      })
    );
    const b = await bookingsRoute.POST(
      buildRequest("POST", {
        serviceId,
        staffId: staffAId,
        startAt: targetISO(3, 11),
        name: "Ben",
        email: "b@example.com",
      })
    );
    expect(b.status).toBe(201);
    const bId = ((await b.json()) as { id: string }).id;

    // Move B onto A's slot → conflict.
    const conflict = await bookingItemRoute.PATCH(
      buildRequest("PATCH", { startAt: targetISO(3, 10) }),
      params(bId)
    );
    expect(conflict.status).toBe(409);
    expect(
      ((await conflict.json()) as { error: { code: string } }).error.code
    ).toBe("SLOT_TAKEN");

    // Move B to a free slot → ok.
    const moved = await bookingItemRoute.PATCH(
      buildRequest("PATCH", { startAt: targetISO(3, 14) }),
      params(bId)
    );
    expect(moved.status).toBe(200);
    const movedBody = (await moved.json()) as { startAt: string };
    expect(new Date(movedBody.startAt).toISOString()).toBe(
      new Date(targetISO(3, 14)).toISOString()
    );
  });

  it("GET /api/dashboard/summary returns today's counts, revenue and no-show rate", async () => {
    // Pick a start that is unambiguously "today" in the business timezone and
    // strictly in the past (robust even when the test runs just after midnight
    // in Asia/Dhaka).
    const tzNow = DateTime.now().setZone(TZ);
    const dayStart = tzNow.startOf("day");
    const oneHourAgo = tzNow.minus({ hours: 1 });
    const earlierToday = (oneHourAgo > dayStart
      ? oneHourAgo
      : dayStart.plus({ minutes: 1 })
    ).toJSDate();

    await insertBooking({ status: "confirmed", startAt: earlierToday });
    await insertBooking({ status: "completed", startAt: earlierToday });
    await insertBooking({ status: "no_show", startAt: earlierToday });

    const res = await summaryRoute.GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      date: string;
      timezone: string;
      currency: string;
      today: Record<string, number>;
      revenue: { today: number; month: number };
      noShowRate: number;
    };
    expect(body.timezone).toBe(TZ);
    expect(body.currency).toBe("BDT");
    expect(body.today.total).toBe(3);
    expect(body.today.confirmed).toBe(1);
    expect(body.today.completed).toBe(1);
    expect(body.today.no_show).toBe(1);
    expect(body.revenue.today).toBe(150000);
    expect(body.revenue.month).toBe(150000);
    // 1 completed + 1 no-show in the trailing window.
    expect(body.noShowRate).toBeCloseTo(0.5);
  });

  it("GET /api/business returns the session profile", async () => {
    const res = await businessRoute.GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      id: string;
      timezone: string;
      bookingRules: { slotIntervalMinutes: number };
    };
    expect(body.id).toBe(businessId);
    expect(body.timezone).toBe(TZ);
    expect(body.bookingRules.slotIntervalMinutes).toBe(30);
  });

  it("GET /api/customers/[id] adds booking history + total spent for owners only", async () => {
    await insertBooking({ status: "completed" });
    await insertBooking({ status: "confirmed" });

    const res = await customerItemRoute.GET(
      buildRequest("GET"),
      params(customerId)
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      totalSpent: number;
      bookings: Array<{ status: string }>;
    };
    expect(body.bookings).toHaveLength(2);
    expect(body.totalSpent).toBe(150000);

    asStaff(staffAId);
    const forbidden = await customerItemRoute.GET(
      buildRequest("GET"),
      params(customerId)
    );
    expect(forbidden.status).toBe(403);
  });

  it("GET /api/slots is scoped to the caller's business and staff", async () => {
    const ok = await slotsRoute.GET(
      buildRequest("GET", undefined, {
        serviceId,
        staffId: staffAId,
        date: dayISO(3),
      })
    );
    expect(ok.status).toBe(200);
    const okBody = (await ok.json()) as { timezone: string; slots: unknown[] };
    expect(okBody.timezone).toBe(TZ);
    expect(okBody.slots.length).toBeGreaterThan(0);

    asStaff(staffBId);
    const forbidden = await slotsRoute.GET(
      buildRequest("GET", undefined, {
        serviceId,
        staffId: staffAId,
        date: dayISO(3),
      })
    );
    expect(forbidden.status).toBe(403);
  });
});
