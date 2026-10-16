import mongoose, { Schema, type InferSchemaType } from "mongoose";

const serviceSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: String,
    durationMinutes: { type: Number, required: true, min: 15 },
    bufferMinutes: { type: Number, default: 0 },
    price: { type: Number, required: true, min: 0 },
    staffIds: [{ type: Schema.Types.ObjectId, ref: "Staff" }],
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

serviceSchema.index({ businessId: 1, isActive: 1 });

export type ServiceDocument = InferSchemaType<typeof serviceSchema> & {
  _id: mongoose.Types.ObjectId;
};

const ServiceModel = mongoose.models.Service || mongoose.model("Service", serviceSchema);
export default ServiceModel;
