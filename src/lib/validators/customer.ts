import { z } from "zod";

export const customerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters."),
  email: z.email("Please enter a valid email address.").optional(),
  phone: z.string().optional(),
  notes: z.string().optional(),
  preferredChannel: z.enum(["email", "sms", "whatsapp"]).default("email"),
});

export const customerUpdateSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters.").optional(),
  email: z.email("Please enter a valid email address.").optional(),
  phone: z.string().optional(),
  notes: z.string().optional(),
  preferredChannel: z.enum(["email", "sms", "whatsapp"]).optional(),
});

export type CustomerInput = z.infer<typeof customerSchema>;
export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;