import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const categorySchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    weightBps: { type: Number, required: true, min: 0, max: 10_000 },
    color: { type: String, required: true },
  },
  { _id: false }
);

const memberSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    role: { type: String, default: null, trim: true },
    color: { type: String, required: true },
  },
  { _id: false }
);

const assignmentSchema = new Schema(
  {
    memberId: { type: String, required: true },
    categoryId: { type: String, required: true },
  },
  { _id: false }
);

/**
 * Singleton document that stores the editable revenue-sharing framework.
 * Key is always "default" — one live deal for the product.
 */
const revenueFrameworkSchema = new Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "default",
    },
    categories: { type: [categorySchema], required: true },
    members: { type: [memberSchema], required: true },
    assignments: { type: [assignmentSchema], required: true },
    updatedByUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

export type RevenueFrameworkDoc = InferSchemaType<typeof revenueFrameworkSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const RevenueFrameworkModel: Model<RevenueFrameworkDoc> =
  (mongoose.models.RevenueFramework as Model<RevenueFrameworkDoc>) ||
  mongoose.model<RevenueFrameworkDoc>("RevenueFramework", revenueFrameworkSchema);
