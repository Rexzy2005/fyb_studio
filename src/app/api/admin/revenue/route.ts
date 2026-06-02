import { NextResponse } from "next/server";

import { requireAdmin } from "@/backend/auth/session";
import { withErrorHandler } from "@/backend/errors/handler";
import {
  getRevenueDailyBuckets,
  getRevenueSummary,
  getTopTemplates,
} from "@/backend/services/revenue.service";
import { reconcileRecentPaymentAttempts } from "@/backend/services/payment.service";

export const runtime = "nodejs";

/**
 * GET /api/admin/revenue
 *
 * Single endpoint for the admin dashboard's payments + downloads card. We
 * fetch summary + 30-day buckets + top templates in parallel so the dashboard
 * renders in one round-trip. Full payment history lives at /api/admin/payments.
 */
export const GET = withErrorHandler(async () => {
  await requireAdmin();
  await reconcileRecentPaymentAttempts();
  const [summary, daily, topTemplates] = await Promise.all([
    getRevenueSummary(),
    getRevenueDailyBuckets(30),
    getTopTemplates(5),
  ]);
  return NextResponse.json({
    summary,
    daily,
    topTemplates,
  });
});
