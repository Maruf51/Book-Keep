import { z } from "zod";

const hoursRangeSchema = z.object({
  start: z.string().regex(/^\d{2}:\d{2}$/, "Start time must be HH:mm."),
  end: z.string().regex(/^\d{2}:\d{2}$/, "End time must be HH:mm."),
});

export const weeklyHoursSchema = z
  .array(
    z.object({
      weekday: z.number().int().min(0).max(6),
      ranges: z.array(hoursRangeSchema).default([]),
    })
  )
  .default([]);

export const daysOffSchema = z
  .array(
    z.object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD."),
      reason: z.string().optional(),
      hoursOverride: z.string().optional(),
    })
  )
  .default([]);

export const staffSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters."),
  email: z.email("Please enter a valid email address.").optional(),
  photoUrl: z.url("Please enter a valid URL.").optional(),
  weeklyHours: weeklyHoursSchema,
  daysOff: daysOffSchema,
  isActive: z.boolean().default(true),
});

export const staffUpdateSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters.").optional(),
  email: z.email("Please enter a valid email address.").optional(),
  photoUrl: z.url("Please enter a valid URL.").optional(),
  weeklyHours: weeklyHoursSchema.optional(),
  daysOff: daysOffSchema.optional(),
  isActive: z.boolean().optional(),
});

export const staffInviteSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters."),
  email: z.email("Please enter a valid email address."),
});

export type StaffInput = z.infer<typeof staffSchema>;
export type StaffUpdateInput = z.infer<typeof staffUpdateSchema>;
export type StaffInviteInput = z.infer<typeof staffInviteSchema>;
