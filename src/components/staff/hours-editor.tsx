"use client";

import { useState } from "react";

export type WeeklyHours = Array<{
  weekday: number;
  ranges: Array<{ start: string; end: string }>;
}>;

export type DaysOff = Array<{
  date: string;
  reason?: string;
  hoursOverride?: string;
}>;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function normalizeWeeklyHours(hours: WeeklyHours): WeeklyHours {
  return WEEKDAYS.map((_, weekday) =>
    hours.find((entry) => entry.weekday === weekday) ?? { weekday, ranges: [] }
  );
}

/** 7-weekday editor with add/remove time ranges (HH:mm inputs). */
export function WeeklyHoursEditor({
  value,
  onChange,
}: {
  value: WeeklyHours;
  onChange: (next: WeeklyHours) => void;
}) {
  const days = normalizeWeeklyHours(value);

  function setDay(weekday: number, ranges: Array<{ start: string; end: string }>) {
    onChange(days.map((day) => (day.weekday === weekday ? { weekday, ranges } : day)));
  }

  return (
    <div className="space-y-3">
      {days.map((day) => (
        <div key={day.weekday} className="rounded-xl border border-slate-700 bg-slate-950 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-200">{WEEKDAYS[day.weekday]}</span>
            <button
              type="button"
              className="text-xs text-emerald-400 hover:text-emerald-300"
              onClick={() =>
                setDay(day.weekday, [...day.ranges, { start: "09:00", end: "17:00" }])
              }
            >
              + Add range
            </button>
          </div>

          {day.ranges.length === 0 ? (
            <p className="text-xs text-slate-500">Day off</p>
          ) : (
            <div className="space-y-2">
              {day.ranges.map((range, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="time"
                    value={range.start}
                    onChange={(event) => {
                      const next = day.ranges.map((r, i) =>
                        i === index ? { ...r, start: event.target.value } : r
                      );
                      setDay(day.weekday, next);
                    }}
                    className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                  />
                  <span className="text-slate-500">–</span>
                  <input
                    type="time"
                    value={range.end}
                    onChange={(event) => {
                      const next = day.ranges.map((r, i) =>
                        i === index ? { ...r, end: event.target.value } : r
                      );
                      setDay(day.weekday, next);
                    }}
                    className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    aria-label="Remove range"
                    className="rounded-lg px-2 py-1 text-rose-400 hover:bg-slate-800"
                    onClick={() => setDay(day.weekday, day.ranges.filter((_, i) => i !== index))}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Days-off (holidays / time off) editor: date + optional reason. */
export function DaysOffEditor({
  value,
  onChange,
}: {
  value: DaysOff;
  onChange: (next: DaysOff) => void;
}) {
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");

  return (
    <div className="space-y-3">
      {value.length > 0 && (
        <ul className="space-y-2">
          {value.map((entry, index) => (
            <li
              key={`${entry.date}-${index}`}
              className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-950 px-3 py-2"
            >
              <div>
                <span className="text-sm text-slate-100">{entry.date}</span>
                {entry.reason ? (
                  <span className="ml-2 text-xs text-slate-400">{entry.reason}</span>
                ) : null}
              </div>
              <button
                type="button"
                aria-label="Remove day off"
                className="rounded-lg px-2 py-1 text-rose-400 hover:bg-slate-800"
                onClick={() => onChange(value.filter((_, i) => i !== index))}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-sm text-slate-300">
          Date
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="mt-1 block rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
          />
        </label>
        <label className="flex-1 text-sm text-slate-300">
          Reason (optional)
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Holiday"
            className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-sm text-slate-100 focus:border-emerald-500 focus:outline-none"
          />
        </label>
        <button
          type="button"
          disabled={!date}
          onClick={() => {
            onChange([...value, reason ? { date, reason } : { date }]);
            setDate("");
            setReason("");
          }}
          className="rounded-lg border border-emerald-600 px-3 py-2 text-sm text-emerald-400 hover:bg-emerald-600/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Add day off
        </button>
      </div>
    </div>
  );
}
