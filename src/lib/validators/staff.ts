import { z } from "zod";

const hoursRangeSchema = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
});

export const staffSchema = z.object({
  name: z.string().min(2),
  email: z.string().email().optional(),
  photoUrl: z.string().url().optional(),
  weeklyHours: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        ranges: z.array(hoursRangeSchema).default([]),
      })
    )
    .default([]),
  daysOff: z
    .array(
      z.object({
        date: z.string(),
        reason: z.string().optional(),
        hoursOverride: z.string().optional(),
      })
    )
    .default([]),
  isActive: z.boolean().default(true),
});

export type StaffInput = z.infer<typeof staffSchema>;
