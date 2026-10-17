import Stripe from "stripe";
import { HttpError } from "@/lib/api";

/**
 * Lazily-constructed Stripe client (P6-T5/T6). The SDK is only instantiated
 * when a secret key is present, so builds and tests run without any Stripe
 * configuration and the routes degrade to a 503 `STRIPE_NOT_CONFIGURED`.
 */

let cached: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function isStripeWebhookConfigured(): boolean {
  return Boolean(process.env.STRIPE_WEBHOOK_SECRET);
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new HttpError(
      "STRIPE_NOT_CONFIGURED",
      "Stripe is not configured for this deployment.",
      503
    );
  }
  if (!cached) {
    cached = new Stripe(key);
  }
  return cached;
}
