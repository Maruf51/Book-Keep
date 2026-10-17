"use client";

import { useCallback, useEffect, useState } from "react";
import type { PublicBookingDto, SlotsResponse } from "@/lib/types";
import { formatMoney } from "@/lib/money";
import {
  formatDateLabelClient,
  formatDateTimeClient,
  maxDateInTzClient,
  todayInTzClient,
} from "@/lib/wizard-dates";

type Slot = { startAt: string; label: string };

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-400",
  confirmed: "bg-emerald-500/15 text-emerald-400",
  completed: "bg-sky-500/15 text-sky-400",
  cancelled: "bg-rose-500/15 text-rose-400",
  no_show: "bg-slate-600/30 text-slate-300",
};

/**
 * Client side of the customer manage page (PLAN P4-T6): shows the booking in
 * the business timezone and drives cancel / reschedule against the token API.
 */
export default function ManageBooking({ token }: { token: string }) {
  const [booking, setBooking] = useState<PublicBookingDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const [rescheduling, setRescheduling] = useState(false);
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);

  // Initial load. All setState calls happen after the first await, so this is
  // not a synchronous setState-in-effect (react-hooks/set-state-in-effect).
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const response = await fetch(`/api/public/bookings/${token}`, {
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as
          | PublicBookingDto
          | { error?: { message?: string } }
          | null;
        if (!active) return;
        if (response.status === 404) {
          setNotFound(true);
          return;
        }
        if (!response.ok) {
          setError(
            (payload as { error?: { message?: string } })?.error?.message ??
              "Could not load your booking."
          );
          return;
        }
        setBooking(payload as PublicBookingDto);
      } catch {
        if (active) setError("Could not load your booking. Please try again.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);

  async function handleCancel() {
    if (!booking) return;
    if (!window.confirm("Are you sure you want to cancel this booking?")) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/public/bookings/${token}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const payload = (await response.json().catch(() => null)) as
        | PublicBookingDto
        | { error?: { message?: string } }
        | null;
      if (!response.ok) {
        setError(
          (payload as { error?: { message?: string } })?.error?.message ??
            "Could not cancel your booking."
        );
        return;
      }
      setBooking(payload as PublicBookingDto);
      setRescheduling(false);
    } catch {
      setError("Could not cancel your booking. Please try again.");
    } finally {
      setPending(false);
    }
  }

  const loadSlots = useCallback(
    async (targetDate: string, current: PublicBookingDto) => {
      if (!current.service || !current.staff) return;
      setSlotsLoading(true);
      setSlotsError(null);
      setSlots([]);
      try {
        const query = new URLSearchParams({
          serviceId: current.service.id,
          staffId: current.staff.id,
          date: targetDate,
        });
        const response = await fetch(
          `/api/public/${current.business.slug}/slots?${query.toString()}`
        );
        const payload = (await response.json().catch(() => null)) as
          | SlotsResponse
          | { error?: { message?: string } }
          | null;
        if (!response.ok) {
          throw new Error(
            (payload as { error?: { message?: string } })?.error?.message ??
              "Could not load available times."
          );
        }
        setSlots((payload as SlotsResponse).slots);
      } catch (err) {
        setSlotsError(
          err instanceof Error ? err.message : "Could not load times."
        );
      } finally {
        setSlotsLoading(false);
      }
    },
    []
  );

  function openReschedule(current: PublicBookingDto) {
    setRescheduling(true);
    setError(null);
    const nextDate = todayInTzClient(current.business.timezone);
    setDate(nextDate);
    void loadSlots(nextDate, current);
  }

  async function handleReschedule(startAt: string) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/public/bookings/${token}/reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startAt }),
      });
      const payload = (await response.json().catch(() => null)) as
        | PublicBookingDto
        | { error?: { code?: string; message?: string } }
        | null;
      if (!response.ok) {
        const envelope = payload as
          | { error?: { code?: string; message?: string } }
          | null;
        setError(
          envelope?.error?.message ?? "Could not reschedule your booking."
        );
        if (booking && envelope?.error?.code === "SLOT_TAKEN") {
          void loadSlots(date, booking);
        }
        return;
      }
      setBooking(payload as PublicBookingDto);
      setRescheduling(false);
    } catch {
      setError("Could not reschedule your booking. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center text-slate-400">
        Loading your booking…
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="text-xl font-bold text-slate-50">Booking not found</h1>
        <p className="mt-2 text-sm text-slate-400">
          This link is invalid or has expired. Please check the link from your
          confirmation email.
        </p>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <p className="text-sm text-rose-400">
          {error ?? "Something went wrong."}
        </p>
      </div>
    );
  }

  const statusStyle =
    STATUS_STYLES[booking.status] ?? "bg-slate-700/40 text-slate-300";
  const isCancelled = booking.status === "cancelled";
  const reschedulable = Boolean(booking.service && booking.staff);

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-50">
            {booking.business.name}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Booking reference {booking.id.slice(-8)}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${statusStyle}`}
        >
          {booking.status.replace("_", " ")}
        </span>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <dl className="grid gap-4 sm:grid-cols-2">
          <Detail label="Service" value={booking.service?.name ?? "—"} />
          <Detail label="With" value={booking.staff?.name ?? "—"} />
          <Detail
            label="Date & time"
            value={formatDateTimeClient(booking.startAt, booking.business.timezone)}
            hint={`All times shown in ${booking.business.timezone}`}
          />
          <Detail
            label="Price"
            value={formatMoney(booking.price, booking.business.currency)}
          />
        </dl>

        {booking.business.address || booking.business.phone ? (
          <p className="mt-5 border-t border-slate-800 pt-4 text-sm text-slate-400">
            {booking.business.address ?? ""}
            {booking.business.address && booking.business.phone ? " · " : ""}
            {booking.business.phone ?? ""}
          </p>
        ) : null}
      </div>

      {error ? <p className="mt-4 text-sm text-rose-400">{error}</p> : null}

      {isCancelled ? (
        <div className="mt-6 rounded-2xl border border-rose-900/60 bg-rose-950/30 p-5 text-sm text-slate-300">
          This booking was cancelled
          {booking.cancelledAt
            ? ` on ${formatDateTimeClient(booking.cancelledAt, booking.business.timezone)}`
            : ""}
          . You can book again from the business page.
        </div>
      ) : (
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={pending || !booking.canCancel}
            title={
              booking.canCancel
                ? undefined
                : `Bookings can only be cancelled at least ${booking.cancelWindowHours} hour(s) in advance.`
            }
            onClick={handleCancel}
            className="rounded-xl border border-rose-800 px-5 py-2.5 text-sm font-semibold text-rose-300 transition hover:bg-rose-950/40 disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-600"
          >
            {pending ? "Working…" : "Cancel booking"}
          </button>

          <button
            type="button"
            disabled={pending || !reschedulable || !booking.canReschedule}
            onClick={() => openReschedule(booking)}
            className="rounded-xl border border-slate-700 px-5 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:text-slate-600"
          >
            Reschedule
          </button>
        </div>
      )}

      {!booking.canCancel && !isCancelled ? (
        <p className="mt-2 text-xs text-slate-500">
          Cancellation is closed — bookings can be cancelled up to{" "}
          {booking.cancelWindowHours} hour(s) before the start time.
        </p>
      ) : null}

      {rescheduling && !isCancelled ? (
        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-50">
              Pick a new time
            </h2>
            <button
              type="button"
              onClick={() => setRescheduling(false)}
              className="text-sm text-slate-400 hover:text-slate-200"
            >
              Close
            </button>
          </div>

          <label className="mt-4 block text-sm text-slate-300">
            Date
            <input
              type="date"
              value={date}
              min={todayInTzClient(booking.business.timezone)}
              max={maxDateInTzClient(
                booking.business.timezone,
                booking.maxDaysAhead
              )}
              onChange={(event) => {
                setDate(event.target.value);
                void loadSlots(event.target.value, booking);
              }}
              className="mt-1 block rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-slate-100 focus:border-emerald-500 focus:outline-none"
            />
          </label>

          <p className="mt-2 text-xs text-slate-500">
            {formatDateLabelClient(date, booking.business.timezone)}
          </p>

          <div className="mt-4 min-h-[80px]">
            {slotsLoading ? (
              <p className="text-sm text-slate-400">Loading times…</p>
            ) : slotsError ? (
              <p className="text-sm text-rose-400">{slotsError}</p>
            ) : slots.length === 0 ? (
              <p className="text-sm text-slate-400">
                No available times on this date.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {slots.map((slot) => (
                  <button
                    key={slot.startAt}
                    type="button"
                    disabled={pending}
                    onClick={() => handleReschedule(slot.startAt)}
                    className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm font-medium text-slate-200 transition hover:border-emerald-600 disabled:opacity-60"
                  >
                    {slot.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Detail({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-slate-100">{value}</dd>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
