import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import {
  startMemoryMongo,
  stopMemoryMongo,
} from "../helpers/memory-mongo";
import { buildRequest } from "../helpers/auth-mock";
import BusinessModel from "@/models/business";
import ServiceModel from "@/models/service";
import StaffModel from "@/models/staff";
import CustomerModel from "@/models/customer";
import BookingModel from "@/models/booking";

const bookingsRoute = await import("@/app/api/public/[slug]/bookings/route");
const manageRoute = await import("@/app/api/public/bookings/[token]/route");
const cancelRoute = await import(
  "@/app/api/public/bookings/[token]/cancel/route"
);
const rescheduleRoute = await import(
  "@/app/api/public/bookings/[token]/reschedule/route"
);

/**
 * End-to-end public booking flow through the real route handlers
 * (PLAN P4-T2/T3, acceptance: the customer flow works over HTTP).
 */

const TZ = "Asia/Dhaka";
const SLUG = "flow-salon";

const weeklyHours = Array.from({ length: 7 }, (_, weekday) => ({
  weekday,
  ranges: [{ start: "09:00", end: "17:00" }],
}));

describe("public booking flow (HTTP, integration)", () => {
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

    const business = await BusinessModel.create({
      name: "Flow Salon",
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
    });

    const service = await ServiceModel.create({
      businessId: business._id,
      name: "Haircut",
      durationMinutes: 60,
      bufferMinutes: 0,
      price: 150000,
      staffIds: [],
      isActive: true,
    });
    serviceId = String(service._id);

    const staff = await StaffModel.create({
      businessId: business._id,
      name: "Anika",
      weeklyHours,
      isActive: true,
    });
    staffId = String(staff._id);
  });

  function targetISO(daysAhead: number, hour: number): string {
    return DateTime.now()
      .setZone(TZ)
      .plus({ days: daysAhead })
      .set({ hour, minute: 0, second: 0, millisecond: 0 })
      .toUTC()
      .toISO()!;
  }

  async function createViaHttp(startAt: string, email = "a@example.com") {
    return bookingsRoute.POST(
      buildRequest(
        "POST",
        {
          serviceId,
          staffId,
          startAt,
          name: "Rahim",
          email,
          phone: "+8801700000000",
          // A client-supplied price must be ignored — server pricing wins.
          price: 1,
        },
        undefined
      ),
      { params: Promise.resolve({ slug: SLUG }) } as never
    );
  }

  it("books, reads, reschedules and cancels through the token API", async () => {
    const start = targetISO(3, 10);

    // 1. Create
    const created = await createViaHttp(start);
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      bookingId: string;
      startAt: string;
      status: string;
      manageUrl: string;
      timezone: string;
    };
    expect(createdBody.status).toBe("confirmed");
    expect(createdBody.timezone).toBe(TZ);
    expect(new Date(createdBody.startAt).toISOString()).toBe(
      new Date(start).toISOString()
    );
    const token = createdBody.manageUrl.split("/").pop()!;

    // Server-side price snapshot, not the client's "price".
    const doc = await BookingModel.findById(createdBody.bookingId).lean();
    expect(doc?.priceSnapshot).toBe(150000);

    // 2. Read via token
    const read = await manageRoute.GET(buildRequest("GET"), {
      params: Promise.resolve({ token }),
    } as never);
    expect(read.status).toBe(200);
    const readBody = (await read.json()) as {
      status: string;
      canCancel: boolean;
      canReschedule: boolean;
      service: { name: string } | null;
      staff: { name: string } | null;
      customer: { email: string } | null;
    };
    expect(readBody.status).toBe("confirmed");
    expect(readBody.canCancel).toBe(true);
    expect(readBody.canReschedule).toBe(true);
    expect(readBody.service?.name).toBe("Haircut");
    expect(readBody.staff?.name).toBe("Anika");
    expect(readBody.customer?.email).toBe("a@example.com");

    // 3. Reschedule to a new time
    const newStart = targetISO(3, 14);
    const rescheduled = await rescheduleRoute.POST(
      buildRequest("POST", { startAt: newStart }),
      { params: Promise.resolve({ token }) } as never
    );
    expect(rescheduled.status).toBe(200);
    const rescheduledBody = (await rescheduled.json()) as { startAt: string };
    expect(new Date(rescheduledBody.startAt).toISOString()).toBe(
      new Date(newStart).toISOString()
    );

    // 4. Cancel
    const cancelled = await cancelRoute.POST(buildRequest("POST"), {
      params: Promise.resolve({ token }),
    } as never);
    expect(cancelled.status).toBe(200);
    const cancelledBody = (await cancelled.json()) as { status: string };
    expect(cancelledBody.status).toBe("cancelled");
  });

  it("returns 409 SLOT_TAKEN when the slot is already reserved", async () => {
    const start = targetISO(3, 10);
    const first = await createViaHttp(start, "first@example.com");
    expect(first.status).toBe(201);

    const second = await createViaHttp(start, "second@example.com");
    expect(second.status).toBe(409);
    const body = (await second.json()) as { error: { code: string } };
    expect(body.error.code).toBe("SLOT_TAKEN");
  });

  it("validates the request body and rejects unknown tokens", async () => {
    const bad = await bookingsRoute.POST(
      buildRequest("POST", { serviceId, startAt: "tomorrow" }),
      { params: Promise.resolve({ slug: SLUG }) } as never
    );
    expect(bad.status).toBe(400);

    const missing = await manageRoute.GET(buildRequest("GET"), {
      params: Promise.resolve({ token: "nope" }),
    } as never);
    expect(missing.status).toBe(404);
  });
});
