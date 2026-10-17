import { DateTime } from "luxon";

/**
 * Luxon time helpers (P3-T1). All calendar math happens in the business
 * timezone; storage/output is UTC. Minute arithmetic uses Luxon's absolute
 * `plus({ minutes })`, which is DST-safe (skips nonexistent wall times,
 * covers repeated wall times on fall-back days).
 */

export function isValidTimezone(timezone: string): boolean {
  return DateTime.local().setZone(timezone).isValid;
}

/** Midnight of the given YYYY-MM-DD date in the business timezone. */
export function startOfDayInTz(dateISO: string, timezone: string): DateTime {
  return DateTime.fromISO(dateISO, { zone: timezone }).startOf("day");
}

/** Weekday of the date in the business timezone, 0 = Sunday … 6 = Saturday. */
export function weekdayInTz(dateISO: string, timezone: string): number {
  return startOfDayInTz(dateISO, timezone).weekday % 7;
}

/** UTC bounds [00:00, next 00:00) of a calendar day in the business timezone. */
export function dateInTzToUtcRange(
  dateISO: string,
  timezone: string
): { startUtc: Date; endUtc: Date } {
  const start = startOfDayInTz(dateISO, timezone);
  const end = start.plus({ days: 1 });
  return { startUtc: start.toJSDate(), endUtc: end.toJSDate() };
}

/** "10:00 AM" — display label in the business timezone (spec §7 step 6). */
export function formatTimeLabel(dt: DateTime, timezone: string): string {
  return dt.setZone(timezone).toFormat("h:mm a");
}

/** "Tue, Oct 20, 2026" style day label in the business timezone. */
export function formatDateLabel(dt: DateTime, timezone: string): string {
  return dt.setZone(timezone).toFormat("ccc, LLL d, yyyy");
}

/** "Tue, Oct 20, 2026 at 10:00 AM" for an instant in the business timezone. */
export function formatDateTimeInTz(
  value: Date | string,
  timezone: string
): string {
  const dt =
    value instanceof Date
      ? DateTime.fromJSDate(value)
      : DateTime.fromISO(value);
  if (!dt.isValid) return "";
  return dt.setZone(timezone).toFormat("ccc, LLL d, yyyy 'at' h:mm a");
}

/** Today's YYYY-MM-DD in the business timezone. */
export function todayInTz(now: Date, timezone: string): string {
  return DateTime.fromJSDate(now).setZone(timezone).toISODate() ?? "";
}

/**
 * True when the requested date is strictly beyond today + maxDaysAhead
 * in the business timezone (spec §7 step 4). The boundary itself
 * (date == today + maxDaysAhead) is allowed.
 */
export function isDateBeyondMaxDays(
  dateISO: string,
  now: Date,
  timezone: string,
  maxDaysAhead: number
): boolean {
  const requested = startOfDayInTz(dateISO, timezone);
  const today = DateTime.fromJSDate(now).setZone(timezone).startOf("day");
  if (!requested.isValid || !today.isValid) return true;
  return requested > today.plus({ days: Math.max(0, Math.floor(maxDaysAhead)) });
}

/** Parse "HH:mm" to minutes since local midnight, or null when invalid. */
export function parseHhmm(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59 || (hours === 24 && minutes !== 0)) return null;
  return hours * 60 + minutes;
}

/**
 * Iterate candidate start times every `intervalMinutes` from `rangeStart`
 * while the full `windowMinutes` (duration + buffer) still fits at or before
 * `rangeEnd`. Steps are absolute (DST-safe) and land on wall-clock grid marks
 * because DST offsets change in whole hours that the interval divides.
 */
export function* iterateSlotGrid(
  rangeStart: DateTime,
  rangeEnd: DateTime,
  intervalMinutes: number,
  windowMinutes: number
): Generator<DateTime> {
  if (!rangeStart.isValid || !rangeEnd.isValid) return;
  const interval = Math.max(1, Math.floor(intervalMinutes));
  let cursor = rangeStart;
  while (cursor.plus({ minutes: windowMinutes }) <= rangeEnd) {
    yield cursor;
    cursor = cursor.plus({ minutes: interval });
  }
}
