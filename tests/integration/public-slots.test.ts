import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { startMemoryMongo, stopMemoryMongo } from "../helpers/memory-mongo";
import { buildRequest } from "../helpers/auth-mock";
import BusinessModel from "@/models/business";
import ServiceModel from "@/models/service";
import StaffModel from "@/models/staff";
import CustomerModel from "@/models/customer";
import BookingModel from "@/models/booking";

const publicRoute = await import("@/app/api/public/[slug]/route");
const slotsRoute = await import("@/app/api/public/[slug]/slots/route");

const businessData = {
  name: "Glow Salon",
  slug: "glow-salon",
  timezone: "Asia/Dhaka",
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

describe("public business + slots endpoints (integration)", () => {
  let businessId: unknown;
  let serviceId: string;
  let staffId: string;
  let otherStaffId: string;

  // Fixed reference date: Tuesday 2026-10-20 (business timezone).
  const day = "2026-10-20";

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
    businessId = business._id;

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
      weeklyHours: [
        { weekday: 2, ranges: [{ start: "09:00", end: "17:00" }] },
      ],
      isActive: true,
    });
    staffId = String(staff._id);

    const otherStaff = await StaffModel.create({
      businessId,
      name: "Bilal",
      weeklyHours: [
        { weekday: 2, ranges: [{ start: "09:00", end: "17:00" }] },
      ],
      isActive: true,
    });
    otherStaffId = String(otherStaff._id);
  });

  function slotsRequest(query: Record<string, string>) {
    return slotsRoute.GET(buildRequest("GET", undefined, query), {
      params: Promise.resolve({ slug: "glow-salon" }),
    } as never);
  }

  it("GET /api/public/[slug] returns business, active services and staff", async () => {
    const res = await publicRoute.GET(buildRequest("GET"), {
      params: Promise.resolve({ slug: "glow-salon" }),
    } as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      business: { name: string; timezone: string; currency: string };
      services: Array<{ name: string }>;
      staff: Array<{ name: string }>;
    };
    expect(body.business.name).toBe("Glow Salon");
    expect(body.business.timezone).toBe("Asia/Dhaka");
    expect(body.business.currency).toBe("BDT");
    expect(body.services.map((s) => s.name)).toEqual(["Haircut"]);
    expect(body.staff.map((s) => s.name).sort()).toEqual(["Anika", "Bilal"]);
    // No internal ids beyond the public ids, no secrets.
    expect(JSON.stringify(body)).not.toContain("passwordHash");
    expect(JSON.stringify(body)).not.toContain("stripeAccountId");
  });

  it("GET /api/public/[slug] 404s for unknown slug", async () => {
    const res = await publicRoute.GET(buildRequest("GET"), {
      params: Promise.resolve({ slug: "no-such-business" }),
    } as never);
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("slots endpoint returns the full grid for an open day", async () => {
    const res = await slotsRequest({ serviceId, staffId, date: day });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      timezone: string;
      slots: Array<{ startAt: string; label: string }>;
    };
    expect(body.timezone).toBe("Asia/Dhaka");
    expect(body.slots.length).toBe(15); // 09:00..16:00, 60-min service
    expect(body.slots[0].label).toBe("9:00 AM");
    expect(body.slots[0].startAt).toBe("2026-10-20T03:00:00.000Z");
    // UTC ISO + business-TZ label contract.
    expect(body.slots[0].startAt.endsWith("Z")).toBe(true);
  });

  it("a manually inserted confirmed booking blocks its slots", async () => {
    // Insert a booking directly: 10:00–11:00 Dhaka on the requested day.
    const customer = await CustomerModel.create({
      businessId,
      name: "Rahim",
      email: "rahim@example.com",
    });
    const start = DateTime.fromISO(`${day}T10:00:00`, { zone: "Asia/Dhaka" });
    await BookingModel.create({
      businessId,
      serviceId,
      staffId,
      customerId: customer._id,
      startAt: start.toJSDate(),
      endAt: start.plus({ minutes: 60 }).toJSDate(),
      status: "confirmed",
      slotKeys: ["test_key_1"],
      manageTokenHash: "hash",
      priceSnapshot: 150000,
    });

    const res = await slotsRequest({ serviceId, staffId, date: day });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      slots: Array<{ label: string }>;
    };
    const labels = body.slots.map((s) => s.label);
    // Booking [10:00,11:00) with 60-min candidate windows blocks
    // starts 09:30, 10:00, 10:30.
    expect(labels).not.toContain("9:30 AM");
    expect(labels).not.toContain("10:00 AM");
    expect(labels).not.toContain("10:30 AM");
    expect(labels).toContain("9:00 AM");
    expect(labels).toContain("11:00 AM");
    expect(body.slots).toHaveLength(12);
  });

  it("cancelled bookings free their slots again", async () => {
    const customer = await CustomerModel.create({
      businessId,
      name: "Rahim",
      email: "rahim@example.com",
    });
    const start = DateTime.fromISO(`${day}T10:00:00`, { zone: "Asia/Dhaka" });
    await BookingModel.create({
      businessId,
      serviceId,
      staffId,
      customerId: customer._id,
      startAt: start.toJSDate(),
      endAt: start.plus({ minutes: 60 }).toJSDate(),
      status: "cancelled",
      slotKeys: [], // cancelled bookings fall out of the partial index
      manageTokenHash: "hash",
      priceSnapshot: 150000,
    });

    const res = await slotsRequest({ serviceId, staffId, date: day });
    const body = (await res.json()) as { slots: Array<{ label: string }> };
    expect(body.slots.map((s) => s.label)).toContain("10:00 AM");
    expect(body.slots).toHaveLength(15);
  });

  it("another staff member's booking does not block this staff's slots", async () => {
    const customer = await CustomerModel.create({
      businessId,
      name: "Rahim",
      email: "rahim@example.com",
    });
    const start = DateTime.fromISO(`${day}T10:00:00`, { zone: "Asia/Dhaka" });
    await BookingModel.create({
      businessId,
      serviceId,
      staffId: otherStaffId,
      customerId: customer._id,
      startAt: start.toJSDate(),
      endAt: start.plus({ minutes: 60 }).toJSDate(),
      status: "confirmed",
      slotKeys: ["test_key_other"],
      manageTokenHash: "hash",
      priceSnapshot: 150000,
    });

    const res = await slotsRequest({ serviceId, staffId, date: day });
    const body = (await res.json()) as { slots: Array<{ label: string }> };
    expect(body.slots).toHaveLength(15);
  });

  it("validates date format and rejects malformed ids", async () => {
    const badDate = await slotsRequest({ serviceId, staffId, date: "Oct 20" });
    expect(badDate.status).toBe(400);
    const badDateBody = (await badDate.json()) as { error: { code: string } };
    expect(badDateBody.error.code).toBe("VALIDATION_ERROR");

    const badId = await slotsRequest({ serviceId: "nope", staffId, date: day });
    expect(badId.status).toBe(400);
  });

  it("404s when service or staff belongs to another business", async () => {
    // A different tenant's resources must not be reachable via this slug.
    const otherBusiness = await BusinessModel.create({
      name: "Other Biz",
      slug: "other-biz",
      timezone: "Asia/Dhaka",
      currency: "BDT",
    });
    const foreignService = await ServiceModel.create({
      businessId: otherBusiness._id,
      name: "Foreign",
      durationMinutes: 30,
      price: 1000,
      staffIds: [],
      isActive: true,
    });
    const foreignStaff = await StaffModel.create({
      businessId: otherBusiness._id,
      name: "Foreign Staff",
      isActive: true,
    });

    const res = await slotsRequest({
      serviceId: String(foreignService._id),
      staffId,
      date: day,
    });
    expect(res.status).toBe(404);

    const res2 = await slotsRequest({
      serviceId,
      staffId: String(foreignStaff._id),
      date: day,
    });
    expect(res2.status).toBe(404);
  });

  it("404s for unknown slug (with well-formed ids so validation passes)", async () => {
    const res = await slotsRoute.GET(
      buildRequest("GET", undefined, {
        serviceId,
        staffId,
        date: day,
      }),
      { params: Promise.resolve({ slug: "ghost" }) } as never
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("404s when the staff is not assigned to a restricted service", async () => {
    const restricted = await ServiceModel.create({
      businessId,
      name: "Color",
      durationMinutes: 60,
      price: 500000,
      staffIds: [otherStaffId], // only Bilal, not Anika
      isActive: true,
    });
    const res = await slotsRequest({
      serviceId: String(restricted._id),
      staffId, // Anika
      date: day,
    });
    expect(res.status).toBe(404);
  });

  it("rate limits repeated requests with 429 + Retry-After", async () => {
    let last: Response | null = null;
    // enforceRateLimit allows 60/min per IP per scope — hit it 61 times.
    for (let i = 0; i < 61; i += 1) {
      last = await slotsRequest({ serviceId, staffId, date: day });
      if (last.status === 429) break;
    }
    expect(last).not.toBeNull();
    expect(last!.status).toBe(429);
    expect(last!.headers.get("Retry-After")).toBeTruthy();
    const body = (await last!.json()) as { error: { code: string } };
    expect(body.error.code).toBe("RATE_LIMITED");
  });
});
