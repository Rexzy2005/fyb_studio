import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * A grant entitles a user to download a specific design without re-paying
 * until `expiresAt`. Issued when a payment is verified. Reused by the
 * "user already paid; let them re-download" check.
 *
 * Why we store this separately from `Payment`:
 *   - The grant has its own lifecycle (download counter, expiry) that
 *     doesn't belong to the payment record.
 *   - Refund / chargeback flows set the payment to `refunded` but we may
 *     still want the grant history for analytics - keeping them apart lets
 *     us do that cleanly.
 */
const downloadGrantSchema = new Schema(
  {
    paymentId: {
      type: Schema.Types.ObjectId,
      ref: "Payment",
      required: true,
      index: true,
    },
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
    userDesignId: { type: String, default: null, index: true },

    issuedAt: { type: Date, default: () => new Date() },
    // Safety expiry: an unconsumed grant stays valid for `expiresAt`. Set
    // generously (default 7 days) - this is "the user must come back and
    // download by then", NOT a re-download window. Past `expiresAt`, the
    // grant is dead even if it was never used.
    expiresAt: { type: Date, required: true, index: true },

    // Single-use semantics: once `consumedAt` is set, the grant cannot be
    // reused - the user must pay again for any future download. This
    // replaces the prior 24-hour re-download grace.
    consumedAt: { type: Date, default: null, index: true },

    // Counter + last-download timestamp kept for analytics + abuse detection
    // even with single-use grants - useful for flagging suspicious patterns
    // (multiple confirmations, etc.) in the admin dashboard.
    downloadsUsed: { type: Number, default: 0 },
    lastDownloadAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// "Does the user have an active (unconsumed, unexpired) grant for this design
// right now?" Compound index covers the common lookup path.
downloadGrantSchema.index({
  userId: 1,
  templateId: 1,
  userDesignId: 1,
  consumedAt: 1,
  expiresAt: -1,
});

export type DownloadGrantDoc = InferSchemaType<typeof downloadGrantSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const DownloadGrant: Model<DownloadGrantDoc> =
  (mongoose.models.DownloadGrant as Model<DownloadGrantDoc>) ||
  mongoose.model<DownloadGrantDoc>("DownloadGrant", downloadGrantSchema);
