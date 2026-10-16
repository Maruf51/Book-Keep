import mongoose, { Schema, type InferSchemaType } from "mongoose";

const staffSchema = new Schema(
  {
    businessId: { type: Schema.Types.ObjectId, ref: "Business", required: true, index: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true },
    photoUrl: String,
    weeklyHours: [
      {
        weekday: { type: Number, required: true, min: 0, max: 6 },
        ranges: [
          {
            start: { type: String, required: true },
            end: { type: String, required: true },
          },
        ],
      },
    ],
    daysOff: [
      {
        date: { type: String, required: true },
        reason: String,
        hoursOverride: String,
      },
    ],
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export type StaffDocument = InferSchemaType<typeof staffSchema> & {
  _id: mongoose.Types.ObjectId;
};

const StaffModel = mongoose.models.Staff || mongoose.model("Staff", staffSchema);
export default StaffModel;
