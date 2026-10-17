import { z } from "zod";

export const businessSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2),
  timezone: z.string().default("Asia/Dhaka"),
  currency: z.string().default("BDT"),
  phone: z.string().optional(),
  address: z.string().optional(),
  logoUrl: z.string().url().optional(),
  bookingRules: z
    .object({
      minNoticeHours: z.number().int().min(0).default(2),
      maxDaysAhead: z.number().int().min(1).default(60),
      cancelWindowHours: z.number().int().min(0).default(24),
      slotIntervalMinutes: z.number().int().min(15).default(30),
      autoConfirm: z.boolean().default(true),
      depositEnabled: z.boolean().default(false),
      depositPercent: z.number().min(0).max(100).default(0),
      taxRatePercent: z.number().min(0).max(100).default(0),
    })
    .default({
      minNoticeHours: 2,
      maxDaysAhead: 60,
      cancelWindowHours: 24,
      slotIntervalMinutes: 30,
      autoConfirm: true,
      depositEnabled: false,
      depositPercent: 0,
      taxRatePercent: 0,
    }),
});

export type BusinessInput = z.infer<typeof businessSchema>;

const timezoneSchema = z.string().min(1).refine(
  (tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  },
  { message: "Unknown timezone." }
);

const nullableString = (max: number) =>
  z.string().max(max).nullable().optional();

/**
 * PATCH /api/business (P6-T7). Every field is optional; nested objects merge
 * onto the existing document in the route. `currency` is upper-cased and the
 * timezone is validated against the runtime ICU database.
 */
export const businessUpdateSchema = z
  .object({
    name: z.string().min(2).max(120).optional(),
    slug: z
      .string()
      .min(2)
      .max(60)
      .regex(/^[a-z0-9-]+$/i, "Use letters, numbers and hyphens only.")
      .transform((value) => value.toLowerCase())
      .optional(),
    timezone: timezoneSchema.optional(),
    currency: z
      .string()
      .length(3)
      .transform((value) => value.toUpperCase())
      .optional(),
    phone: nullableString(40),
    address: nullableString(300),
    logoUrl: z.string().url().nullable().optional(),
    bookingRules: z
      .object({
        minNoticeHours: z.number().int().min(0).max(336).optional(),
        maxDaysAhead: z.number().int().min(1).max(730).optional(),
        cancelWindowHours: z.number().int().min(0).max(720).optional(),
        slotIntervalMinutes: z.number().int().min(5).max(240).optional(),
        autoConfirm: z.boolean().optional(),
        depositEnabled: z.boolean().optional(),
        depositPercent: z.number().min(0).max(100).optional(),
        taxRatePercent: z.number().min(0).max(100).optional(),
      })
      .optional(),
    notify: z
      .object({
        defaultChannel: z.enum(["email", "sms", "whatsapp"]).optional(),
        reminderHoursAhead: z.number().int().min(1).max(168).optional(),
      })
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Nothing to update.",
  });

export type BusinessUpdateInput = z.infer<typeof businessUpdateSchema>;
