import { connectToDatabase } from "@/lib/db";
import { handleRouteError, parseJsonBody } from "@/lib/api";
import { enforceRateLimit } from "@/lib/rate-limit";
import { bookingSchema } from "@/lib/validators/booking";
import { createBooking } from "@/lib/booking";
import { sendBookingConfirmationEmail } from "@/lib/email";
import type { PublicBookingCreatedDto } from "@/lib/types";

/**
 * POST /api/public/[slug]/bookings (spec §6 — no login, rate limited)
 *
 * in:  { serviceId, staffId?, startAt ISO, name, email, phone? }
 * out: 201 { bookingId, startAt, manageUrl } | 400 | 404 | 409 SLOT_TAKEN | 429
 *
 * The price is always taken server-side from the Service document; the
 * confirmation email is dispatched best-effort (console stub without a
 * Resend key) and never blocks the booking.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const limited = enforceRateLimit(request, "public:book", 10);
    if (limited) return limited;

    const { slug } = await params;
    const payload = await parseJsonBody(request, bookingSchema);
    await connectToDatabase();

    const result = await createBooking({
      slug,
      serviceId: payload.serviceId,
      staffId: payload.staffId ?? null,
      startAt: payload.startAt,
      name: payload.name,
      email: payload.email,
      phone: payload.phone ?? null,
      preferredChannel: payload.preferredChannel,
    });

    try {
      await sendBookingConfirmationEmail({
        to: result.email,
        customerName: result.customerName,
        businessName: result.businessName,
        serviceName: result.serviceName,
        staffName: result.staffName,
        startAt: result.startAt,
        timezone: result.timezone,
        price: result.price,
        currency: result.currency,
        status: result.status === "pending" ? "pending" : "confirmed",
        manageUrl: result.manageUrl,
        businessPhone: result.businessPhone,
        businessAddress: result.businessAddress,
      });
    } catch (error) {
      // A failed confirmation email must not fail the booking.
      console.error("[booking] confirmation email failed", error);
    }

    const body: PublicBookingCreatedDto = {
      bookingId: result.bookingId,
      startAt: result.startAt,
      endAt: result.endAt,
      status: result.status,
      timezone: result.timezone,
      manageUrl: result.manageUrl,
    };

    return Response.json(body, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
