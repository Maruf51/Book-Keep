/**
 * Absolute base URL for building links that leave the server (emails, Stripe
 * success/cancel URLs). Prefers APP_URL then NEXTAUTH_URL, falling back to
 * localhost for local development.
 */
export function appBaseUrl(): string {
  return (
    process.env.APP_URL ??
    process.env.NEXTAUTH_URL ??
    "http://localhost:3000"
  ).replace(/\/+$/, "");
}
