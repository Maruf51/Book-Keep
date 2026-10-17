"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/client";
import { formatMoney } from "@/lib/money";
import {
  formatDayLabelClient,
  formatTimeClient,
  todayInTzClient,
} from "@/lib/wizard-dates";
import type { BookingDto, BusinessDto, StaffDto } from "@/lib/types";
import StatusBadge from "@/components/dashboard/status-badge";

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No-show" },
];

const inputClass =
  "rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none";

export default function BookingsView({ role }: { role: "owner" | "staff" }) {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState<string | undefined>(undefined);
  const [to, setTo] = useState("");
  const [staffId, setStaffId] = useState("");
  const [q, setQ] = useState("");

  const businessQuery = useQuery({
    queryKey: ["business"],
    queryFn: () => apiFetch<BusinessDto>("/api/business"),
  });
  const staffQuery = useQuery({
    queryKey: ["staff"],
    queryFn: () => apiFetch<StaffDto[]>("/api/staff"),
  });

  const timezone = businessQuery.data?.timezone;
  const currency = businessQuery.data?.currency ?? "BDT";
  const today = timezone ? todayInTzClient(timezone) : "";
  const effectiveFrom = from === undefined ? today : from;

  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (effectiveFrom) params.set("from", effectiveFrom);
  if (to) params.set("to", to);
  if (staffId && role === "owner") params.set("staffId", staffId);
  if (q.trim()) params.set("q", q.trim());
  const queryString = params.toString();

  const bookingsQuery = useQuery({
    queryKey: ["bookings", queryString],
    queryFn: () => apiFetch<BookingDto[]>(`/api/bookings?${queryString}`),
    enabled: Boolean(timezone),
  });

  const bookings = bookingsQuery.data ?? [];

  function resetFilters() {
    setStatus("");
    setFrom("");
    setTo("");
    setStaffId("");
    setQ("");
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-slate-50">Bookings</h2>
          <p className="mt-1 text-sm text-slate-400">
            {role === "staff"
              ? "Your schedule."
              : "Filter by status, date, staff member or search a customer."}
          </p>
        </div>
        <Link
          href="/dashboard/bookings/new"
          className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
        >
          + New booking
        </Link>
      </div>

      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-4">
        <label className="text-xs text-slate-400">
          Status
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className={`mt-1 block ${inputClass}`}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-slate-400">
          From
          <input
            type="date"
            value={effectiveFrom}
            onChange={(event) => setFrom(event.target.value)}
            className={`mt-1 block ${inputClass}`}
          />
        </label>

        <label className="text-xs text-slate-400">
          To
          <input
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className={`mt-1 block ${inputClass}`}
          />
        </label>

        {role === "owner" ? (
          <label className="text-xs text-slate-400">
            Staff
            <select
              value={staffId}
              onChange={(event) => setStaffId(event.target.value)}
              className={`mt-1 block ${inputClass}`}
            >
              <option value="">All staff</option>
              {(staffQuery.data ?? []).map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="min-w-[12rem] flex-1 text-xs text-slate-400">
          Search customer
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Name, email or phone"
            className={`mt-1 block w-full ${inputClass}`}
          />
        </label>

        <button
          type="button"
          onClick={resetFilters}
          className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
        >
          Reset
        </button>
      </div>

      {bookingsQuery.isLoading ? (
        <p className="text-slate-400">Loading bookings…</p>
      ) : bookingsQuery.isError ? (
        <p className="text-rose-400">{bookingsQuery.error.message}</p>
      ) : bookings.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 p-10 text-center">
          <p className="text-slate-300">No bookings match these filters.</p>
          <p className="mt-1 text-sm text-slate-500">
            Try widening the date range or clearing the search.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-950 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3">Staff</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {bookings.map((booking) => (
                <tr
                  key={booking.id}
                  className="cursor-pointer text-slate-200 hover:bg-slate-800/50"
                  onClick={() => {
                    router.push(`/dashboard/bookings/${booking.id}`);
                  }}
                >
                  <td className="px-4 py-3 whitespace-nowrap text-slate-400">
                    {timezone
                      ? `${formatDayLabelClient(booking.startAt, timezone)} · ${formatTimeClient(booking.startAt, timezone)}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/bookings/${booking.id}`}
                      className="font-medium text-slate-50 hover:underline"
                    >
                      {booking.customer?.name ?? "Customer"}
                    </Link>
                    {booking.source === "manual" ? (
                      <span className="ml-2 text-xs text-slate-500">manual</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{booking.service?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-400">
                    {booking.staff?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3">{formatMoney(booking.price, currency)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={booking.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
