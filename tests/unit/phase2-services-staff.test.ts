import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startMemoryMongo, stopMemoryMongo } from "../helpers/memory-mongo";
import { buildRequest } from "../helpers/auth-mock";
import ServiceModel from "@/models/service";
import StaffModel from "@/models/staff";
import CustomerModel from "@/models/customer";

// Mutable auth state so each test can act as a different user/tenant.
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

const servicesRoute = await import("@/app/api/services/route");
const serviceItemRoute = await import("@/app/api/services/[id]/route");
const staffRoute = await import("@/app/api/staff/route");
const staffItemRoute = await import("@/app/api/staff/[id]/route");
const inviteRoute = await import("@/app/api/staff/invite/route");
const customersRoute = await import("@/app/api/customers/route");

function resetAuth() {
  authState.user = {
    id: "507f1f77bcf86cd799439010",
    businessId: "507f1f77bcf86cd799439011",
    role: "owner",
    staffProfileId: null,
  };
}

describe("phase 2: services, staff, customers routes", () => {
  beforeAll(async () => {
    await startMemoryMongo();
  });

  afterAll(async () => {
    await ServiceModel.deleteMany({});
    await StaffModel.deleteMany({});
    await CustomerModel.deleteMany({});
    await stopMemoryMongo();
  });

  beforeEach(async () => {
    resetAuth();
    await ServiceModel.deleteMany({});
    await StaffModel.deleteMany({});
    await CustomerModel.deleteMany({});
  });

  describe("services", () => {
    it("creates and lists services scoped to the business", async () => {
      const create = await servicesRoute.POST(
        buildRequest("POST", { name: "Haircut", durationMinutes: 30, price: 150000 })
      );
      expect(create.status).toBe(201);
      const created = (await create.json()) as { id: string; name: string; price: number };
      expect(created.name).toBe("Haircut");
      expect(created.price).toBe(150000);

      const list = await servicesRoute.GET(buildRequest("GET"));
      expect(list.status).toBe(200);
      const body = (await list.json()) as Array<{ id: string }>;
      expect(body).toHaveLength(1);
      expect(body[0].id).toBe(created.id);
    });

    it("patches a service and soft-deletes it on DELETE (isActive:false)", async () => {
      const created = (await (
        await servicesRoute.POST(
          buildRequest("POST", { name: "Massage", durationMinutes: 60, price: 300000 })
        )
      ).json()) as { id: string };

      const update = await serviceItemRoute.PATCH(
        buildRequest("PATCH", { price: 350000 }),
        { params: Promise.resolve({ id: created.id }) } as never
      );
      expect(update.status).toBe(200);
      const updated = (await update.json()) as { price: number; isActive: boolean };
      expect(updated.price).toBe(350000);
      expect(updated.isActive).toBe(true);

      const del = await serviceItemRoute.DELETE(
        buildRequest("DELETE"),
        { params: Promise.resolve({ id: created.id }) } as never
      );
      expect(del.status).toBe(200);

      // Soft delete: record still exists, just hidden.
      const stored = await ServiceModel.findById(created.id).lean();
      expect(stored).not.toBeNull();
      expect(stored?.isActive).toBe(false);
    });

    it("rejects a service missing required fields with the error envelope", async () => {
      const res = await servicesRoute.POST(buildRequest("POST", { name: "Bad", price: 1000 }));
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string; message: string } };
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(typeof body.error.message).toBe("string");
    });
  });

  describe("staff", () => {
    it("creates and lists a staff member with weekly hours", async () => {
      const create = await staffRoute.POST(
        buildRequest("POST", {
          name: "Anika",
          weeklyHours: [{ weekday: 1, ranges: [{ start: "09:00", end: "17:00" }] }],
        })
      );
      expect(create.status).toBe(201);
      const created = (await create.json()) as {
        id: string;
        name: string;
        weeklyHours: Array<{ weekday: number }>;
      };
      expect(created.name).toBe("Anika");
      expect(created.weeklyHours).toHaveLength(1);

      const list = await staffRoute.GET(buildRequest("GET"));
      const body = (await list.json()) as Array<{ id: string }>;
      expect(body).toHaveLength(1);
    });

    it("owner patches weekly hours and days off, then deactivates", async () => {
      const created = (await (
        await staffRoute.POST(buildRequest("POST", { name: "Bilal" }))
      ).json()) as { id: string };

      const patch = await staffItemRoute.PATCH(
        buildRequest("PATCH", {
          weeklyHours: [{ weekday: 0, ranges: [{ start: "10:00", end: "14:00" }] }],
          daysOff: [{ date: "2026-12-25", reason: "Holiday" }],
        }),
        { params: Promise.resolve({ id: created.id }) } as never
      );
      expect(patch.status).toBe(200);
      const patched = (await patch.json()) as {
        weeklyHours: unknown[];
        daysOff: Array<{ date: string }>;
      };
      expect(patched.weeklyHours).toHaveLength(1);
      expect(patched.daysOff[0].date).toBe("2026-12-25");

      const del = await staffItemRoute.DELETE(
        buildRequest("DELETE"),
        { params: Promise.resolve({ id: created.id }) } as never
      );
      expect(del.status).toBe(200);
      const stored = await StaffModel.findById(created.id).lean();
      expect(stored?.isActive).toBe(false);
    });
  });

  describe("staff invite (POST /api/staff/invite)", () => {
    it("creates Staff + linked User and reports a stubbed email without RESEND_API_KEY", async () => {
      delete process.env.RESEND_API_KEY;

      const res = await inviteRoute.POST(
        buildRequest("POST", { name: "Champa", email: "champa@example.com" })
      );
      expect(res.status).toBe(201);
      const body = (await res.json()) as {
        staff: { id: string; email: string };
        userId: string;
        emailDelivered: boolean;
        emailStubbed: boolean;
      };
      expect(body.staff.email).toBe("champa@example.com");
      expect(body.emailStubbed).toBe(true);

      const staff = await StaffModel.findById(body.staff.id).lean();
      expect(staff).not.toBeNull();

      const user = await (await import("@/models/user")).default
        .findOne({ email: "champa@example.com" })
        .select("+passwordHash");
      expect(user).not.toBeNull();
      expect(user?.role).toBe("staff");
      expect(String(user?.staffProfileId)).toBe(body.staff.id);
      // Password stored hashed, never returned in the response.
      expect(user?.passwordHash).toMatch(/^\$2/);
      expect(JSON.stringify(body)).not.toContain("passwordHash");
    });

    it("rejects an invite when the email already exists", async () => {
      delete process.env.RESEND_API_KEY;
      await inviteRoute.POST(
        buildRequest("POST", { name: "Dup", email: "dup@example.com" })
      );
      const again = await inviteRoute.POST(
        buildRequest("POST", { name: "Dup2", email: "dup@example.com" })
      );
      expect(again.status).toBe(409);
      const body = (await again.json()) as { error: { code: string } };
      expect(body.error.code).toBe("CONFLICT");
    });
  });

  describe("customers", () => {
    it("creates and searches customers", async () => {
      const create = await customersRoute.POST(
        buildRequest("POST", { name: "Rahim", email: "rahim@example.com", phone: "01711234567" })
      );
      expect(create.status).toBe(201);

      const list = await customersRoute.GET(buildRequest("GET"));
      const body = (await list.json()) as Array<{ name: string }>;
      expect(body).toHaveLength(1);

      const search = await customersRoute.GET(
        buildRequest("GET", undefined, { q: "rahim" })
      );
      expect(((await search.json()) as unknown[]).length).toBe(1);

      const noMatch = await customersRoute.GET(
        buildRequest("GET", undefined, { q: "zzzz" })
      );
      expect(((await noMatch.json()) as unknown[]).length).toBe(0);
    });

    it("rejects a duplicate customer email with the error envelope", async () => {
      await customersRoute.POST(buildRequest("POST", { name: "Ann", email: "dup@example.com" }));
      const again = await customersRoute.POST(
        buildRequest("POST", { name: "Bob", email: "dup@example.com" })
      );
      expect(again.status).toBe(409);
      const body = (await again.json()) as { error: { code: string } };
      expect(body.error.code).toBe("CONFLICT");
    });
  });
});
