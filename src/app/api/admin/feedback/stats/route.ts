import { NextResponse } from "next/server";

import { requireAdmin } from "@/backend/auth/session";
import { withErrorHandler } from "@/backend/errors/handler";
import { getFeedbackStats } from "@/backend/services/feedback.service";

export const runtime = "nodejs";

/**
 * GET /api/admin/feedback/stats
 *
 * Aggregations driving the dashboard's charts: total / unique respondents,
 * average rating, distribution buckets, sentiment, category breakdown,
 * status breakdown, 30-day daily trend.
 */
export const GET = withErrorHandler(async () => {
  await requireAdmin();
  const stats = await getFeedbackStats();
  return NextResponse.json({ stats });
});
