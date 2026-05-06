import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * Append-only log of every successful download. Separate from `DownloadGrant`
 * because the grant is the *entitlement* (1 row per payment) while events are
 * the *activity* (N rows, one per actual download).
 *
 * Powers the admin dashboard's "downloads over time" + "top templates" views.
 */
const downloadEventSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    templateId: {
      type: Schema.Types.ObjectId,
      ref: "Template",
      required: true,
      index: true,
    },
    userDesignId: { type: String, default: null },
    grantId: {
      type: Schema.Types.ObjectId,
      ref: "DownloadGrant",
      required: true,
    },
    paymentId: {
      type: Schema.Types.ObjectId,
      ref: "Payment",
      required: true,
    },
    // Which export size the user picked (1, 2, 3). Useful for "do users mostly
    // export at 2x?" decisions about default presets.
    scale: { type: Number, default: null },

    occurredAt: { type: Date, default: () => new Date(), index: true },
  },
  { timestamps: true }
);

// "Top downloaded templates this month".
downloadEventSchema.index({ templateId: 1, occurredAt: -1 });

export type DownloadEventDoc = InferSchemaType<typeof downloadEventSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const DownloadEvent: Model<DownloadEventDoc> =
  (mongoose.models.DownloadEvent as Model<DownloadEventDoc>) ||
  mongoose.model<DownloadEventDoc>("DownloadEvent", downloadEventSchema);
