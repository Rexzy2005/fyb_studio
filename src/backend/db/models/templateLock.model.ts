import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const templateLockSchema = new Schema(
  {
    templateId: {
      type: Schema.Types.ObjectId,
      ref: "Template",
      required: true,
      unique: true,
    },
    departmentId: {
      type: Schema.Types.ObjectId,
      ref: "Department",
      required: true,
      index: true,
    },
    lockedByUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    passcode: { type: String, required: false, default: null, trim: true },
  },
  { timestamps: true }
);

export type TemplateLockDoc = InferSchemaType<typeof templateLockSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const TemplateLock: Model<TemplateLockDoc> =
  (mongoose.models.TemplateLock as Model<TemplateLockDoc>) ||
  mongoose.model<TemplateLockDoc>("TemplateLock", templateLockSchema);
