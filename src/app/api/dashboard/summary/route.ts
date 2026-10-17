import { DateTime } from "luxon";
import { requireRole } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { handleRouteError, jsonError } from "@/lib/api";
import { dateInTzToUtcRange, todayInTz } from "@/lib/time";
import type { DashboardSummaryDto } from "@/lib/types";
import BusinessModel from "@/models/business";
import BookingModel from "@/models/booking";

const NO_SHOW_WINDOW_DAYS = 30;

/**
 * GET /api/dashboard/summary (P5-T3)
 * Today's booking counts, revenue for today and the current month, and the
 * trailing no-show rate — all computed in the business timezone.
 * out: 200 DashboardSummaryDto
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

    const timezone = business.timezone;
    const now = new Date();
    const today = todayInTz(now, timezone);
    const { startUtc, endUtc } = dateInTzToUtcRange(today, timezone);

    const todayBookings = await BookingModel.find({
      businessId: user.businessId,
      startAt: { $gte: startUtc, $lt: endUtc },
    })
      .select("status priceSnapshot")
      .lean();

    const counts = {
      total: 0,
      pending: 0,
      confirmed: 0,
      completed: 0,
      cancelled: 0,
      no_show: 0,
    };
    let revenueToday = 0;
    for (const booking of todayBookings) {
      counts.total += 1;
      if (booking.status in counts && booking.status !== "total") {
        counts[booking.status as keyof typeof counts] += 1;
      }
      if (booking.status === "completed") {
        revenueToday += booking.priceSnapshot;
      }
    }

    const monthStart = DateTime.fromJSDate(now).setZone(timezone).startOf("month");
    const monthEnd = monthStart.plus({ months: 1 });
    const monthBookings = await BookingModel.find({
      businessId: user.businessId,
      status: "completed",
      startAt: { $gte: monthStart.toJSDate(), $lt: monthEnd.toJSDate() },
    })
      .select("priceSnapshot")
      .lean();
    const revenueMonth = monthBookings.reduce(
      (sum, booking) => sum + booking.priceSnapshot,
      0
    );

    const windowStart = DateTime.fromJSDate(now)
      .setZone(timezone)
      .minus({ days: NO_SHOW_WINDOW_DAYS });
    const recent = await BookingModel.find({
      businessId: user.businessId,
      status: { $in: ["completed", "no_show"] },
      startAt: { $gte: windowStart.toJSDate(), $lt: now },
    })
      .select("status")
      .lean();
    const noShowCount = recent.filter((b) => b.status === "no_show").length;
    const noShowRate = recent.length === 0 ? 0 : noShowCount / recent.length;

    const summary: DashboardSummaryDto = {
      date: today,
      timezone,
      currency: business.currency,
      today: counts,
      revenue: { today: revenueToday, month: revenueMonth },
      noShowRate,
    };

    return Response.json(summary);
  } catch (error) {
    return handleRouteError(error);
  }
}
