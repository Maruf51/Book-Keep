import { z } from "zod";

/**
 * Invoice line item (prices are integers in the smallest currency unit).
 */
export const invoiceLineItemSchema = z.object({
  description: z.string().min(1, "A description is required."),
  qty: z.number().int().positive(),
  unitPrice: z.number().int().nonnegative(),
});

export type InvoiceLineItemInput = z.infer<typeof invoiceLineItemSchema>;

/** POST /api/invoices — create a draft from a booking (P6-T2). */
export const invoiceCreateSchema = z.object({
  bookingId: z.string().min(1),
});

export type InvoiceCreateInput = z.infer<typeof invoiceCreateSchema>;

/**
 * PATCH /api/invoices/[id] (P6-T2). Draft line items can be edited; any
 * non-paid invoice can be voided. Totals are always recomputed server-side.
 */
export const invoiceUpdateSchema = z
  .object({
    lineItems: z.array(invoiceLineItemSchema).min(1).optional(),
    status: z.literal("void").optional(),
  })
  .refine(
    (value) => value.lineItems !== undefined || value.status !== undefined,
    { message: "Provide line items or a status." }
  );

export type InvoiceUpdateInput = z.infer<typeof invoiceUpdateSchema>;
