"use client";

import { useState } from "react";

/**
 * Starts Stripe Checkout for a public invoice (P6-T4/T5) and redirects on
 * success. Errors are surfaced inline (e.g. Stripe not configured).
 */
export default function PayButton({ token }: { token: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/invoices/public/${encodeURIComponent(token)}/checkout`,
        { method: "POST" }
      );
      const data = (await response.json().catch(() => null)) as {
        url?: string;
        error?: { message?: string };
      } | null;

      if (!response.ok) {
        throw new Error(
          data?.error?.message ?? "Could not start the payment."
        );
      }
      if (!data?.url) {
        throw new Error("The payment provider did not return a checkout URL.");
      }
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the payment.");
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={startCheckout}
        disabled={loading}
        className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Redirecting to payment…" : "Pay now"}
      </button>
      {error ? <p className="mt-2 text-sm text-rose-400">{error}</p> : null}
    </div>
  );
}
