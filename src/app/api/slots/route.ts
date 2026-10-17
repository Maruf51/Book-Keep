import { requireRole } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { handleRouteError, jsonError } from "@/lib/api";
import { dateInTzToUtcRange } from "@/lib/time";
import { getSlots } from "@/lib/availability";
import BusinessModel from "@/models/business";
import ServiceModel from "@/models/service";
import StaffModel from "@/models/staff";
import BookingModel from "@/models/booking";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/;

/**
 * GET /api/slots?serviceId=&staffId=&date=YYYY-MM-DD (P5-T7/T8)
 * Session-scoped availability for the dashboard (manual booking +
 * reschedule). Mirrors the public slots route but is scoped by session
 * `businessId`, and staff callers can only query their own calendar.
 * out: 200 { timezone, slots: [{ startAt, label }] }
 */
export async function GET(request: Request) {
  try {
    const user = await requireRole(["owner", "staff"]);
    await connectToDatabase();

    if (!user.businessId) {
      return jsonError("FORBIDDEN", "No business is linked to this account.", 403);
    }

    const { searchParams } = new URL(request.url);
    const serviceId = searchParams.get("serviceId") ?? "";
    const requestedStaffId = searchParams.get("staffId") ?? "";
    const date = searchParams.get("date") ?? "";

    if (!DATE_RE.test(date)) {
      return jsonError("VALIDATION_ERROR", "date must be YYYY-MM-DD.", 400);
    }
    if (!OBJECT_ID_RE.test(serviceId) || !OBJECT_ID_RE.test(requestedStaffId)) {
      return jsonError("VALIDATION_ERROR", "serviceId and staffId are required.", 400);
    }

    const staffId =
      user.role === "staff" ? user.staffProfileId ?? "" : requestedStaffId;
    if (!OBJECT_ID_RE.test(staffId)) {
      return jsonError("FORBIDDEN", "No staff profile is linked to this account.", 403);
    }
    if (user.role === "staff" && staffId !== requestedStaffId) {
      return jsonError("FORBIDDEN", "You can only view your own calendar.", 403);
    }

    const business = await BusinessModel.findById(user.businessId).lean();
    if (!business) {
      return jsonError("NOT_FOUND", "Business not found.", 404);
    }

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

    const assignedIds = (service.staffIds ?? []).map((id: unknown) => String(id));
    if (assignedIds.length > 0 && !assignedIds.includes(String(staff._id))) {
      return jsonError(
        "NOT_FOUND",
        "That staff member is not assigned to this service.",
        404
      );
    }

    const { startUtc, endUtc } = dateInTzToUtcRange(date, business.timezone);
    const bookings = await BookingModel.find({
      businessId: business._id,
      staffId: staff._id,
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
