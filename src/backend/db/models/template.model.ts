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

const pluginImagesSchema = new Schema(
  {
    byHash: { type: Schema.Types.Mixed, default: {} },
    byNodeId: { type: Schema.Types.Mixed, default: {} },
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
    designJson: { type: Schema.Types.Mixed, default: null },

    pluginImages: { type: pluginImagesSchema, default: () => ({ byHash: {}, byNodeId: {} }) },

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

type SchemaPathWithRequiredState = {
  options?: { required?: unknown };
  isRequired?: boolean;
  validators?: Array<{ type?: string }>;
};

function hasRequiredValidator(path: SchemaPathWithRequiredState | undefined): boolean {
  if (!path) return false;
  const required = path.options?.required;
  return (
    required === true ||
    Boolean(path.isRequired) ||
    Boolean(path.validators?.some((validator) => validator.type === "required"))
  );
}

function getTemplateModel(): Model<TemplateDoc> {
  const existing = mongoose.models.Template as Model<TemplateDoc> | undefined;
  if (existing) {
    const designJsonPath = existing.schema.path("designJson") as
      | SchemaPathWithRequiredState
      | undefined;
    const stale =
      hasRequiredValidator(designJsonPath) ||
      !existing.schema.path("pluginImages");

    if (!stale) return existing;

    // Next dev keeps Mongoose models across hot reloads. Recompile when the
    // cached schema still has the pre-trim required designJson field, otherwise
    // publishes fail even though this file now allows designJson to be null.
    mongoose.deleteModel("Template");
  }

  return mongoose.model<TemplateDoc>("Template", templateSchema);
}

export const Template: Model<TemplateDoc> =
  getTemplateModel();
