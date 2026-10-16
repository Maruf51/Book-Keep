import { z } from "zod";

export const invoiceSchema = z.object({
  customerId: z.string().min(1),
  bookingId: z.string().optional(),
  lineItems: z.array(
    z.object({
      description: z.string().min(1),
      qty: z.number().int().positive(),
      unitPrice: z.number().int().nonnegative(),
    })
  ),
  status: z.enum(["draft", "sent", "paid", "void"]).default("draft"),
});

export type InvoiceInput = z.infer<typeof invoiceSchema>;
