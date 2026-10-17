import { requireRole } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { handleRouteError, jsonError, parseJsonBody } from "@/lib/api";
import { businessUpdateSchema } from "@/lib/validators/business";
import { isStripeConfigured, isStripeWebhookConfigured } from "@/lib/stripe";
import type { BusinessDto } from "@/lib/types";
import BusinessModel from "@/models/business";

type BusinessLike = {
  _id: unknown;
  name: string;
  slug: string;
  timezone?: string | null;
  currency?: string | null;
  phone?: string | null;
  address?: string | null;
  logoUrl?: string | null;
  bookingRules?: {
    minNoticeHours?: number | null;
    maxDaysAhead?: number | null;
    cancelWindowHours?: number | null;
    slotIntervalMinutes?: number | null;
    autoConfirm?: boolean | null;
    depositEnabled?: boolean | null;
    depositPercent?: number | null;
    taxRatePercent?: number | null;
  } | null;
  notify?: {
    defaultChannel?: "email" | "sms" | "whatsapp" | null;
    reminderHoursAhead?: number | null;
  } | null;
};

function toBusinessDto(business: BusinessLike): BusinessDto {
  const rules = business.bookingRules;
  return {
    id: String(business._id),
    name: business.name,
    slug: business.slug,
    timezone: business.timezone ?? "UTC",
    currency: business.currency ?? "USD",
    phone: business.phone ?? null,
    address: business.address ?? null,
    logoUrl: business.logoUrl ?? null,
    bookingRules: {
      minNoticeHours: rules?.minNoticeHours ?? 0,
      maxDaysAhead: rules?.maxDaysAhead ?? 60,
      cancelWindowHours: rules?.cancelWindowHours ?? 24,
      slotIntervalMinutes: rules?.slotIntervalMinutes ?? 30,
      autoConfirm: rules?.autoConfirm ?? true,
      depositEnabled: rules?.depositEnabled ?? false,
      depositPercent: rules?.depositPercent ?? 0,
      taxRatePercent: rules?.taxRatePercent ?? 0,
    },
    notify: {
      defaultChannel: business.notify?.defaultChannel ?? "email",
      reminderHoursAhead: business.notify?.reminderHoursAhead ?? 24,
    },
    payments: {
      stripeConfigured: isStripeConfigured(),
      webhookConfigured: isStripeWebhookConfigured(),
    },
  };
}

/**
 * GET /api/business — session business profile (P5 dashboard needs the
 * timezone/currency; settings needs rules + notify + payment status).
 * out: 200 BusinessDto
 */
export async function GET() {
  try {
    const user = await requireRole(["owner", "staff"]);
    await connectToDatabase();

    if (!user.businessId) {
      return jsonError("FORBIDDEN", "No business is linked to this account.", 403);
    }

    const business = await BusinessModel.findById(user.businessId).lean();
    if (!business) {
      return jsonError("NOT_FOUND", "Business not found.", 404);
    }

    return Response.json(toBusinessDto(business as BusinessLike));
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * PATCH /api/business (P6-T7) — owner-only settings update. Nested
 * `bookingRules`/`notify` objects merge onto the existing document; a
 * duplicate slug surfaces as 409 `SLUG_TAKEN`.
 * out: 200 BusinessDto
 */
export async function PATCH(request: Request) {
  try {
    const user = await requireRole(["owner"]);
    await connectToDatabase();

    if (!user.businessId) {
      return jsonError("FORBIDDEN", "No business is linked to this account.", 403);
    }

    const payload = await parseJsonBody(request, businessUpdateSchema);

    const set: Record<string, unknown> = {};
    const scalars = [
      "name",
      "slug",
      "timezone",
      "currency",
      "phone",
      "address",
      "logoUrl",
    ] as const;
    for (const key of scalars) {
      if (payload[key] !== undefined) set[key] = payload[key];
    }
    if (payload.bookingRules) {
      for (const [key, value] of Object.entries(payload.bookingRules)) {
        if (value !== undefined) set[`bookingRules.${key}`] = value;
      }
    }
    if (payload.notify) {
      for (const [key, value] of Object.entries(payload.notify)) {
        if (value !== undefined) set[`notify.${key}`] = value;
      }
    }

    const updated = await BusinessModel.findOneAndUpdate(
      { _id: user.businessId },
      { $set: set },
      { new: true, runValidators: true }
    ).lean();

    if (!updated) {
      return jsonError("NOT_FOUND", "Business not found.", 404);
    }

    return Response.json(toBusinessDto(updated as BusinessLike));
  } catch (error) {
    return handleRouteError(error, {
      duplicateCode: "SLUG_TAKEN",
      duplicateMessage: "That slug is already in use.",
    });
  }
}
