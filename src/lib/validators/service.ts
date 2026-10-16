import { z } from "zod";

export const serviceSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  durationMinutes: z.number().int().positive(),
  bufferMinutes: z.number().int().min(0).default(0),
  price: z.number().int().min(0),
  staffIds: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
});

export type ServiceInput = z.infer<typeof serviceSchema>;

export const serviceUpdateSchema = serviceSchema.partial();
export type ServiceUpdateInput = z.infer<typeof serviceUpdateSchema>;
