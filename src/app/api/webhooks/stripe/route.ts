import Stripe from "stripe";
import { handleRouteError, jsonError } from "@/lib/api";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { markInvoicePaidBySession, markInvoicePaidBySessionId } from "@/lib/invoice";

/**
 * POST /api/webhooks/stripe (public) — verifies the raw-body signature and
 * reconciles payments (P6-T6).
 *
 * `checkout.session.completed` for an invoice marks it paid (idempotent: a
 * duplicate delivery is a no-op) and flags the linked booking paid. Deposit
 * sessions (`metadata.kind === 'deposit'`) are ignored here and handled by P8.
 * Every other event is acknowledged and ignored.
 */
export async function POST(request: Request) {
  try {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret || !isStripeConfigured()) {
      return jsonError(
        "STRIPE_NOT_CONFIGURED",
        "Stripe webhooks are not configured.",
        503
      );
    }

    const signature = request.headers.get("stripe-signature");
    if (!signature) {
      return jsonError("BAD_REQUEST", "Missing Stripe signature header.", 400);
    }

    const payload = await request.text();

    let event: Stripe.Event;
    try {
      event = getStripe().webhooks.constructEvent(payload, signature, secret);
    } catch {
      return jsonError("INVALID_SIGNATURE", "Invalid Stripe signature.", 400);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const metadata = session.metadata ?? {};

      if (metadata.kind === "deposit") {
        // Deposit confirmation lands in P8 (booking, not invoice).
      } else if (metadata.invoiceId) {
        await markInvoicePaidBySession({
          invoiceId: metadata.invoiceId,
          stripeSessionId: session.id,
        });
      } else if (session.id) {
        // No metadata (e.g. sessions created out-of-band): fall back to the
        // session id we stored when creating the Checkout Session.
        await markInvoicePaidBySessionId({ stripeSessionId: session.id });
      }
    }

    return Response.json({ received: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
