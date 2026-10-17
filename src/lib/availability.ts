import { DateTime } from "luxon";
import {
  formatTimeLabel,
  isDateBeyondMaxDays,
  isValidTimezone,
  parseHhmm,
  startOfDayInTz,
  weekdayInTz,
} from "@/lib/time";

/**
 * Pure availability engine (spec §7 steps 1–6, PLAN P3-T2).
 *
 * Takes plain data, returns slots — no DB, no globals, no Date.now()
 * (callers pass `now` explicitly so tests are deterministic).
 *
 * DST semantics: the candidate grid is built in WALL-CLOCK time in the
 * business timezone (matching the slotKeys rule from spec §8, which keys on
 * business-TZ minute format). Nonexistent wall times on spring-forward days
 * shift forward and are deduplicated; ambiguous wall times on fall-back days
 * resolve to their first occurrence — so exactly one slot per wall time,
 * which keeps slotKeys collision-free. Overlap and min-notice checks use
 * absolute (UTC) instants.
 */

export type Slot = { startAt: string; label: string };

export type AvailabilityBooking = {
  startAt: Date | string;
  endAt: Date | string;
  status: string;
};

export type GetSlotsInput = {
  /** Business timezone, e.g. "Asia/Dhaka". */
  timezone: string;
  /** Requested calendar day in the business timezone, YYYY-MM-DD. */
  date: string;
  /** Current time — injected so the function stays pure. */
  now: Date;
  bookingRules: {
    minNoticeHours: number;
    maxDaysAhead: number;
    slotIntervalMinutes: number;
  };
  service: { durationMinutes: number; bufferMinutes?: number | null };
  staff: {
    weeklyHours?: Array<{
      weekday: number;
      ranges: Array<{ start: string; end: string }>;
    }>;
    daysOff?: Array<{ date: string; reason?: string | null; hoursOverride?: string | null }>;
  };
  /** Bookings overlapping the day; only pending/confirmed block slots. */
  bookings?: AvailabilityBooking[];
};

const BLOCKING_STATUSES = new Set(["pending", "confirmed"]);

/**
 * Parse a daysOff.hoursOverride string into ranges.
 * Format: "HH:mm-HH:mm", multiple ranges comma-separated
 * (e.g. "10:00-14:00,15:00-17:00"). Invalid pieces are dropped.
 */
function parseHoursOverride(
  value: string
): Array<{ start: string; end: string }> {
  const ranges: Array<{ start: string; end: string }> = [];
  for (const piece of value.split(",")) {
    const match = /^\s*(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})\s*$/.exec(piece);
    if (!match) continue;
    ranges.push({ start: match[1], end: match[2] });
  }
  return ranges;
}

/** Spec §7: available start times for one staff member on one date. */
export function getSlots(input: GetSlotsInput): Slot[] {
  const { timezone, date, now, bookingRules, service, staff } = input;

  // Step 1: resolve the requested date in the business timezone.
  if (!isValidTimezone(timezone)) return [];
  const dayStart = startOfDayInTz(date, timezone);
  if (!dayStart.isValid) return [];

  const duration = Math.max(0, Math.floor(service.durationMinutes || 0));
  if (duration === 0) return [];
  const buffer = Math.max(0, Math.floor(service.bufferMinutes ?? 0));
  const window = duration + buffer;
  const interval = bookingRules.slotIntervalMinutes >= 1
    ? Math.floor(bookingRules.slotIntervalMinutes)
    : 30;

  // Step 4 (first half): dates beyond maxDaysAhead get no slots.
  if (
    isDateBeyondMaxDays(date, now, timezone, bookingRules.maxDaysAhead)
  ) {
    return [];
  }

  // Step 2: working ranges for this weekday, applying day off / override.
  const weekday = weekdayInTz(date, timezone);
  const dayOff = staff.daysOff?.find((entry) => entry.date === date);
  let ranges: Array<{ start: string; end: string }> = [];
  if (dayOff) {
    // A day off blocks the day unless an hours override opens part of it.
    ranges = dayOff.hoursOverride ? parseHoursOverride(dayOff.hoursOverride) : [];
  } else {
    ranges =
      staff.weeklyHours?.find((entry) => entry.weekday === weekday)?.ranges ?? [];
  }
  if (ranges.length === 0) return [];

  // Step 3: wall-clock candidates every `interval` minutes where
  // start + duration + buffer fits before the range ends.
  const candidates: DateTime[] = [];
  const seen = new Set<number>();

  for (const range of ranges) {
    const startMin = parseHhmm(range.start);
    const endMin = parseHhmm(range.end);
    if (startMin === null || endMin === null || endMin <= startMin) continue;

    const rangeEnd = dayStart.set({
      hour: Math.floor(endMin / 60),
      minute: endMin % 60,
    });
    if (!rangeEnd.isValid) continue;

    for (
      let minute = startMin;
      minute + window <= endMin;
      minute += interval
    ) {
      const candidate = dayStart.set({
        hour: Math.floor(minute / 60),
        minute: minute % 60,
      });
      if (!candidate.isValid) continue;
      // Spring-forward: a nonexistent wall time may shift past the range
      // end — re-check in absolute terms.
      if (candidate.plus({ minutes: window }) > rangeEnd) continue;
      const millis = candidate.toMillis();
      if (seen.has(millis)) continue; // dedupe shifted wall times
      seen.add(millis);
      candidates.push(candidate);
    }
  }

  // Step 4 (second half): drop candidates before now + minNoticeHours.
  const cutoff = DateTime.fromJSDate(now).plus({
    hours: Math.max(0, bookingRules.minNoticeHours),
  });
  const afterNotice = candidates.filter((c) => c >= cutoff);

  // Step 5: remove candidates whose window overlaps a blocking booking.
  // Buffer is part of the occupied window (matches the slotKeys rule).
  const blocking = (input.bookings ?? []).filter((b) =>
    BLOCKING_STATUSES.has(b.status)
  );
  const windows: Array<{ startMs: number; endMs: number }> = blocking.map(
    (b) => ({
      startMs: new Date(b.startAt).getTime(),
      endMs: new Date(b.endAt).getTime(),
    })
  );

  const free = afterNotice.filter((candidate) => {
    const startMs = candidate.toMillis();
    const endMs = startMs + window * 60_000;
    return !windows.some(
      (w) =>
        Number.isFinite(w.startMs) &&
        Number.isFinite(w.endMs) &&
        startMs < w.endMs &&
        w.startMs < endMs
    );
  });

  // Step 6: ISO UTC start times + business-timezone display labels.
  free.sort((a, b) => a.toMillis() - b.toMillis());
  return free.map((dt) => ({
    startAt: dt.toUTC().toISO()!,
    label: formatTimeLabel(dt, timezone),
  }));
}
