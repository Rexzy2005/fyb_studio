import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const cloudinaryAssetSchema = new Schema(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    bytes: { type: Number, default: null },
    mime: { type: String, default: null },
  },
  { _id: false }
);

const designAssetEntrySchema = new Schema(
  {
    nodeId: { type: String, required: true },
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    mime: { type: String, default: null },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    bytes: { type: Number, default: null },
  },
  { _id: false }
);

const templateSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    category: { type: String, default: null, trim: true },

    status: {
      type: String,
      enum: ["published"],
      default: "published",
      required: true,
    },

    fieldConfig: { type: Schema.Types.Mixed, required: true },
    normalized: { type: Schema.Types.Mixed, default: null },
    designJson: { type: Schema.Types.Mixed, required: true },

    cover: { type: cloudinaryAssetSchema, required: true },
    designAssets: { type: [designAssetEntrySchema], default: [] },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    publishedAt: { type: Date, default: () => new Date() },

    version: { type: Number, default: 1 },
  },
  { timestamps: true }
);

templateSchema.index({ status: 1, publishedAt: -1 });

export type TemplateDoc = InferSchemaType<typeof templateSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const Template: Model<TemplateDoc> =
  (mongoose.models.Template as Model<TemplateDoc>) ||
  mongoose.model<TemplateDoc>("Template", templateSchema);
