import { requireRole } from "@/lib/auth";
import { connectToDatabase } from "@/lib/db";
import { handleRouteError, jsonError, parseJsonBody } from "@/lib/api";
import { bookingUpdateSchema } from "@/lib/validators/booking";
import {
  getBookingDetail,
  rescheduleBookingById,
  updateBookingStatus,
} from "@/lib/booking";

/**
 * GET /api/bookings/[id] — booking detail (P5-T2).
 * Staff can only read their own bookings.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(["owner", "staff"]);
    await connectToDatabase();

    if (!user.businessId) {
      return jsonError("FORBIDDEN", "No business is linked to this account.", 403);
    }

    const { id } = await params;
    const booking = await getBookingDetail(user.businessId, id);
    if (!booking || isOutOfScope(user, booking.staff?.id ?? null)) {
      return jsonError("NOT_FOUND", "Booking not found.", 404);
    }

    return Response.json(booking);
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * PATCH /api/bookings/[id] — status transition or reschedule (P5-T2).
 * in: { status } XOR { startAt }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireRole(["owner", "staff"]);
    await connectToDatabase();

    if (!user.businessId) {
      return jsonError("FORBIDDEN", "No business is linked to this account.", 403);
    }

    const { id } = await params;
    const existing = await getBookingDetail(user.businessId, id);
    if (!existing || isOutOfScope(user, existing.staff?.id ?? null)) {
      return jsonError("NOT_FOUND", "Booking not found.", 404);
    }

    const payload = await parseJsonBody(request, bookingUpdateSchema);

    const booking = payload.startAt
      ? await rescheduleBookingById({
          businessId: user.businessId,
          bookingId: id,
          startAt: payload.startAt,
        })
      : await updateBookingStatus({
          businessId: user.businessId,
          bookingId: id,
          status: payload.status!,
        });

    return Response.json(booking);
  } catch (error) {
    return handleRouteError(error, {
      duplicateCode: "SLOT_TAKEN",
      duplicateMessage: "That time is no longer available.",
    });
  }
}

function isOutOfScope(
  user: { role: "owner" | "staff"; staffProfileId?: string | null },
  bookingStaffId: string | null
): boolean {
  if (user.role !== "staff") return false;
  return !user.staffProfileId || bookingStaffId !== user.staffProfileId;
}
