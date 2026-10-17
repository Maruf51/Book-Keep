"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DateTime } from "luxon";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/client";
import { formatTimeClient, todayInTzClient } from "@/lib/wizard-dates";
import type { BookingDto, BusinessDto, StaffDto } from "@/lib/types";

const HOUR_HEIGHT = 48;
const MIN_HEIGHT = 26;

type Mode = "day" | "week" | "month";

export default function CalendarView({
  role,
  staffProfileId,
}: {
  role: "owner" | "staff";
  staffProfileId: string | null;
}) {
  const businessQuery = useQuery({
    queryKey: ["business"],
    queryFn: () => apiFetch<BusinessDto>("/api/business"),
  });
  const staffQuery = useQuery({
    queryKey: ["staff"],
    queryFn: () => apiFetch<StaffDto[]>("/api/staff"),
  });

  const timezone = businessQuery.data?.timezone ?? "UTC";
  const [mode, setMode] = useState<Mode>("week");
  const [anchor, setAnchor] = useState<string>("");
  const [staffFilter, setStaffFilter] = useState(
    role === "staff" ? staffProfileId ?? "" : ""
  );

  const today = todayInTzClient(timezone);
  const effectiveAnchor = anchor || today;

  const { days, from, to, title } = useMemo(() => {
    const dt = DateTime.fromISO(effectiveAnchor, { zone: timezone });
    if (!dt.isValid) {
      const fallback = DateTime.now().setZone(timezone);
      return {
        days: [fallback],
        from: fallback.toISODate()!,
        to: fallback.toISODate()!,
        title: fallback.toFormat("LLL d, yyyy"),
      };
    }

    if (mode === "month") {
      const start = dt.startOf("month");
      const gridStart = start.minus({ days: start.weekday % 7 });
      return {
        days: Array.from({ length: 42 }, (_, i) => gridStart.plus({ days: i })),
        from: start.toISODate()!,
        to: start.endOf("month").toISODate()!,
        title: start.toFormat("LLLL yyyy"),
      };
    }
    if (mode === "week") {
      const start = dt.minus({ days: dt.weekday % 7 }).startOf("day");
      return {
        days: Array.from({ length: 7 }, (_, i) => start.plus({ days: i })),
        from: start.toISODate()!,
        to: start.plus({ days: 6 }).toISODate()!,
        title: `${start.toFormat("LLL d")} – ${start.plus({ days: 6 }).toFormat("LLL d, yyyy")}`,
      };
    }
    return {
      days: [dt.startOf("day")],
      from: dt.toISODate()!,
      to: dt.toISODate()!,
      title: dt.toFormat("cccc, LLL d, yyyy"),
    };
  }, [effectiveAnchor, mode, timezone]);

  const params = new URLSearchParams({ from, to });
  if (staffFilter) params.set("staffId", staffFilter);

  const bookingsQuery = useQuery({
    queryKey: ["calendar-bookings", from, to, staffFilter],
    queryFn: () => apiFetch<BookingDto[]>(`/api/bookings?${params.toString()}`),
  });

  const bookings = useMemo(
    () => bookingsQuery.data ?? [],
    [bookingsQuery.data]
  );

  const grouped = useMemo(() => {
    const map = new Map<string, BookingDto[]>();
    for (const booking of bookings) {
      const key = DateTime.fromISO(booking.startAt)
        .setZone(timezone)
        .toISODate();
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push(booking);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.startAt.localeCompare(b.startAt));
    }
    return map;
  }, [bookings, timezone]);

  const { startHour, endHour } = useMemo(() => {
    let min = 7;
    let max = 21;
    for (const booking of bookings) {
      const start = DateTime.fromISO(booking.startAt).setZone(timezone);
      const end = DateTime.fromISO(booking.endAt).setZone(timezone);
      min = Math.min(min, Math.max(0, start.hour));
      max = Math.max(max, Math.min(24, end.hour + (end.minute > 0 ? 1 : 0)));
    }
    return { startHour: min, endHour: max };
  }, [bookings, timezone]);

  function shift(delta: number) {
    const dt = DateTime.fromISO(effectiveAnchor, { zone: timezone });
    const next =
      mode === "month"
        ? dt.plus({ months: delta })
        : mode === "week"
          ? dt.plus({ days: delta * 7 })
          : dt.plus({ days: delta });
    setAnchor(next.toISODate()!);
  }

  const gridHeight = (endHour - startHour) * HOUR_HEIGHT;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold text-slate-50">Calendar</h2>
          <p className="mt-1 text-sm text-slate-400">{title}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-slate-700">
            {(["day", "week", "month"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 text-sm capitalize ${
                  mode === m
                    ? "bg-emerald-500 text-slate-950"
                    : "text-slate-300 hover:bg-slate-800"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => shift(-1)}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => setAnchor(today)}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => shift(1)}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
          >
            ›
          </button>
          {role === "owner" ? (
            <select
              value={staffFilter}
              onChange={(event) => setStaffFilter(event.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
            >
              <option value="">All staff</option>
              {(staffQuery.data ?? []).map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </div>

      {bookingsQuery.isError ? (
        <p className="text-rose-400">{bookingsQuery.error.message}</p>
      ) : mode === "month" ? (
        <MonthGrid
          days={days}
          groupByDay={grouped}
          timezone={timezone}
          today={today}
        />
      ) : (
        <TimeGrid
          days={days}
          groupByDay={grouped}
          timezone={timezone}
          startHour={startHour}
          endHour={endHour}
          gridHeight={gridHeight}
          today={today}
        />
      )}
    </div>
  );
}

function TimeGrid({
  days,
  groupByDay,
  timezone,
  startHour,
  endHour,
  gridHeight,
  today,
}: {
  days: DateTime[];
  groupByDay: Map<string, BookingDto[]>;
  timezone: string;
  startHour: number;
  endHour: number;
  gridHeight: number;
  today: string;
}) {
  const hours = Array.from(
    { length: endHour - startHour },
    (_, i) => startHour + i
  );

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-800">
      <div
        className="grid min-w-[44rem]"
        style={{ gridTemplateColumns: `4rem repeat(${days.length}, minmax(0,1fr))` }}
      >
        <div className="border-b border-slate-800" />
        {days.map((day) => {
          const key = day.toISODate()!;
          return (
            <div
              key={key}
              className={`border-b border-l border-slate-800 px-2 py-2 text-center text-sm ${
                key === today ? "text-emerald-400" : "text-slate-300"
              }`}
            >
              <p className="font-medium">{day.toFormat("ccc")}</p>
              <p className="text-xs text-slate-500">{day.toFormat("LLL d")}</p>
            </div>
          );
        })}

        <div style={{ height: gridHeight }} className="relative">
          {hours.map((hour, index) => (
            <div
              key={hour}
              className="absolute right-2 -translate-y-2 text-xs text-slate-500"
              style={{ top: index * HOUR_HEIGHT }}
            >
              {DateTime.fromObject({ hour }).toFormat("h a")}
            </div>
          ))}
        </div>

        {days.map((day) => {
          const key = day.toISODate()!;
          const dayBookings = groupByDay.get(key) ?? [];
          return (
            <div
              key={key}
              className="relative border-l border-slate-800"
              style={{ height: gridHeight }}
            >
              {hours.map((hour, index) => (
                <div
                  key={hour}
                  className="absolute inset-x-0 border-t border-slate-800/60"
                  style={{ top: index * HOUR_HEIGHT }}
                />
              ))}
              {dayBookings.map((booking) => {
                const start = DateTime.fromISO(booking.startAt).setZone(timezone);
                const end = DateTime.fromISO(booking.endAt).setZone(timezone);
                const startMinutes = start.hour * 60 + start.minute;
                const duration = Math.max(
                  15,
                  end.diff(start, "minutes").minutes
                );
                const top =
                  ((startMinutes - startHour * 60) / 60) * HOUR_HEIGHT;
                const height = Math.max(
                  MIN_HEIGHT,
                  (duration / 60) * HOUR_HEIGHT
                );
                return (
                  <Link
                    key={booking.id}
                    href={`/dashboard/bookings/${booking.id}`}
                    className="absolute inset-x-1 overflow-hidden rounded-lg border border-emerald-500/40 bg-emerald-500/15 p-1 text-xs text-emerald-100 hover:bg-emerald-500/25"
                    style={{ top, height }}
                  >
                    <p className="truncate font-medium">
                      {formatTimeClient(booking.startAt, timezone)}{" "}
                      {booking.customer?.name ?? ""}
                    </p>
                    <p className="truncate text-emerald-300/80">
                      {booking.service?.name ?? ""}
                    </p>
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthGrid({
  days,
  groupByDay,
  timezone,
  today,
}: {
  days: DateTime[];
  groupByDay: Map<string, BookingDto[]>;
  timezone: string;
  today: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800">
      <div className="grid grid-cols-7 bg-slate-950 text-center text-xs uppercase tracking-wide text-slate-400">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
          <div key={label} className="px-2 py-2">
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const key = day.toISODate()!;
          const dayBookings = groupByDay.get(key) ?? [];
          return (
            <div
              key={key}
              className={`min-h-[6rem] border-t border-l border-slate-800 p-1.5 ${
                key === today ? "bg-emerald-500/5" : ""
              }`}
            >
              <p
                className={`text-xs ${
                  key === today ? "font-semibold text-emerald-400" : "text-slate-500"
                }`}
              >
                {day.day}
              </p>
              <div className="mt-1 space-y-1">
                {dayBookings.slice(0, 3).map((booking) => (
                  <Link
                    key={booking.id}
                    href={`/dashboard/bookings/${booking.id}`}
                    className="block truncate rounded bg-slate-800/70 px-1.5 py-0.5 text-[11px] text-slate-200 hover:bg-slate-700"
                  >
                    <span className="text-slate-400">
                      {formatTimeClient(booking.startAt, timezone)}
                    </span>{" "}
                    {booking.customer?.name ?? ""}
                  </Link>
                ))}
                {dayBookings.length > 3 ? (
                  <p className="px-1.5 text-[11px] text-slate-500">
                    +{dayBookings.length - 3} more
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
