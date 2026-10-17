import { requireRole } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { handleRouteError, jsonError, parseJsonBody } from "@/lib/api";
import { manualBookingSchema } from "@/lib/validators/booking";
import { createManualBooking, listBookings } from "@/lib/booking";
import { dateInTzToUtcRange } from "@/lib/time";
import type { BookingStatus } from "@/lib/types";
import BusinessModel from "@/models/business";
import CustomerModel from "@/models/customer";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;
const STATUSES: BookingStatus[] = [
  "pending",
  "confirmed",
  "completed",
  "cancelled",
  "no_show",
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * GET /api/bookings?status=&from=&to=&staffId=&q= (P5-T1)
 * Staff callers only ever see their own bookings. `from`/`to` are
 * YYYY-MM-DD dates interpreted in the business timezone.
 * out: 200 BookingDto[]
 */
export async function GET(request: Request) {
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

    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.getAll("status").flatMap((s) => s.split(","));
    const status = statusParam.map((s) => s.trim()).filter(Boolean);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const requestedStaffId = searchParams.get("staffId");
    const q = searchParams.get("q")?.trim();

    if (status.some((value) => !STATUSES.includes(value as BookingStatus))) {
      return jsonError("VALIDATION_ERROR", "Unknown booking status.", 400);
    }

    // Staff scoping: a staff member can only ever query their own bookings.
    let staffId: string | undefined;
    if (user.role === "staff") {
      if (!user.staffProfileId) {
        return Response.json([]);
      }
      staffId = user.staffProfileId;
    } else if (requestedStaffId) {
      if (!OBJECT_ID_RE.test(requestedStaffId)) {
        return jsonError("VALIDATION_ERROR", "staffId must be an ObjectId.", 400);
      }
      staffId = requestedStaffId;
    }

    let fromUtc: Date | undefined;
    let toUtc: Date | undefined;
    if (from) {
      if (!DATE_RE.test(from)) {
        return jsonError("VALIDATION_ERROR", "from must be YYYY-MM-DD.", 400);
      }
      fromUtc = dateInTzToUtcRange(from, business.timezone).startUtc;
    }
    if (to) {
      if (!DATE_RE.test(to)) {
        return jsonError("VALIDATION_ERROR", "to must be YYYY-MM-DD.", 400);
      }
      toUtc = dateInTzToUtcRange(to, business.timezone).endUtc;
    }

    let customerIds: unknown[] | undefined;
    if (q) {
      const regex = new RegExp(escapeRegExp(q), "i");
      const customers = await CustomerModel.find({
        businessId: user.businessId,
        $or: [{ name: regex }, { email: regex }, { phone: regex }],
      })
        .select("_id")
        .lean();
      customerIds = customers.map((customer) => customer._id);
    }

    const bookings = await listBookings({
      businessId: user.businessId,
      status: status.length > 0 ? status : undefined,
      staffId,
      fromUtc,
      toUtc,
      customerIds,
    });

    return Response.json(bookings);
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * POST /api/bookings — manual booking (P5-T1).
 * Staff callers are pinned to their own staff profile.
 * in:  { serviceId, staffId, startAt, customerId? | name/email/phone }
 * out: 201 BookingDto | 409 SLOT_TAKEN | 404/400
 */
export async function POST(request: Request) {
  try {
    const user = await requireRole(["owner", "staff"]);
    await connectToDatabase();

    if (!user.businessId) {
      return jsonError("FORBIDDEN", "No business is linked to this account.", 403);
    }

    const payload = await parseJsonBody(request, manualBookingSchema);

    let staffId = payload.staffId;
    if (user.role === "staff") {
      if (!user.staffProfileId) {
        return jsonError("FORBIDDEN", "No staff profile is linked to this account.", 403);
      }
      staffId = user.staffProfileId;
    }

    const booking = await createManualBooking({
      businessId: user.businessId,
      serviceId: payload.serviceId,
      staffId,
      startAt: payload.startAt,
      customerId: payload.customerId,
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
    });

    return Response.json(booking, { status: 201 });
  } catch (error) {
    return handleRouteError(error, {
      duplicateCode: "SLOT_TAKEN",
      duplicateMessage: "That time is no longer available.",
    });
  }
}
