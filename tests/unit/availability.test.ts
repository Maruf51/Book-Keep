import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { getSlots, type GetSlotsInput } from "@/lib/availability";
import {
  dateInTzToUtcRange,
  isDateBeyondMaxDays,
  iterateSlotGrid,
  parseHhmm,
  todayInTz,
  weekdayInTz,
} from "@/lib/time";

function baseInput(overrides: Partial<GetSlotsInput> = {}): GetSlotsInput {
  return {
    timezone: "Asia/Dhaka",
    date: "2026-10-20", // Tuesday
    // 2026-10-19T00:00Z = 06:00 Dhaka, the day before the requested date.
    now: new Date("2026-10-19T00:00:00.000Z"),
    bookingRules: {
      minNoticeHours: 2,
      maxDaysAhead: 60,
      slotIntervalMinutes: 30,
    },
    service: { durationMinutes: 60, bufferMinutes: 0 },
    staff: {
      weeklyHours: [
        { weekday: 2, ranges: [{ start: "09:00", end: "17:00" }] },
      ],
      daysOff: [],
    },
    bookings: [],
    ...overrides,
  };
}

function isoHour(slot: { startAt: string }): string {
  return slot.startAt.slice(11, 16);
}

describe("time helpers", () => {
  it("parses HH:mm and rejects malformed values", () => {
    expect(parseHhmm("09:30")).toBe(570);
    expect(parseHhmm("00:00")).toBe(0);
    expect(parseHhmm("24:00")).toBe(1440);
    expect(parseHhmm("9:30")).toBeNull();
    expect(parseHhmm("25:00")).toBeNull();
    expect(parseHhmm("12:60")).toBeNull();
    expect(parseHhmm("nope")).toBeNull();
  });

  it("computes weekday in business timezone (0=Sunday)", () => {
    // 2026-10-18 is a Sunday; UTC date differs from Dhaka date only after 18:00Z.
    expect(weekdayInTz("2026-10-18", "Asia/Dhaka")).toBe(0);
    expect(weekdayInTz("2026-10-20", "Asia/Dhaka")).toBe(2);
    // Late Saturday UTC is already Sunday in Tokyo.
    expect(weekdayInTz("2026-10-18", "Asia/Tokyo")).toBe(0);
    expect(weekdayInTz("2026-10-17", "UTC")).toBe(6);
  });

  it("converts a business-timezone day to correct UTC bounds", () => {
    const { startUtc, endUtc } = dateInTzToUtcRange("2026-10-20", "Asia/Dhaka");
    // Dhaka is UTC+6 year-round.
    expect(startUtc.toISOString()).toBe("2026-10-19T18:00:00.000Z");
    expect(endUtc.toISOString()).toBe("2026-10-20T18:00:00.000Z");
  });

  it("computes day bounds across a DST transition (23h day)", () => {
    const { startUtc, endUtc } = dateInTzToUtcRange(
      "2026-03-08",
      "America/New_York"
    );
    expect(startUtc.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    // Midnight next day is EDT (-04:00) — only 23 real hours later.
    expect(endUtc.toISOString()).toBe("2026-03-09T04:00:00.000Z");
  });

  it("returns today as YYYY-MM-DD in the business timezone", () => {
    const now = new Date("2026-10-19T20:30:00.000Z");
    expect(todayInTz(now, "Asia/Dhaka")).toBe("2026-10-20"); // 02:30 next day
    expect(todayInTz(now, "UTC")).toBe("2026-10-19");
  });

  it("enforces maxDaysAhead with the boundary date allowed", () => {
    const now = new Date("2026-10-19T00:00:00.000Z"); // Dhaka: Oct 19
    expect(isDateBeyondMaxDays("2026-10-19", now, "Asia/Dhaka", 60)).toBe(false);
    expect(isDateBeyondMaxDays("2026-12-18", now, "Asia/Dhaka", 60)).toBe(false); // exactly +60
    expect(isDateBeyondMaxDays("2026-12-19", now, "Asia/Dhaka", 60)).toBe(true); // +61
  });

  it("iterates the slot grid until the window no longer fits", () => {
    const start = DateTime.fromISO("2026-10-20T09:00:00", { zone: "Asia/Dhaka" });
    const end = DateTime.fromISO("2026-10-20T12:00:00", { zone: "Asia/Dhaka" });
    const slots30 = [...iterateSlotGrid(start, end, 30, 60)];
    expect(slots30.map((d) => d.toFormat("HH:mm"))).toEqual([
      "09:00", "09:30", "10:00", "10:30", "11:00",
    ]);
    // 30-min window fits until start <= 11:30 → 09:00..11:30 at 15-min = 11 slots.
    const slots15 = [...iterateSlotGrid(start, end, 15, 30)];
    expect(slots15).toHaveLength(11);
    expect(slots15[10].toFormat("HH:mm")).toBe("11:30");
  });
});

describe("getSlots — core grid", () => {
  it("1. returns no slots when the weekday has no working hours", () => {
    const slots = getSlots(
      baseInput({
        date: "2026-10-21", // Wednesday — no hours configured
      })
    );
    expect(slots).toEqual([]);
  });

  it("returns no slots when staff has no weeklyHours at all", () => {
    const slots = getSlots(baseInput({ staff: { weeklyHours: [], daysOff: [] } }));
    expect(slots).toEqual([]);
  });

  it("2. builds slots from a single range every 30 minutes", () => {
    const slots = getSlots(baseInput());
    // 09:00–17:00, 60-min service → last start 16:00.
    expect(slots).toHaveLength(15);
    expect(isoHour(slots[0])).toBe("03:00"); // 09:00 Dhaka = 03:00 UTC
    expect(isoHour(slots[slots.length - 1])).toBe("10:00"); // 16:00 Dhaka
    expect(slots[0].startAt).toBe("2026-10-20T03:00:00.000Z");
    expect(slots[0].label).toBe("9:00 AM");
  });

  it("handles a day with multiple working ranges", () => {
    const slots = getSlots(
      baseInput({
        staff: {
          weeklyHours: [
            {
              weekday: 2,
              ranges: [
                { start: "09:00", end: "11:00" },
                { start: "14:00", end: "16:00" },
              ],
            },
          ],
          daysOff: [],
        },
      })
    );
    // Morning: 09:00, 09:30, 10:00 (10:30+60 > 11:00). Afternoon: 14:00, 14:30, 15:00.
    expect(slots).toHaveLength(6);
    const labels = slots.map((s) => s.label);
    expect(labels).toContain("9:00 AM");
    expect(labels).toContain("2:00 PM");
    expect(labels).toContain("3:00 PM");
    expect(labels).not.toContain("11:00 AM");
    expect(labels).not.toContain("4:00 PM");
  });

  it("3. buffer pushes the last candidate past the range end", () => {
    const noBuffer = getSlots(baseInput());
    const withBuffer = getSlots(
      baseInput({ service: { durationMinutes: 60, bufferMinutes: 15 } })
    );
    expect(noBuffer).toHaveLength(15);
    // 15:45 + 60 + 15 = 17:00 fits, but 16:00 + 75 > 17:00 does not.
    expect(withBuffer).toHaveLength(14);
    expect(isoHour(withBuffer[withBuffer.length - 1])).toBe("09:30"); // 15:30 Dhaka
  });

  it("respects 15-minute intervals", () => {
    const slots = getSlots(
      baseInput({ bookingRules: { minNoticeHours: 2, maxDaysAhead: 60, slotIntervalMinutes: 15 } })
    );
    // Starts 09:00..16:00 where start+60 <= 17:00 → (420/15)+1 = 29 slots.
    expect(slots).toHaveLength(29);
    expect(isoHour(slots[1])).toBe("03:15");
    expect(isoHour(slots[slots.length - 1])).toBe("10:00"); // 16:00 Dhaka
  });

  it("service duration not on an even grid boundary still fits", () => {
    const slots = getSlots(
      baseInput({
        service: { durationMinutes: 45, bufferMinutes: 0 },
        bookingRules: { minNoticeHours: 2, maxDaysAhead: 60, slotIntervalMinutes: 30 },
      })
    );
    // 45-min service: 16:00+45=16:45 fits; 16:30+45=17:15 does not.
    expect(slots).toHaveLength(15);
    expect(isoHour(slots[slots.length - 1])).toBe("10:00");
  });

  it("returns nothing for an invalid date or invalid timezone", () => {
    expect(getSlots(baseInput({ date: "not-a-date" }))).toEqual([]);
    expect(getSlots(baseInput({ date: "2026-13-45" }))).toEqual([]);
    expect(getSlots(baseInput({ timezone: "Mars/Olympus" }))).toEqual([]);
  });

  it("returns nothing when duration is zero or missing", () => {
    expect(
      getSlots(baseInput({ service: { durationMinutes: 0, bufferMinutes: 0 } }))
    ).toEqual([]);
  });
});

describe("getSlots — days off and overrides", () => {
  it("4. a day off blocks all slots", () => {
    const slots = getSlots(
      baseInput({
        staff: {
          weeklyHours: [
            { weekday: 2, ranges: [{ start: "09:00", end: "17:00" }] },
          ],
          daysOff: [{ date: "2026-10-20", reason: "Holiday" }],
        },
      })
    );
    expect(slots).toEqual([]);
  });

  it("hours override opens a custom range on a day off", () => {
    const slots = getSlots(
      baseInput({
        staff: {
          weeklyHours: [
            { weekday: 2, ranges: [{ start: "09:00", end: "17:00" }] },
          ],
          daysOff: [
            { date: "2026-10-20", hoursOverride: "10:00-13:00" },
          ],
        },
      })
    );
    expect(slots).toHaveLength(5); // 10:00, 10:30, 11:00, 11:30, 12:00
    expect(slots[0].label).toBe("10:00 AM");
    expect(slots[slots.length - 1].label).toBe("12:00 PM");
  });

  it("multi-range hours override is honored; garbage override blocks the day", () => {
    const multi = getSlots(
      baseInput({
        staff: {
          weeklyHours: [],
          daysOff: [
            { date: "2026-10-20", hoursOverride: "09:00-10:00,14:00-15:30" },
          ],
        },
      })
    );
    // 09:00-10:00: only 09:00 fits a 60-min service (09:30+60=10:30 > 10:00).
    // 14:00-15:30: 14:00 and 14:30 fit (15:00+60=16:00 > 15:30).
    expect(multi).toHaveLength(3);
    expect(multi.map((sl) => sl.label)).toEqual(["9:00 AM", "2:00 PM", "2:30 PM"]);

    const garbage = getSlots(
      baseInput({
        staff: { weeklyHours: [], daysOff: [{ date: "2026-10-20", hoursOverride: "whatever" }] },
      })
    );
    expect(garbage).toEqual([]);
  });

  it("a day off on a different date does not affect the requested day", () => {
    const slots = getSlots(
      baseInput({
        staff: {
          weeklyHours: [
            { weekday: 2, ranges: [{ start: "09:00", end: "17:00" }] },
          ],
          daysOff: [{ date: "2026-10-27" }],
        },
      })
    );
    expect(slots).toHaveLength(15);
  });
});

describe("getSlots — notice window and horizon", () => {
  it("5. removes candidates before now + minNoticeHours (boundary kept)", () => {
    // now = 07:00 Dhaka on the requested day, notice = 2h → cutoff 09:00.
    const now = new Date("2026-10-20T01:00:00.000Z");
    const slots = getSlots(baseInput({ now }));
    expect(slots).toHaveLength(15);
    expect(slots[0].label).toBe("9:00 AM"); // exactly at cutoff → kept

    // One minute later the 09:00 slot falls before the cutoff.
    const slots2 = getSlots(baseInput({ now: new Date(now.getTime() + 60_000) }));
    expect(slots2).toHaveLength(14);
    expect(slots2[0].label).toBe("9:30 AM");
  });

  it("same-day booking after current time: past slots disappear with zero notice", () => {
    const now = new Date("2026-10-20T05:00:00.000Z"); // 11:00 Dhaka
    const slots = getSlots(
      baseInput({
        now,
        bookingRules: { minNoticeHours: 0, maxDaysAhead: 60, slotIntervalMinutes: 30 },
      })
    );
    // 11:00 boundary kept, then 11:30..16:00.
    expect(slots[0].label).toBe("11:00 AM");
    expect(slots).toHaveLength(11);
  });

  it("6. dates beyond maxDaysAhead return nothing; boundary date works", () => {
    const now = new Date("2026-10-19T00:00:00.000Z");
    const beyond = getSlots(
      baseInput({
        now,
        date: "2026-12-19", // Dhaka today is Oct 19 → +61 days
        staff: {
          weeklyHours: [{ weekday: 0, ranges: [{ start: "09:00", end: "17:00" }] }],
          daysOff: [],
        },
      })
    );
    expect(beyond).toEqual([]);

    const boundary = getSlots(
      baseInput({
        now,
        date: "2026-12-18", // exactly +60 → allowed; it is a Friday (weekday 5)
        staff: {
          weeklyHours: [{ weekday: 5, ranges: [{ start: "09:00", end: "17:00" }] }],
          daysOff: [],
        },
      })
    );
    expect(boundary.length).toBeGreaterThan(0);
  });

  it("dates in the past return nothing once notice passes", () => {
    const slots = getSlots(
      baseInput({
        date: "2026-10-18",
        now: new Date("2026-10-19T00:00:00.000Z"),
      })
    );
    expect(slots).toEqual([]);
  });
});

describe("getSlots — booking overlaps", () => {
  const day = {
    morning: {
      startAt: new Date("2026-10-20T04:00:00.000Z"), // 10:00 Dhaka
      endAt: new Date("2026-10-20T05:00:00.000Z"), // 11:00 Dhaka
      status: "confirmed",
    },
  };

  it("7. a confirmed booking removes overlapping slots only", () => {
    const slots = getSlots(baseInput({ bookings: [day.morning] }));
    const labels = slots.map((s) => s.label);
    // 10:00 booking occupies candidates 09:30..10:30 starts? No —
    // overlap is against [start, start+60): 10:00 booking blocks starts
    // whose 60-min window intersects [10:00, 11:00) → 09:30 no (ends 10:30? yes intersects!),
    // compute explicitly: blocked starts = 10:00..10:59 ⇒ 10:00 only… but window check:
    // startMs < bookEnd && bookStart < startMs+60min → starts (09:01..11:00) ⇒ 09:30,10:00,10:30.
    expect(labels).not.toContain("10:00 AM");
    expect(labels).not.toContain("10:30 AM");
    expect(labels).not.toContain("9:30 AM");
    expect(labels).toContain("9:00 AM");
    expect(labels).toContain("11:00 AM");
    expect(slots).toHaveLength(12);
  });

  it("pending bookings block; cancelled and completed do not", () => {
    const pending = getSlots(
      baseInput({ bookings: [{ ...day.morning, status: "pending" }] })
    );
    expect(pending.map((s) => s.label)).not.toContain("10:00 AM");

    const cancelled = getSlots(
      baseInput({ bookings: [{ ...day.morning, status: "cancelled" }] })
    );
    expect(cancelled).toHaveLength(15);

    const completed = getSlots(
      baseInput({ bookings: [{ ...day.morning, status: "completed" }] })
    );
    expect(completed).toHaveLength(15);

    const noShow = getSlots(
      baseInput({ bookings: [{ ...day.morning, status: "no_show" }] })
    );
    expect(noShow).toHaveLength(15);
  });

  it("buffer time is part of the occupied window", () => {
    // Booking occupies [11:00, 12:00) Dhaka = [05:00Z, 06:00Z).
    const booking = {
      startAt: new Date("2026-10-20T05:00:00.000Z"), // 11:00 Dhaka
      endAt: new Date("2026-10-20T06:00:00.000Z"), // 12:00 Dhaka
      status: "confirmed",
    };
    const slots = getSlots(
      baseInput({
        service: { durationMinutes: 60, bufferMinutes: 15 },
        bookings: [booking],
      })
    );
    const labels = slots.map((s) => s.label);
    // Candidate windows are 75 min (60 service + 15 buffer):
    //  10:00 → [10:00, 11:15) intersects booking → blocked
    //  10:30 → [10:30, 11:45) intersects → blocked
    //  11:00 → [11:00, 12:15) intersects → blocked
    //  11:30 → [11:30, 12:45) intersects → blocked
    //  12:00 → [12:00, 13:15) intersects at 12:00? startMs(12:00) < end(12:00)?
    //          06:00Z < 06:00Z is false → NOT blocked (half-open interval)
    expect(labels).not.toContain("10:00 AM");
    expect(labels).not.toContain("10:30 AM");
    expect(labels).not.toContain("11:00 AM");
    expect(labels).not.toContain("11:30 AM");
    expect(labels).toContain("9:30 AM"); // [09:30, 10:45) ends before 11:00 → free
    expect(labels).toContain("12:00 PM"); // starts exactly at booking end → free
  });
});

describe("getSlots — DST correctness", () => {
  it("Asia/Dhaka has no DST: consistent offsets year-round", () => {
    const jan = getSlots(
      baseInput({
        date: "2026-01-20",
        now: new Date("2026-01-19T00:00:00.000Z"),
        staff: {
          weeklyHours: [{ weekday: 2, ranges: [{ start: "09:00", end: "17:00" }] }],
          daysOff: [],
        },
      })
    );
    const jul = getSlots(
      baseInput({
        date: "2026-07-21",
        now: new Date("2026-07-20T00:00:00.000Z"),
        staff: {
          weeklyHours: [{ weekday: 2, ranges: [{ start: "09:00", end: "17:00" }] }],
          daysOff: [],
        },
      })
    );
    expect(jan[0].startAt.slice(11)).toBe("03:00:00.000Z");
    expect(jul[0].startAt.slice(11)).toBe("03:00:00.000Z");
    expect(jan[0].label).toBe("9:00 AM");
    expect(jul[0].label).toBe("9:00 AM");
    expect(jan).toHaveLength(15);
    expect(jul).toHaveLength(15);
  });

  it("America/New_York: January is EST (-5), July is EDT (-4)", () => {
    const common = {
      timezone: "America/New_York",
      service: { durationMinutes: 60, bufferMinutes: 0 },
      staff: {
        weeklyHours: [{ weekday: 2, ranges: [{ start: "09:00", end: "17:00" }] }],
        daysOff: [],
      },
      bookings: [],
    };

    const jan = getSlots({
      ...common,
      date: "2026-01-20",
      now: new Date("2026-01-19T00:00:00.000Z"),
      bookingRules: { minNoticeHours: 2, maxDaysAhead: 60, slotIntervalMinutes: 30 },
    });
    expect(jan[0].startAt).toBe("2026-01-20T14:00:00.000Z"); // 9:00 EST = 14:00Z
    expect(jan[0].label).toBe("9:00 AM");

    const jul = getSlots({
      ...common,
      date: "2026-07-21",
      now: new Date("2026-07-20T00:00:00.000Z"),
      bookingRules: { minNoticeHours: 2, maxDaysAhead: 60, slotIntervalMinutes: 30 },
    });
    expect(jul[0].startAt).toBe("2026-07-21T13:00:00.000Z"); // 9:00 EDT = 13:00Z
    expect(jul[0].label).toBe("9:00 AM");
    expect(jul).toHaveLength(15);
    expect(jan).toHaveLength(15);
  });

  it("spring-forward day: nonexistent 2:00–2:59 wall times are skipped, no dupes", () => {
    // 2026-03-08: clocks jump 02:00 → 03:00 in New York.
    const slots = getSlots({
      timezone: "America/New_York",
      date: "2026-03-08",
      now: new Date("2026-03-07T00:00:00.000Z"),
      bookingRules: { minNoticeHours: 2, maxDaysAhead: 60, slotIntervalMinutes: 30 },
      service: { durationMinutes: 30, bufferMinutes: 0 },
      staff: {
        weeklyHours: [
          { weekday: 0, ranges: [{ start: "01:00", end: "04:00" }] }, // Sunday
        ],
        daysOff: [],
      },
      bookings: [],
    });
    // Wall candidates 01:00,01:30,02:00,02:30,03:00,03:30 → 02:00/02:30 shift
    // to 03:00/03:30 and dedupe → 01:00,01:30,03:00,03:30.
    expect(slots.map((s) => s.label)).toEqual([
      "1:00 AM", "1:30 AM", "3:00 AM", "3:30 AM",
    ]);
    // Distinct absolute instants — no duplicate startAt values.
    expect(new Set(slots.map((s) => s.startAt)).size).toBe(slots.length);
    // Absolute stepping: 1:30 EST + 30 real minutes = 3:00 EDT (07:00Z).
    expect(slots[1].startAt).toBe("2026-03-08T06:30:00.000Z");
    expect(slots[2].startAt).toBe("2026-03-08T07:00:00.000Z");
  });

  it("fall-back day: repeated 1:00–1:59 wall hour yields one set of slots", () => {
    // 2026-11-01: clocks fall 02:00 → 01:00 in New York (1:00–2:00 happens twice).
    const slots = getSlots({
      timezone: "America/New_York",
      date: "2026-11-01",
      now: new Date("2026-10-31T00:00:00.000Z"),
      bookingRules: { minNoticeHours: 2, maxDaysAhead: 60, slotIntervalMinutes: 30 },
      service: { durationMinutes: 30, bufferMinutes: 0 },
      staff: {
        weeklyHours: [
          { weekday: 0, ranges: [{ start: "00:00", end: "04:00" }] },
        ],
        daysOff: [],
      },
      bookings: [],
    });
    // Wall grid 00:00..03:30 → 8 slots, each wall time exactly once
    // (ambiguous times resolve to their first occurrence, per slotKeys safety).
    expect(slots).toHaveLength(8);
    expect(new Set(slots.map((s) => s.startAt)).size).toBe(8);
    const labels = slots.map((s) => s.label);
    expect(labels.filter((l) => l === "1:00 AM")).toHaveLength(1);
    // First 1:00 AM is EDT (-04:00) = 05:00Z; second occurrence is not offered.
    const oneAm = slots.find((s) => s.label === "1:00 AM");
    expect(oneAm?.startAt).toBe("2026-11-01T05:00:00.000Z");
  });

  it("booking overlap on a DST-transition day uses absolute time", () => {
    // Booking at 1:00 EST (second occurrence) = 06:00Z on Nov 1.
    // Wall-grid slots only offer first-occurrence 1:00 EDT = 05:00Z…
    // so a booking in the repeated hour must not block first-occurrence slots.
    const slots = getSlots({
      timezone: "America/New_York",
      date: "2026-11-01",
      now: new Date("2026-10-31T00:00:00.000Z"),
      bookingRules: { minNoticeHours: 2, maxDaysAhead: 60, slotIntervalMinutes: 30 },
      service: { durationMinutes: 30, bufferMinutes: 0 },
      staff: {
        weeklyHours: [
          { weekday: 0, ranges: [{ start: "00:00", end: "04:00" }] },
        ],
        daysOff: [],
      },
      bookings: [
        {
          startAt: new Date("2026-11-01T06:00:00.000Z"), // 1:00 EST (second pass)
          endAt: new Date("2026-11-01T06:30:00.000Z"),
          status: "confirmed",
        },
      ],
    });
    // 2:00 EST = 07:00Z onward unaffected; wall 1:30 AM (05:30Z, EDT) unaffected.
    expect(slots.map((s) => s.label)).toContain("1:30 AM");
    expect(slots.map((s) => s.label)).toContain("2:00 AM");
    // But wall 1:00 AM..? first occurrence 05:00Z–05:30Z window does NOT intersect 06:00–06:30Z.
    expect(slots.map((s) => s.label)).toContain("1:00 AM");
    // Absolute-window truth: a booking spanning 06:00–06:30Z blocks wall 2:00?
    // 2:00 AM EST = 07:00Z → window [07:00,07:30) ∩ [06:00,06:30) = ∅ → kept.
    expect(slots).toHaveLength(8);
  });
});
