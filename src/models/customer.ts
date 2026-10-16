import mongoose, { Schema, type InferSchemaType } from "mongoose";

const customerSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    notes: String,
    preferredChannel: {
      type: String,
      enum: ["email", "sms", "whatsapp"],
      default: "email",
    },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

customerSchema.index({ businessId: 1, email: 1 }, { unique: true, sparse: true });
customerSchema.index({ businessId: 1, phone: 1 }, { unique: true, sparse: true, partialFilterExpression: { phone: { $exists: true, $ne: null } } });

export type CustomerDocument = InferSchemaType<typeof customerSchema> & {
  _id: mongoose.Types.ObjectId;
};

const CustomerModel = mongoose.models.Customer || mongoose.model("Customer", customerSchema);
export default CustomerModel;
