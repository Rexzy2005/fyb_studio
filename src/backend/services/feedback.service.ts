import mongoose from "mongoose";

import { connectDb } from "@/backend/db/client";
import {
  FEEDBACK_CATEGORIES,
  Feedback,
  type FeedbackCategory,
  type FeedbackDoc,
} from "@/backend/db/models";
import { AppError } from "@/backend/errors/app-error";
import type {
  SubmitFeedbackInput,
  UpdateFeedbackInput,
} from "@/backend/validation/feedback.schema";

export type FeedbackRow = {
  id: string;
  rating: number;
  categories: FeedbackCategory[];
  message: string;
  source: string;
  context: {
    page: string | null;
    templateId: string | null;
    userDesignId: string | null;
    userAgent: string | null;
  };
  status: "new" | "reviewed" | "actioned" | "archived";
  adminNotes: string;
  user: {
    id: string;
    name: string | null;
    email: string | null;
  };
  createdAt: string;
  updatedAt: string;
};

export async function submitFeedback(opts: {
  userId: string;
  input: SubmitFeedbackInput;
}): Promise<FeedbackDoc> {
  await connectDb();
  return Feedback.create({
    userId: new mongoose.Types.ObjectId(opts.userId),
    rating: opts.input.rating,
    categories: opts.input.categories,
    message: opts.input.message ?? "",
    source: opts.input.source,
    context: {
      page: opts.input.context?.page ?? null,
      templateId: opts.input.context?.templateId ?? null,
      userDesignId: opts.input.context?.userDesignId ?? null,
      userAgent: opts.input.context?.userAgent ?? null,
    },
  });
}

export type ListFeedbackFilters = {
  status?: "new" | "reviewed" | "actioned" | "archived";
  rating?: number;
  category?: FeedbackCategory;
  search?: string;
  limit?: number;
  cursor?: string | null;
};

export type ListFeedbackResult = {
  rows: FeedbackRow[];
  nextCursor: string | null;
};

/**
 * Cursor-paginated list of feedback for the admin dashboard. Cursor is the
 * `_id` of the last row returned — keeps pagination stable even as new rows
 * arrive at the top of the list.
 */
export async function listFeedback(
  filters: ListFeedbackFilters = {}
): Promise<ListFeedbackResult> {
  await connectDb();
  const limit = Math.max(1, Math.min(100, filters.limit ?? 25));

  const query: Record<string, unknown> = {};
  if (filters.status) query.status = filters.status;
  if (filters.rating !== undefined) query.rating = filters.rating;
  if (filters.category) query.categories = filters.category;
  if (filters.search) {
    const escaped = filters.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.message = { $regex: escaped, $options: "i" };
  }
  if (filters.cursor && mongoose.Types.ObjectId.isValid(filters.cursor)) {
    query._id = { $lt: new mongoose.Types.ObjectId(filters.cursor) };
  }

  const docs = await Feedback.find(query)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .populate<{ userId: { name?: string; email?: string } | null }>([
      { path: "userId", select: "name email" },
    ])
    .lean();

  const hasMore = docs.length > limit;
  const slice = hasMore ? docs.slice(0, limit) : docs;
  const nextCursor = hasMore ? String(slice[slice.length - 1]._id) : null;

  const rows: FeedbackRow[] = slice.map((d) => {
    const user = d.userId as unknown as
      | { _id?: mongoose.Types.ObjectId; name?: string; email?: string }
      | mongoose.Types.ObjectId
      | null;
    const isPopulated = user && typeof user === "object" && "name" in user;
    return {
      id: String(d._id),
      rating: d.rating,
      categories: (d.categories ?? []) as FeedbackCategory[],
      message: d.message ?? "",
      source: d.source ?? "other",
      context: {
        page: d.context?.page ?? null,
        templateId: d.context?.templateId ?? null,
        userDesignId: d.context?.userDesignId ?? null,
        userAgent: d.context?.userAgent ?? null,
      },
      status: d.status as FeedbackRow["status"],
      adminNotes: d.adminNotes ?? "",
      user: isPopulated
        ? {
            id: String((user as { _id?: mongoose.Types.ObjectId })._id ?? ""),
            name: (user as { name?: string }).name ?? null,
            email: (user as { email?: string }).email ?? null,
          }
        : { id: "", name: null, email: null },
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    };
  });

  return { rows, nextCursor };
}

export async function updateFeedback(opts: {
  id: string;
  input: UpdateFeedbackInput;
}): Promise<FeedbackRow> {
  await connectDb();
  if (!mongoose.Types.ObjectId.isValid(opts.id)) {
    throw new AppError("VALIDATION_ERROR", "Invalid feedback id", 422);
  }
  const update: Record<string, unknown> = {};
  if (opts.input.status) update.status = opts.input.status;
  if (typeof opts.input.adminNotes === "string") {
    update.adminNotes = opts.input.adminNotes;
  }
  if (Object.keys(update).length === 0) {
    throw new AppError("VALIDATION_ERROR", "No fields to update", 422);
  }
  const doc = await Feedback.findByIdAndUpdate(opts.id, { $set: update }, {
    new: true,
  })
    .populate<{ userId: { name?: string; email?: string } | null }>([
      { path: "userId", select: "name email" },
    ])
    .lean();
  if (!doc) {
    throw new AppError("NOT_FOUND", "Feedback not found", 404);
  }
  const user = doc.userId as unknown as
    | { _id?: mongoose.Types.ObjectId; name?: string; email?: string }
    | mongoose.Types.ObjectId
    | null;
  const isPopulated = user && typeof user === "object" && "name" in user;
  return {
    id: String(doc._id),
    rating: doc.rating,
    categories: (doc.categories ?? []) as FeedbackCategory[],
    message: doc.message ?? "",
    source: doc.source ?? "other",
    context: {
      page: doc.context?.page ?? null,
      templateId: doc.context?.templateId ?? null,
      userDesignId: doc.context?.userDesignId ?? null,
      userAgent: doc.context?.userAgent ?? null,
    },
    status: doc.status as FeedbackRow["status"],
    adminNotes: doc.adminNotes ?? "",
    user: isPopulated
      ? {
          id: String((user as { _id?: mongoose.Types.ObjectId })._id ?? ""),
          name: (user as { name?: string }).name ?? null,
          email: (user as { email?: string }).email ?? null,
        }
      : { id: "", name: null, email: null },
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export type FeedbackStats = {
  total: number;
  uniqueRespondents: number;
  averageRating: number;
  ratingDistribution: { rating: number; count: number; pct: number }[];
  sentimentBreakdown: {
    positive: number; // 4-5
    neutral: number; // 3
    negative: number; // 1-2
  };
  categoryBreakdown: { category: FeedbackCategory; count: number }[];
  statusBreakdown: { status: string; count: number }[];
  last30Days: {
    total: number;
    averageRating: number;
    daily: { date: string; total: number; averageRating: number | null }[];
  };
};

export async function getFeedbackStats(): Promise<FeedbackStats> {
  await connectDb();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  since.setUTCHours(0, 0, 0, 0);

  const [
    totalAgg,
    distinctRespondents,
    distributionAgg,
    sentimentAgg,
    categoryAgg,
    statusAgg,
    last30TotalAgg,
    last30Daily,
  ] = await Promise.all([
    Feedback.aggregate<{
      _id: null;
      total: number;
      sumRating: number;
    }>([
      { $group: { _id: null, total: { $sum: 1 }, sumRating: { $sum: "$rating" } } },
    ]),
    Feedback.distinct("userId"),
    Feedback.aggregate<{ _id: number; count: number }>([
      { $group: { _id: "$rating", count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Feedback.aggregate<{ _id: "positive" | "neutral" | "negative"; count: number }>([
      {
        $group: {
          _id: {
            $switch: {
              branches: [
                { case: { $gte: ["$rating", 4] }, then: "positive" },
                { case: { $eq: ["$rating", 3] }, then: "neutral" },
              ],
              default: "negative",
            },
          },
          count: { $sum: 1 },
        },
      },
    ]),
    Feedback.aggregate<{ _id: FeedbackCategory; count: number }>([
      { $unwind: "$categories" },
      { $group: { _id: "$categories", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Feedback.aggregate<{ _id: string; count: number }>([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    Feedback.aggregate<{
      _id: null;
      total: number;
      sumRating: number;
    }>([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: null, total: { $sum: 1 }, sumRating: { $sum: "$rating" } } },
    ]),
    Feedback.aggregate<{
      _id: string;
      total: number;
      sumRating: number;
    }>([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "UTC" } },
          total: { $sum: 1 },
          sumRating: { $sum: "$rating" },
        },
      },
    ]),
  ]);

  const total = totalAgg[0]?.total ?? 0;
  const sumRating = totalAgg[0]?.sumRating ?? 0;
  const averageRating =
    total > 0 ? Math.round((sumRating / total) * 10) / 10 : 0;

  const distribution = [1, 2, 3, 4, 5].map((rating) => {
    const count = distributionAgg.find((d) => d._id === rating)?.count ?? 0;
    return {
      rating,
      count,
      pct: total > 0 ? Math.round((count / total) * 100) : 0,
    };
  });

  const sentiment = {
    positive: sentimentAgg.find((s) => s._id === "positive")?.count ?? 0,
    neutral: sentimentAgg.find((s) => s._id === "neutral")?.count ?? 0,
    negative: sentimentAgg.find((s) => s._id === "negative")?.count ?? 0,
  };

  const categoryBreakdown: FeedbackStats["categoryBreakdown"] = FEEDBACK_CATEGORIES.map(
    (category) => ({
      category,
      count: categoryAgg.find((c) => c._id === category)?.count ?? 0,
    })
  );

  // 30-day daily buckets, zero-filled.
  const dailyByDate = new Map<string, { date: string; total: number; sumRating: number }>();
  for (let i = 0; i < 30; i++) {
    const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    dailyByDate.set(key, { date: key, total: 0, sumRating: 0 });
  }
  for (const b of last30Daily) {
    const cur = dailyByDate.get(b._id);
    if (!cur) continue;
    cur.total = b.total;
    cur.sumRating = b.sumRating;
  }
  const daily = Array.from(dailyByDate.values()).map((b) => ({
    date: b.date,
    total: b.total,
    averageRating: b.total > 0 ? Math.round((b.sumRating / b.total) * 10) / 10 : null,
  }));

  const last30Total = last30TotalAgg[0]?.total ?? 0;
  const last30Sum = last30TotalAgg[0]?.sumRating ?? 0;

  return {
    total,
    uniqueRespondents: Array.isArray(distinctRespondents) ? distinctRespondents.length : 0,
    averageRating,
    ratingDistribution: distribution,
    sentimentBreakdown: sentiment,
    categoryBreakdown,
    statusBreakdown: statusAgg.map((s) => ({ status: s._id, count: s.count })),
    last30Days: {
      total: last30Total,
      averageRating:
        last30Total > 0 ? Math.round((last30Sum / last30Total) * 10) / 10 : 0,
      daily,
    },
  };
}
