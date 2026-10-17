import { handleRouteError, parseJsonBody } from "@/lib/api";
import { rescheduleSchema } from "@/lib/validators/booking";
import { rescheduleBookingByToken } from "@/lib/booking";

/**
 * POST /api/public/bookings/[token]/reschedule (spec §6 — token scoped)
 *
 * in:  { startAt ISO }
 * out: 200 <public booking> | 400 | 404 | 409 SLOT_TAKEN
 *
 * The new start time is re-validated against availability before the atomic
 * slotKeys swap, so a taken slot returns 409 and the original booking stands.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const payload = await parseJsonBody(request, rescheduleSchema);
    const booking = await rescheduleBookingByToken(token, payload.startAt);
    return Response.json(booking);
  } catch (error) {
    return handleRouteError(error);
  }
}
