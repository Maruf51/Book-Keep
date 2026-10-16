import mongoose, { Schema, type InferSchemaType } from "mongoose";

const invoiceSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    bookingId: { type: Schema.Types.ObjectId, ref: "Booking" },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    number: { type: String, required: true },
    lineItems: [
      {
        description: { type: String, required: true },
        qty: { type: Number, required: true },
        unitPrice: { type: Number, required: true },
      },
    ],
    subtotal: { type: Number, required: true },
    tax: { type: Number, default: 0 },
    total: { type: Number, required: true },
    status: {
      type: String,
      enum: ["draft", "sent", "paid", "void"],
      default: "draft",
    },
    stripeSessionId: String,
    paidAt: Date,
    publicToken: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

invoiceSchema.index({ businessId: 1, number: 1 }, { unique: true });

export type InvoiceDocument = InferSchemaType<typeof invoiceSchema> & {
  _id: mongoose.Types.ObjectId;
};

const InvoiceModel = mongoose.models.Invoice || mongoose.model("Invoice", invoiceSchema);
export default InvoiceModel;
