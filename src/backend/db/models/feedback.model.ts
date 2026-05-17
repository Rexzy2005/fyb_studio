import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * User feedback / survey submissions.
 *
 * One row per submission. Users can submit multiple times - the dashboard
 * de-duplicates by user when it makes sense (e.g. "unique respondents")
 * but raw events are preserved so trends over time stay measurable.
 *
 * The `status` field powers the admin triage workflow: new → reviewed →
 * actioned → archived. We never delete feedback.
 */

export const FEEDBACK_CATEGORIES = [
  "design_templates",
  "editor_experience",
  "payment_download",
  "performance",
  "bug_report",
  "feature_request",
  "other",
] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const FEEDBACK_SOURCES = [
  "dashboard_card",
  "floating_button",
  "post_download",
  "other",
] as const;

export type FeedbackSource = (typeof FEEDBACK_SOURCES)[number];

const feedbackSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // 1 (very unhappy) → 5 (very happy). Single integer because the UI is
    // a 5-emoji picker; using a finer scale would force admins to bucket
    // anyway and add no signal.
    rating: { type: Number, required: true, min: 1, max: 5 },

    // Multi-select chips - kept as a controlled enum so the dashboard's
    // category breakdown chart can rely on a stable label set.
    categories: {
      type: [{ type: String, enum: FEEDBACK_CATEGORIES }],
      default: [],
    },

    // Optional free-text. Trimmed + capped at 4k chars at the validation layer.
    message: { type: String, default: "", trim: true },

    // Where in the app the user opened the form. Helps us understand which
    // surface elicits the most useful feedback.
    source: {
      type: String,
      enum: FEEDBACK_SOURCES,
      default: "other",
      required: true,
    },

    // Optional context - page they were on, template they had open, etc.
    // Lets us connect a frustrated 1-star to "Editor: Template X" without
    // forcing the user to type that in.
    context: {
      type: new Schema(
        {
          page: { type: String, default: null, trim: true },
          templateId: { type: String, default: null },
          userDesignId: { type: String, default: null },
          userAgent: { type: String, default: null },
        },
        { _id: false }
      ),
      default: () => ({}),
    },

    // Admin triage workflow.
    status: {
      type: String,
      enum: ["new", "reviewed", "actioned", "archived"],
      default: "new",
      required: true,
      index: true,
    },
    adminNotes: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

// Powers the dashboard's "rating distribution" + "feedback over time" cards.
feedbackSchema.index({ rating: 1, createdAt: -1 });
feedbackSchema.index({ status: 1, createdAt: -1 });

export type FeedbackDoc = InferSchemaType<typeof feedbackSchema> & {
  _id: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
};

export const Feedback: Model<FeedbackDoc> =
  (mongoose.models.Feedback as Model<FeedbackDoc>) ||
  mongoose.model<FeedbackDoc>("Feedback", feedbackSchema);
