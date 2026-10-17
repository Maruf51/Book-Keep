"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/client";
import { formatMoney } from "@/lib/money";
import {
  formatDayLabelClient,
  formatDateTimeClient,
  formatTimeClient,
  todayInTzClient,
} from "@/lib/wizard-dates";
import type { BookingDto, BusinessDto, InvoiceDto, SlotsResponse } from "@/lib/types";
import StatusBadge from "@/components/dashboard/status-badge";

type StatusTarget = "confirmed" | "completed" | "no_show" | "cancelled";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <dt className="text-sm text-slate-400">{label}</dt>
      <dd className="text-right text-sm text-slate-100">{value}</dd>
    </div>
  );
}

export default function BookingDetailView({
  bookingId,
  role,
}: {
  bookingId: string;
  role: "owner" | "staff";
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [date, setDate] = useState("");
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const businessQuery = useQuery({
    queryKey: ["business"],
    queryFn: () => apiFetch<BusinessDto>("/api/business"),
  });
  const bookingQuery = useQuery({
    queryKey: ["booking", bookingId],
    queryFn: () => apiFetch<BookingDto>(`/api/bookings/${bookingId}`),
  });

  const booking = bookingQuery.data;
  const timezone = businessQuery.data?.timezone ?? "UTC";
  const currency = businessQuery.data?.currency ?? "BDT";
  const effectiveDate = date || todayInTzClient(timezone);

  const slotsQuery = useQuery({
    queryKey: ["slots", booking?.service?.id, booking?.staff?.id, effectiveDate],
    queryFn: () =>
      apiFetch<SlotsResponse>(
        `/api/slots?serviceId=${booking!.service!.id}&staffId=${booking!.staff!.id}&date=${effectiveDate}`
      ),
    enabled:
      rescheduleOpen &&
      Boolean(booking?.service?.id) &&
      Boolean(booking?.staff?.id) &&
      /^\d{4}-\d{2}-\d{2}$/.test(effectiveDate),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["booking", bookingId] });
    queryClient.invalidateQueries({ queryKey: ["bookings"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
  }

  const statusMutation = useMutation({
    mutationFn: (status: StatusTarget) =>
      apiFetch<BookingDto>(`/api/bookings/${bookingId}`, {
        method: "PATCH",
        body: { status },
      }),
    onSuccess: () => {
      setActionError(null);
      invalidate();
    },
    onError: (error) => setActionError(error.message),
  });

  const rescheduleMutation = useMutation({
    mutationFn: (startAt: string) =>
      apiFetch<BookingDto>(`/api/bookings/${bookingId}`, {
        method: "PATCH",
        body: { startAt },
      }),
    onSuccess: () => {
      setActionError(null);
      setRescheduleOpen(false);
      setSelectedSlot(null);
      invalidate();
    },
    onError: (error) => setActionError(error.message),
  });

  const invoiceMutation = useMutation({
    mutationFn: () =>
      apiFetch<InvoiceDto>("/api/invoices", {
        method: "POST",
        body: { bookingId },
      }),
    onSuccess: (invoice) => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      router.push(`/dashboard/invoices/${invoice.id}`);
    },
    onError: (error) => setActionError(error.message),
  });

  if (bookingQuery.isLoading) {
    return <p className="text-slate-400">Loading booking…</p>;
  }
  if (bookingQuery.isError || !booking) {
    return (
      <div>
        <p className="text-rose-400">
          {bookingQuery.error?.message ?? "Booking not found."}
        </p>
        <Link
          href="/dashboard/bookings"
          className="mt-4 inline-block text-sm text-emerald-400 hover:underline"
        >
          ← Back to bookings
        </Link>
      </div>
    );
  }

  const canChange =
    booking.status === "pending" || booking.status === "confirmed";

  return (
    <div>
      <Link
        href="/dashboard/bookings"
        className="text-sm text-slate-400 hover:text-slate-200"
      >
        ← Bookings
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-50">
            {booking.customer?.name ?? "Booking"}
          </h2>
          <p className="mt-1 text-sm text-slate-400">
            {formatDayLabelClient(booking.startAt, timezone)} ·{" "}
            {formatTimeClient(booking.startAt, timezone)} –{" "}
            {formatTimeClient(booking.endAt, timezone)}
          </p>
        </div>
        <StatusBadge status={booking.status} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <section className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
              Details
            </h3>
            <dl className="mt-3 divide-y divide-slate-800">
              <Row label="Service" value={booking.service?.name ?? "—"} />
              <Row
                label="Duration"
                value={`${booking.service?.durationMinutes ?? 0} min`}
              />
              <Row label="Staff" value={booking.staff?.name ?? "—"} />
              <Row label="Price" value={formatMoney(booking.price, currency)} />
              <Row
                label="Payment"
                value={<span className="capitalize">{booking.paymentStatus}</span>}
              />
              <Row
                label="Source"
                value={<span className="capitalize">{booking.source}</span>}
              />
              <Row
                label="Created"
                value={formatDateTimeClient(booking.createdAt ?? booking.startAt, timezone)}
              />
              {booking.cancelledAt ? (
                <Row
                  label="Cancelled"
                  value={formatDateTimeClient(booking.cancelledAt, timezone)}
                />
              ) : null}
            </dl>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
              Customer
            </h3>
            <div className="mt-3 space-y-1 text-sm text-slate-200">
              <p className="font-medium text-slate-50">
                {booking.customer?.name ?? "—"}
              </p>
              <p className="text-slate-400">{booking.customer?.email ?? "No email"}</p>
              <p className="text-slate-400">{booking.customer?.phone ?? "No phone"}</p>
              {role === "owner" && booking.customer ? (
                <Link
                  href={`/dashboard/customers/${booking.customer.id}`}
                  className="mt-2 inline-block text-emerald-400 hover:underline"
                >
                  View customer history →
                </Link>
              ) : null}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
              Actions
            </h3>
            <div className="mt-3 flex flex-col gap-2">
              {canChange && booking.status === "pending" ? (
                <ActionButton
                  label="Confirm"
                  onClick={() => statusMutation.mutate("confirmed")}
                  pending={statusMutation.isPending}
                  variant="primary"
                />
              ) : null}
              {canChange ? (
                <>
                  <ActionButton
                    label="Mark completed"
                    onClick={() => statusMutation.mutate("completed")}
                    pending={statusMutation.isPending}
                  />
                  <ActionButton
                    label="Mark no-show"
                    onClick={() => statusMutation.mutate("no_show")}
                    pending={statusMutation.isPending}
                  />
                  <ActionButton
                    label="Cancel booking"
                    onClick={() => {
                      if (window.confirm("Cancel this booking?")) {
                        statusMutation.mutate("cancelled");
                      }
                    }}
                    pending={statusMutation.isPending}
                    variant="danger"
                  />
                </>
              ) : null}
              {!canChange ? (
                <p className="text-sm text-slate-500">
                  This booking is closed and can no longer change.
                </p>
              ) : null}

              {role === "owner" &&
              (booking.status === "confirmed" ||
                booking.status === "completed") ? (
                <button
                  type="button"
                  disabled={invoiceMutation.isPending}
                  onClick={() => invoiceMutation.mutate()}
                  className="mt-1 rounded-xl border border-emerald-500/40 px-3 py-2 text-sm text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-60"
                >
                  {invoiceMutation.isPending ? "Creating…" : "Create invoice"}
                </button>
              ) : null}

              {actionError ? (
                <p className="text-sm text-rose-400">{actionError}</p>
              ) : null}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
                Reschedule
              </h3>
              {canChange ? (
                <button
                  type="button"
                  onClick={() => {
                    setRescheduleOpen((open) => !open);
                    setSelectedSlot(null);
                  }}
                  className="text-xs text-emerald-400 hover:underline"
                >
                  {rescheduleOpen ? "Close" : "Change time"}
                </button>
              ) : null}
            </div>

            {rescheduleOpen && canChange ? (
              <div className="mt-3 space-y-3">
                <input
                  type="date"
                  value={effectiveDate}
                  onChange={(event) => {
                    setDate(event.target.value);
                    setSelectedSlot(null);
                  }}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
                {slotsQuery.isLoading ? (
                  <p className="text-sm text-slate-400">Loading slots…</p>
                ) : (slotsQuery.data?.slots ?? []).length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No open slots on this day.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {(slotsQuery.data?.slots ?? []).map((slot) => (
                      <button
                        key={slot.startAt}
                        type="button"
                        onClick={() => setSelectedSlot(slot.startAt)}
                        className={`rounded-lg border px-2 py-1 text-xs ${
                          selectedSlot === slot.startAt
                            ? "border-emerald-500 bg-emerald-500/15 text-emerald-200"
                            : "border-slate-700 text-slate-300 hover:bg-slate-800"
                        }`}
                      >
                        {slot.label}
                      </button>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  disabled={!selectedSlot || rescheduleMutation.isPending}
                  onClick={() => {
                    if (selectedSlot) rescheduleMutation.mutate(selectedSlot);
                  }}
                  className="w-full rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {rescheduleMutation.isPending ? "Moving…" : "Move booking"}
                </button>
              </div>
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                {formatDateTimeClient(booking.startAt, timezone)}
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function ActionButton({
  label,
  onClick,
  pending,
  variant,
}: {
  label: string;
  onClick: () => void;
  pending: boolean;
  variant?: "primary" | "danger";
}) {
  const classes =
    variant === "primary"
      ? "bg-emerald-500 text-slate-950 hover:bg-emerald-400"
      : variant === "danger"
        ? "border border-rose-500/40 text-rose-300 hover:bg-rose-500/10"
        : "border border-slate-700 text-slate-200 hover:bg-slate-800";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={`rounded-xl px-3 py-2 text-sm font-medium disabled:opacity-60 ${classes}`}
    >
      {label}
    </button>
  );
}
