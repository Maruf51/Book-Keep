/**
 * Client-safe date helpers for the booking wizard: calendar dates computed
 * in the BUSINESS timezone (never the visitor's), so the date picker bounds
 * match what the slots endpoint will accept.
 */

/** Today's YYYY-MM-DD in the given IANA timezone. */
export function todayInTzClient(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Add whole days to a YYYY-MM-DD string (calendar-safe via UTC noon anchor). */
export function addDaysISO(dateISO: string, days: number): string {
  const [year, month, day] = dateISO.split("-").map(Number);
  const anchor = new Date(Date.UTC(year, month - 1, day, 12));
  anchor.setUTCDate(anchor.getUTCDate() + days);
  return anchor.toISOString().slice(0, 10);
}

/** Max selectable date: today + maxDaysAhead in the business timezone. */
export function maxDateInTzClient(timezone: string, maxDaysAhead: number): string {
  return addDaysISO(todayInTzClient(timezone), Math.max(0, Math.floor(maxDaysAhead)));
}

/** "Tue, Oct 20, 2026" for a YYYY-MM-DD in the business timezone. */
export function formatDateLabelClient(dateISO: string, _timezone: string): string {
  const [year, month, day] = dateISO.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

/** Full date+time for an instant, rendered in the business timezone. */
export function formatDateTimeClient(
  value: string | Date,
  timezone: string
): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value instanceof Date ? value : new Date(value));
}

/** "10:00 AM" only, in the business timezone. */
export function formatTimeClient(value: string | Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  }).format(value instanceof Date ? value : new Date(value));
}

/** YYYY-MM-DD for an instant in the business timezone (for grouping). */
export function dateOnlyInTzClient(
  value: string | Date,
  timezone: string
): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value instanceof Date ? value : new Date(value));
}

/** "Fri, Oct 17" for a YYYY-MM-DD (or instant) in the business timezone. */
export function formatDayLabelClient(
  value: string | Date,
  timezone: string
): string {
  const date =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T12:00:00Z`)
      : value instanceof Date
        ? value
        : new Date(value);
  const zone = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? "UTC" : timezone;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}
