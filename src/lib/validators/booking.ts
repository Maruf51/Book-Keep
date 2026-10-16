import { z } from "zod";

export const bookingSchema = z.object({
  serviceId: z.string().min(1),
  staffId: z.string().optional(),
  startAt: z.string().datetime(),
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  preferredChannel: z.enum(["email", "sms", "whatsapp"]).default("email"),
});

export type BookingInput = z.infer<typeof bookingSchema>;
