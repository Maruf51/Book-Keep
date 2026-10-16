import mongoose, { Schema, type InferSchemaType } from "mongoose";

const businessSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    timezone: { type: String, default: "Asia/Dhaka" },
    currency: { type: String, default: "BDT" },
    phone: String,
    address: String,
    logoUrl: String,
    bookingRules: {
      minNoticeHours: { type: Number, default: 2 },
      maxDaysAhead: { type: Number, default: 60 },
      cancelWindowHours: { type: Number, default: 24 },
      slotIntervalMinutes: { type: Number, default: 30 },
      autoConfirm: { type: Boolean, default: true },
      depositEnabled: { type: Boolean, default: false },
      depositPercent: { type: Number, default: 0 },
      taxRatePercent: { type: Number, default: 0 },
    },
    stripeAccountId: String,
    invoiceCounter: { type: Number, default: 0 },
    googleCalendar: {
      connected: { type: Boolean, default: false },
      refreshTokenEnc: String,
      calendarId: String,
    },
    notify: {
      defaultChannel: { type: String, enum: ["email", "sms", "whatsapp"], default: "email" },
      reminderHoursAhead: { type: Number, default: 24 },
    },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export type BusinessDocument = InferSchemaType<typeof businessSchema> & {
  _id: mongoose.Types.ObjectId;
};

const BusinessModel = mongoose.models.Business || mongoose.model("Business", businessSchema);
export default BusinessModel;
