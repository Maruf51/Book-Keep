"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/client";
import { formatMoney } from "@/lib/money";
import {
  addDaysISO,
  dateOnlyInTzClient,
  formatDayLabelClient,
  formatTimeClient,
  todayInTzClient,
} from "@/lib/wizard-dates";
import type { BookingDto, BusinessDto, DashboardSummaryDto } from "@/lib/types";
import StatusBadge from "@/components/dashboard/status-badge";

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-50">{value}</p>
    </div>
  );
}

export default function Overview() {
  const businessQuery = useQuery({
    queryKey: ["business"],
    queryFn: () => apiFetch<BusinessDto>("/api/business"),
  });
  const summaryQuery = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => apiFetch<DashboardSummaryDto>("/api/dashboard/summary"),
  });

  const timezone = businessQuery.data?.timezone;
  const currency = businessQuery.data?.currency ?? "BDT";
  const today = timezone ? todayInTzClient(timezone) : null;
  const until = today ? addDaysISO(today, 7) : null;

  const bookingsQuery = useQuery({
    queryKey: ["overview-bookings", today],
    queryFn: () =>
      apiFetch<BookingDto[]>(`/api/bookings?from=${today}&to=${until}`),
    enabled: Boolean(today),
  });

  const summary = summaryQuery.data;
  const bookings = bookingsQuery.data ?? [];
  const todayBookings = timezone
    ? bookings.filter(
        (booking) =>
          dateOnlyInTzClient(booking.startAt, timezone) === today
      )
    : [];
  const todayIds = new Set(todayBookings.map((booking) => booking.id));
  const upcoming = bookings.filter((booking) => !todayIds.has(booking.id));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-50">Overview</h2>
          <p className="mt-1 text-sm text-slate-400">
            Today at a glance, plus the next seven days.
          </p>
        </div>
        <Link
          href="/dashboard/bookings/new"
          className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
        >
          + New booking
        </Link>
      </div>

      {summaryQuery.isError ? (
        <p className="text-rose-400">{summaryQuery.error.message}</p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Today total" value={String(summary?.today.total ?? "—")} />
        <Card
          label="Pending"
          value={String(summary?.today.pending ?? "—")}
        />
        <Card
          label="Confirmed"
          value={String(summary?.today.confirmed ?? "—")}
        />
        <Card
          label="Completed"
          value={String(summary?.today.completed ?? "—")}
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Card
          label="Revenue today"
          value={summary ? formatMoney(summary.revenue.today, currency) : "—"}
        />
        <Card
          label="Revenue this month"
          value={summary ? formatMoney(summary.revenue.month, currency) : "—"}
        />
        <Card
          label="No-show rate (30d)"
          value={summary ? `${Math.round(summary.noShowRate * 100)}%` : "—"}
        />
      </div>

      <section className="mt-8">
        <h3 className="text-lg font-semibold text-slate-100">Today&apos;s bookings</h3>
        {bookingsQuery.isLoading ? (
          <p className="mt-3 text-slate-400">Loading…</p>
        ) : todayBookings.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-slate-700 p-6 text-center text-slate-400">
            Nothing booked today.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-800 overflow-hidden rounded-2xl border border-slate-800">
            {todayBookings.map((booking) => (
              <BookingRow
                key={booking.id}
                booking={booking}
                timezone={timezone!}
              />
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h3 className="text-lg font-semibold text-slate-100">
          Next 7 days
        </h3>
        {bookingsQuery.isLoading ? (
          <p className="mt-3 text-slate-400">Loading…</p>
        ) : upcoming.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-slate-700 p-6 text-center text-slate-400">
            No upcoming bookings.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-800 overflow-hidden rounded-2xl border border-slate-800">
            {upcoming.map((booking) => (
              <BookingRow
                key={booking.id}
                booking={booking}
                timezone={timezone!}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function BookingRow({
  booking,
  timezone,
}: {
  booking: BookingDto;
  timezone: string;
}) {
  return (
    <li>
      <Link
        href={`/dashboard/bookings/${booking.id}`}
        className="flex items-center justify-between gap-4 px-4 py-3 text-sm hover:bg-slate-800/50"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="w-40 shrink-0 text-slate-400">
            {formatDayLabelClient(booking.startAt, timezone)} ·{" "}
            {formatTimeClient(booking.startAt, timezone)}
          </span>
          <span className="truncate font-medium text-slate-100">
            {booking.customer?.name ?? "Customer"}
          </span>
          <span className="truncate text-slate-400">
            {booking.service?.name ?? "Service"}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-3">
          <span className="text-slate-400">{booking.staff?.name ?? "—"}</span>
          <StatusBadge status={booking.status} />
        </span>
      </Link>
    </li>
  );
}
