import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hash } from "bcryptjs";
import BusinessModel from "@/models/business";
import UserModel from "@/models/user";
import { startMemoryMongo, stopMemoryMongo } from "../helpers/memory-mongo";

describe("phase 1 foundation", () => {
  beforeAll(async () => {
    await startMemoryMongo();
    await BusinessModel.deleteMany({});
    await UserModel.deleteMany({});
  });

  afterAll(async () => {
    await BusinessModel.deleteMany({});
    await UserModel.deleteMany({});
    await stopMemoryMongo();
  });

  it("creates a business and stores a hashed password without exposing it by default", async () => {
    const business = await BusinessModel.create({
      name: "Glow Salon",
      slug: "glow-salon",
      timezone: "Asia/Dhaka",
      currency: "BDT",
    });

    const passwordHash = await hash("password123", 12);

    const user = await UserModel.create({
      name: "Owner",
      email: "owner@bookkeep.app",
      passwordHash,
      role: "owner",
      businessId: business._id,
    });

    expect(user.businessId).toEqual(business._id);

    const publicUser = await UserModel.findOne({ email: "owner@bookkeep.app" }).lean();
    expect((publicUser as { passwordHash?: string } | null)?.passwordHash).toBeUndefined();

    const privateUser = await UserModel.findOne({ email: "owner@bookkeep.app" }).select("+passwordHash").lean();
    expect((privateUser as { passwordHash?: string } | null)?.passwordHash).toBeTruthy();
  });

  it("keeps session-ready user fields on the user record", async () => {
    const record = await UserModel.findOne({ email: "owner@bookkeep.app" }).lean();
    expect(record).not.toBeNull();
    expect(record?.role).toBe("owner");
    expect(String(record?.businessId)).toBeTruthy();
  });
});
