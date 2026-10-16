import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startMemoryMongo, stopMemoryMongo } from "../helpers/memory-mongo";
import { buildRequest } from "../helpers/auth-mock";
import BusinessModel from "@/models/business";
import ServiceModel from "@/models/service";
import StaffModel from "@/models/staff";
import CustomerModel from "@/models/customer";

const BUSINESS_A = "507f1f77bcf86cd799439011";
const BUSINESS_B = "507f1f77bcf86cd799439012";

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

const serviceItemRoute = await import("@/app/api/services/[id]/route");
const staffItemRoute = await import("@/app/api/staff/[id]/route");
const customersItemRoute = await import("@/app/api/customers/[id]/route");

describe("phase 2: tenant isolation and staff self-profile rules", () => {
  let serviceA: { _id: unknown };
  let staffA: { _id: unknown };
  let staffA2: { _id: unknown };
  let customerA: { _id: unknown };

  beforeAll(async () => {
    await startMemoryMongo();
    await BusinessModel.create([
      { name: "Business A", slug: "business-a" },
      { name: "Business B", slug: "business-b" },
    ]);
  });

  afterAll(async () => {
    await ServiceModel.deleteMany({});
    await StaffModel.deleteMany({});
    await CustomerModel.deleteMany({});
    await BusinessModel.deleteMany({});
    await stopMemoryMongo();
  });

  beforeEach(async () => {
    await ServiceModel.deleteMany({});
    await StaffModel.deleteMany({});
    await CustomerModel.deleteMany({});

    serviceA = await ServiceModel.create({
      businessId: BUSINESS_A,
      name: "A's haircut",
      durationMinutes: 30,
      price: 1000,
    });
    staffA = await StaffModel.create({ businessId: BUSINESS_A, name: "A's staff 1" });
    staffA2 = await StaffModel.create({ businessId: BUSINESS_A, name: "A's staff 2" });
    customerA = await CustomerModel.create({
      businessId: BUSINESS_A,
      name: "A's customer",
      email: "acust@example.com",
    });

    // Default actor: owner of business B (a foreign tenant).
    authState.user = {
      id: "507f1f77bcf86cd799439020",
      businessId: BUSINESS_B,
      role: "owner",
      staffProfileId: null,
    };
  });

  it("business B cannot read A's service (404)", async () => {
    const res = await serviceItemRoute.GET(
      buildRequest("GET"),
      { params: Promise.resolve({ id: String(serviceA._id) }) } as never
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("NOT_FOUND");
  });

  it("business B cannot PATCH A's service (404)", async () => {
    const res = await serviceItemRoute.PATCH(
      buildRequest("PATCH", { name: "Hijacked" }),
      { params: Promise.resolve({ id: String(serviceA._id) }) } as never
    );
    expect(res.status).toBe(404);
    const stored = await ServiceModel.findById(serviceA._id).lean();
    expect(stored?.name).toBe("A's haircut");
  });

  it("business B cannot DELETE A's service (404)", async () => {
    const res = await serviceItemRoute.DELETE(
      buildRequest("DELETE"),
      { params: Promise.resolve({ id: String(serviceA._id) }) } as never
    );
    expect(res.status).toBe(404);
    const stored = await ServiceModel.findById(serviceA._id).lean();
    expect(stored?.isActive).toBe(true);
  });

  it("business B cannot read or PATCH A's staff (404)", async () => {
    const read = await staffItemRoute.GET(
      buildRequest("GET"),
      { params: Promise.resolve({ id: String(staffA._id) }) } as never
    );
    expect(read.status).toBe(404);

    const patch = await staffItemRoute.PATCH(
      buildRequest("PATCH", { name: "Hijacked" }),
      { params: Promise.resolve({ id: String(staffA._id) }) } as never
    );
    expect(patch.status).toBe(404);
    const stored = await StaffModel.findById(staffA._id).lean();
    expect(stored?.name).toBe("A's staff 1");
  });

  it("business B cannot read or PATCH A's customer (404)", async () => {
    const read = await customersItemRoute.GET(
      buildRequest("GET"),
      { params: Promise.resolve({ id: String(customerA._id) }) } as never
    );
    expect(read.status).toBe(404);

    const patch = await customersItemRoute.PATCH(
      buildRequest("PATCH", { name: "Hijacked" }),
      { params: Promise.resolve({ id: String(customerA._id) }) } as never
    );
    expect(patch.status).toBe(404);
  });

  it("staff cannot PATCH another staff profile (403)", async () => {
    authState.user = {
      id: "507f1f77bcf86cd799439030",
      businessId: BUSINESS_A,
      role: "staff",
      staffProfileId: String(staffA._id),
    };

    const res = await staffItemRoute.PATCH(
      buildRequest("PATCH", { name: "Impersonated" }),
      { params: Promise.resolve({ id: String(staffA2._id) }) } as never
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("FORBIDDEN");
    const stored = await StaffModel.findById(staffA2._id).lean();
    expect(stored?.name).toBe("A's staff 2");
  });

  it("staff can PATCH their own profile", async () => {
    authState.user = {
      id: "507f1f77bcf86cd799439030",
      businessId: BUSINESS_A,
      role: "staff",
      staffProfileId: String(staffA._id),
    };

    const res = await staffItemRoute.PATCH(
      buildRequest("PATCH", {
        weeklyHours: [{ weekday: 3, ranges: [{ start: "09:00", end: "12:00" }] }],
      }),
      { params: Promise.resolve({ id: String(staffA._id) }) } as never
    );
    expect(res.status).toBe(200);
    const stored = await StaffModel.findById(staffA._id).lean();
    expect(stored?.weeklyHours).toHaveLength(1);
  });

  it("staff cannot DELETE anyone's profile (requireRole owner)", async () => {
    authState.user = {
      id: "507f1f77bcf86cd799439030",
      businessId: BUSINESS_A,
      role: "staff",
      staffProfileId: String(staffA._id),
    };

    const res = await staffItemRoute.DELETE(
      buildRequest("DELETE"),
      { params: Promise.resolve({ id: String(staffA._id) }) } as never
    );
    expect(res.status).toBe(403);
  });

  it("staff role cannot create services (owner only)", async () => {
    authState.user = {
      id: "507f1f77bcf86cd799439030",
      businessId: BUSINESS_A,
      role: "staff",
      staffProfileId: String(staffA._id),
    };

    const { POST } = await import("@/app/api/services/route");
    const res = await POST(
      buildRequest("POST", { name: "Nope", durationMinutes: 15, price: 500 })
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 for a malformed ObjectId instead of crashing", async () => {
    const res = await serviceItemRoute.GET(
      buildRequest("GET"),
      { params: Promise.resolve({ id: "not-an-objectid" }) } as never
    );
    expect(res.status).toBe(404);
  });
});
