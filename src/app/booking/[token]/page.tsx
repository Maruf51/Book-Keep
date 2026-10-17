import type { Metadata } from "next";
import ManageBooking from "@/components/booking/manage";

export const metadata: Metadata = {
  title: "Manage your booking — BookKeep",
};

/**
 * Customer manage page (spec §9, PLAN P4-T6). The token is the URL secret;
 * the client component resolves it against the public token API.
 *
 * The token is read at the top (runtime data), so this route opts out of the
 * static-shell requirement.
 */
export const instant = false;

export default async function ManageBookingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <header className="border-b border-slate-800 bg-slate-900/60">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <p className="text-xs uppercase tracking-[0.18em] text-emerald-400">
            BookKeep
          </p>
          <p className="text-sm text-slate-400">Manage booking</p>
        </div>
      </header>
      <ManageBooking token={token} />
    </main>
  );
}
