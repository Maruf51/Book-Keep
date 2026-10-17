import { connectToDatabase } from "@/lib/db";
import { handleRouteError, jsonError } from "@/lib/api";
import { enforceRateLimit } from "@/lib/rate-limit";
import { dateInTzToUtcRange } from "@/lib/time";
import { getSlots } from "@/lib/availability";
import BusinessModel from "@/models/business";
import ServiceModel from "@/models/service";
import StaffModel from "@/models/staff";
import BookingModel from "@/models/booking";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

/**
 * GET /api/public/[slug]/slots?serviceId=&staffId=&date=YYYY-MM-DD
 * (spec §6/§7 — no login, rate limited)
 * out: 200 { timezone, slots: [{ startAt: ISO UTC, label: "10:00 AM" }] }
 *     | 400 VALIDATION_ERROR | 404 NOT_FOUND | 429 RATE_LIMITED
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const limited = enforceRateLimit(request, "public:slots", 60);
    if (limited) return limited;

    const { slug } = await params;
    const { searchParams } = new URL(request.url);
    const serviceId = searchParams.get("serviceId") ?? "";
    const staffId = searchParams.get("staffId") ?? "";
    const date = searchParams.get("date") ?? "";

    if (!DATE_RE.test(date)) {
      return jsonError("VALIDATION_ERROR", "date must be YYYY-MM-DD.", 400);
    }
    if (!OBJECT_ID_RE.test(serviceId) || !OBJECT_ID_RE.test(staffId)) {
      return jsonError("VALIDATION_ERROR", "serviceId and staffId are required.", 400);
    }

    await connectToDatabase();

    const business = await BusinessModel.findOne({ slug: slug.toLowerCase() }).lean();
    if (!business) return jsonError("NOT_FOUND", "Business not found.", 404);

    // Both the service and the staff member must belong to this slug's
    // business and be active — otherwise 404 (never leak other tenants' ids).
    const [service, staff] = await Promise.all([
      ServiceModel.findOne({
        _id: serviceId,
        businessId: business._id,
        isActive: true,
      }).lean(),
      StaffModel.findOne({
        _id: staffId,
        businessId: business._id,
        isActive: true,
      }).lean(),
    ]);

    if (!service || !staff) {
      return jsonError("NOT_FOUND", "Service or staff member not found.", 404);
    }

    // If the service restricts who can perform it, the staff must be assigned.
    const assignedIds = (service.staffIds ?? []).map((id: unknown) => String(id));
    if (assignedIds.length > 0 && !assignedIds.includes(String(staff._id))) {
      return jsonError(
        "NOT_FOUND",
        "That staff member is not assigned to this service.",
        404
      );
    }

    // Day's bookings for overlap removal (spec §7 step 5).
    const { startUtc, endUtc } = dateInTzToUtcRange(date, business.timezone);
    const bookings = await BookingModel.find({
      businessId: business._id,
      staffId: staff._id,
      // Overlapping window: a booking may start before this day and run into it.
      startAt: { $lt: endUtc },
      endAt: { $gt: startUtc },
      status: { $in: ["pending", "confirmed"] },
    })
      .select("startAt endAt status")
      .lean();

    const slots = getSlots({
      timezone: business.timezone,
      date,
      now: new Date(),
      bookingRules: {
        minNoticeHours: business.bookingRules?.minNoticeHours ?? 0,
        maxDaysAhead: business.bookingRules?.maxDaysAhead ?? 60,
        slotIntervalMinutes: business.bookingRules?.slotIntervalMinutes ?? 30,
      },
      service: {
        durationMinutes: service.durationMinutes,
        bufferMinutes: service.bufferMinutes ?? 0,
      },
      staff: {
        weeklyHours: staff.weeklyHours ?? [],
        daysOff: staff.daysOff ?? [],
      },
      bookings,
    });

    return Response.json({ timezone: business.timezone, slots });
  } catch (error) {
    return handleRouteError(error);
  }
}
