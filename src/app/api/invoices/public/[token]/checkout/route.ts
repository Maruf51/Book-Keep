import Stripe from "stripe";
import { handleRouteError, jsonError } from "@/lib/api";
import { appBaseUrl } from "@/lib/url";
import { getStripe } from "@/lib/stripe";
import {
  getInvoiceCheckoutContext,
  setInvoiceCheckoutSession,
} from "@/lib/invoice";

/**
 * POST /api/invoices/public/[token]/checkout (public, no login) — creates a
 * Stripe Checkout Session for an unpaid invoice (P6-T5). Without a secret key
 * the handler returns 503 `STRIPE_NOT_CONFIGURED`.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const context = await getInvoiceCheckoutContext(token);
    if (!context) return jsonError("NOT_FOUND", "Invoice not found.", 404);

    if (context.status === "paid") {
      return jsonError("ALREADY_PAID", "This invoice is already paid.", 409);
    }
    if (context.status === "void") {
      return jsonError("CONFLICT", "This invoice is no longer payable.", 409);
    }

    // Throws HttpError(503 STRIPE_NOT_CONFIGURED) when no key is present.
    const stripe = getStripe();

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] =
      context.lineItems.map((item) => ({
        quantity: item.qty,
        price_data: {
          currency: context.currency,
          unit_amount: item.unitPrice,
          product_data: { name: item.description },
        },
      }));

    if (context.tax > 0) {
      lineItems.push({
        quantity: 1,
        price_data: {
          currency: context.currency,
          unit_amount: context.tax,
          product_data: { name: "Tax" },
        },
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      metadata: { invoiceId: context.invoiceId, kind: "invoice" },
      customer_email: context.customerEmail ?? undefined,
      success_url: `${appBaseUrl()}/invoice/${token}?paid=1`,
      cancel_url: `${appBaseUrl()}/invoice/${token}`,
    });

    if (session.id) {
      await setInvoiceCheckoutSession({
        invoiceId: context.invoiceId,
        sessionId: session.id,
      });
    }

    return Response.json({ url: session.url });
  } catch (error) {
    return handleRouteError(error);
  }
}
