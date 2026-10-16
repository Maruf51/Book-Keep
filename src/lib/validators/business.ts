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
