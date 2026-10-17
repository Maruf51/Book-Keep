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

export const rescheduleSchema = z.object({
  startAt: z.string().datetime(),
});

export type RescheduleInput = z.infer<typeof rescheduleSchema>;

/**
 * Manual (dashboard) booking (P5-T1): an existing `customerId` or enough
 * details to find-or-create the customer. Staff callers are always pinned to
 * their own profile server-side.
 */
export const manualBookingSchema = z
  .object({
    serviceId: z.string().min(1),
    staffId: z.string().min(1),
    startAt: z.string().datetime(),
    customerId: z.string().optional(),
    name: z.string().min(2, "Name must be at least 2 characters.").optional(),
    email: z.email("Please enter a valid email address.").optional(),
    phone: z.string().optional(),
  })
  .refine((value) => Boolean(value.customerId || value.name), {
    message: "Provide an existing customer or a customer name.",
    path: ["name"],
  });

export type ManualBookingInput = z.infer<typeof manualBookingSchema>;

/**
 * Dashboard booking update (P5-T2): either a status transition or a
 * reschedule, never both in one request. Reschedules are validated against
 * the availability engine like any other write.
 */
export const bookingUpdateSchema = z
  .object({
    status: z
      .enum(["confirmed", "completed", "no_show", "cancelled"])
      .optional(),
    startAt: z.string().datetime().optional(),
  })
  .refine((value) => value.status !== undefined || value.startAt !== undefined, {
    message: "Provide a status or a new startAt.",
  });

export type BookingUpdateInput = z.infer<typeof bookingUpdateSchema>;
