import mongoose, { Schema, type InferSchemaType } from "mongoose";

const bookingSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    serviceId: { type: Schema.Types.ObjectId, ref: "Service", required: true },
    staffId: { type: Schema.Types.ObjectId, ref: "Staff", required: true },
    customerId: { type: Schema.Types.ObjectId, ref: "Customer", required: true },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ["pending", "confirmed", "completed", "cancelled", "no_show"],
      default: "pending",
    },
    slotKeys: [{ type: String }],
    manageTokenHash: { type: String, required: true },
    priceSnapshot: { type: Number, required: true },
    depositAmount: Number,
    paymentStatus: {
      type: String,
      enum: ["unpaid", "paid", "refunded"],
      default: "unpaid",
    },
    source: { type: String, enum: ["online", "manual"], default: "online" },
    seriesId: Schema.Types.ObjectId,
    recurrence: {
      freq: { type: String, enum: ["weekly", "monthly"] },
      interval: Number,
      count: Number,
    },
    emailReminderSentAt: Date,
    smsReminderSentAt: Date,
    whatsappReminderSentAt: Date,
    googleEventId: String,
    cancelledAt: Date,
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

bookingSchema.index({ businessId: 1, startAt: 1 });
bookingSchema.index({ staffId: 1, startAt: 1 });
bookingSchema.index({ slotKeys: 1 }, { unique: true, sparse: true, partialFilterExpression: { status: { $in: ["pending", "confirmed"] } } });

export type BookingDocument = InferSchemaType<typeof bookingSchema> & {
  _id: mongoose.Types.ObjectId;
};

const BookingModel = mongoose.models.Booking || mongoose.model("Booking", bookingSchema);
export default BookingModel;
