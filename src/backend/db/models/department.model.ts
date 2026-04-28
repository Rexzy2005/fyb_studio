import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const departmentSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    headUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export type DepartmentDoc = InferSchemaType<typeof departmentSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const Department: Model<DepartmentDoc> =
  (mongoose.models.Department as Model<DepartmentDoc>) ||
  mongoose.model<DepartmentDoc>("Department", departmentSchema);
