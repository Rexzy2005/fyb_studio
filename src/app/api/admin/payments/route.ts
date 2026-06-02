import { NextResponse } from "next/server";

import { requireAdmin } from "@/backend/auth/session";
import { withErrorHandler } from "@/backend/errors/handler";
import { expireStalePaymentAttempts } from "@/backend/services/payment.service";
import {
  getRecentPayments,
  getRevenueSummary,
} from "@/backend/services/revenue.service";

export const runtime = "nodejs";

/**
 * GET /api/admin/payments
 *
 * Dedicated admin payment history endpoint. It reconciles stale attempts
 * before reading so the page reflects pending attempts that have aged out.
 */
export const GET = withErrorHandler(async (req: Request) => {
  await requireAdmin();
  await expireStalePaymentAttempts();

  const url = new URL(req.url);
  const requestedLimit = Number(url.searchParams.get("limit") ?? 100);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.floor(requestedLimit), 1), 200)
    : 100;

  const [summary, payments] = await Promise.all([
    getRevenueSummary(),
    getRecentPayments(limit),
  ]);

  return NextResponse.json({ summary, payments });
});
