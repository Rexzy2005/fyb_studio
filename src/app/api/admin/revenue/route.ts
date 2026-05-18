import { NextResponse } from "next/server";

import { requireAdmin } from "@/backend/auth/session";
import { withErrorHandler } from "@/backend/errors/handler";
import {
  getRecentPayments,
  getRevenueDailyBuckets,
  getRevenueSummary,
  getTopTemplates,
} from "@/backend/services/revenue.service";

export const runtime = "nodejs";

/**
 * GET /api/admin/revenue
 *
 * Single endpoint for the admin dashboard's payments + downloads card. We
 * fetch summary + 30-day buckets + top templates + recent payments in
 * parallel so the dashboard renders in one round-trip.
 */
export const GET = withErrorHandler(async () => {
  await requireAdmin();
  const [summary, daily, topTemplates, recentPayments] = await Promise.all([
    getRevenueSummary(),
    getRevenueDailyBuckets(30),
    getTopTemplates(5),
    getRecentPayments(10),
  ]);
  return NextResponse.json({
    summary,
    daily,
    topTemplates,
    recentPayments,
  });
});
