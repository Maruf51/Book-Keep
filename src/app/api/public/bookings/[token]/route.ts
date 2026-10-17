import { handleRouteError, jsonError } from "@/lib/api";
import { getPublicBookingByToken } from "@/lib/booking";

/**
 * GET /api/public/bookings/[token] (spec §6 — token scoped, no login)
 *
 * The URL secret is matched against the stored sha256 hash; an unknown token
 * returns 404 (never leaks whether a booking exists).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const booking = await getPublicBookingByToken(token);
    if (!booking) return jsonError("NOT_FOUND", "Booking not found.", 404);
    return Response.json(booking);
  } catch (error) {
    return handleRouteError(error);
  }
}
