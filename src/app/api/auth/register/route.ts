import { hash } from "bcryptjs";
import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { jsonError, parseJsonBody } from "@/lib/api";
import { registerSchema } from "@/lib/validators/auth";
import BusinessModel from "@/models/business";
import UserModel from "@/models/user";

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "bookkeep";
}

export async function POST(request: Request) {
  try {
    const payload = await parseJsonBody(request, registerSchema);
    await connectToDatabase();

    const normalizedEmail = payload.email.toLowerCase();
    const existingUser = await UserModel.findOne({ email: normalizedEmail });

    if (existingUser) {
      return jsonError("CONFLICT", "An account with that email already exists.", 409);
    }

    const baseSlug = slugify(payload.businessName);
    const businessExists = await BusinessModel.findOne({ slug: baseSlug });
    const slug = businessExists ? `${baseSlug}-${Math.random().toString(36).slice(2, 8)}` : baseSlug;

    const business = await BusinessModel.create({
      name: payload.businessName,
      slug,
      timezone: payload.timezone ?? "Asia/Dhaka",
      currency: payload.currency ?? "BDT",
      bookingRules: {
        minNoticeHours: 2,
        maxDaysAhead: 60,
        cancelWindowHours: 24,
        slotIntervalMinutes: 30,
        autoConfirm: true,
        depositEnabled: false,
        depositPercent: 0,
        taxRatePercent: 0,
      },
    });

    const passwordHash = await hash(payload.password, 12);
    const user = await UserModel.create({
      name: payload.name,
      email: normalizedEmail,
      passwordHash,
      role: "owner",
      businessId: business._id,
    });

    return NextResponse.json(
      {
        user: {
          id: String(user._id),
          name: user.name,
          email: user.email,
          role: user.role,
          businessId: String(user.businessId),
        },
        business: {
          id: String(business._id),
          name: business.name,
          slug: business.slug,
          timezone: business.timezone,
          currency: business.currency,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as { code?: number }).code === 11000) {
      return jsonError("CONFLICT", "The provided business details are already in use.", 409);
    }

    return jsonError("INTERNAL", "Unable to create your account right now.", 500);
  }
}
