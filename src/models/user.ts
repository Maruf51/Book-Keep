import mongoose, { Schema, type InferSchemaType } from "mongoose";

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ["owner", "staff"], default: "owner" },
    businessId: { type: Schema.Types.ObjectId, ref: "Business", index: true },
    staffProfileId: { type: Schema.Types.ObjectId, ref: "Staff", index: true },
    invite: {
      tokenHash: { type: String, select: false },
      expiresAt: { type: Date },
    },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export type UserDocument = InferSchemaType<typeof userSchema> & {
  _id: mongoose.Types.ObjectId;
};

const UserModel = mongoose.models.User || mongoose.model("User", userSchema);
export default UserModel;
