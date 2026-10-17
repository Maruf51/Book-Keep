import { handleRouteError } from "@/lib/api";
import { cancelBookingByToken } from "@/lib/booking";
import { sendBookingCancelledEmail } from "@/lib/email";

/**
 * POST /api/public/bookings/[token]/cancel (spec §6 — token scoped)
 *
 * Enforces the business `cancelWindowHours`; a late attempt returns 409. The
 * cancellation email is best-effort and never blocks the response.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const booking = await cancelBookingByToken(token);

    const email = booking.customer?.email;
    if (email) {
      const baseUrl = (
        process.env.APP_URL ??
        process.env.NEXTAUTH_URL ??
        "http://localhost:3000"
      ).replace(/\/+$/, "");
      try {
        await sendBookingCancelledEmail({
          to: email,
          customerName: booking.customer?.name ?? "there",
          businessName: booking.business.name,
          serviceName: booking.service?.name ?? "your appointment",
          startAt: booking.startAt,
          timezone: booking.business.timezone,
          rebookUrl: `${baseUrl}/b/${booking.business.slug}`,
        });
      } catch (error) {
        console.error("[booking] cancellation email failed", error);
      }
    }

    return Response.json(booking);
  } catch (error) {
    return handleRouteError(error);
  }
}
