import { NextResponse } from "next/server";

import { requireAdmin } from "@/backend/auth/session";
import { withErrorHandler } from "@/backend/errors/handler";
import {
  getRevenueShareSnapshot,
  saveRevenueFramework,
} from "@/backend/services/revenueShare.service";
import { revenueFrameworkSchema } from "@/backend/validation/revenueShare.schema";

export const runtime = "nodejs";

/**
 * GET /api/admin/revenue/shares
 *
 * Lifetime product revenue split through the live (editable) framework.
 */
export const GET = withErrorHandler(async () => {
  await requireAdmin();
  const snapshot = await getRevenueShareSnapshot();
  return NextResponse.json(snapshot);
});

/**
 * PUT /api/admin/revenue/shares
 *
 * Replace the live framework. Weights must sum to 100% and every
 * weighted category needs at least one assignee.
 */
export const PUT = withErrorHandler(async (req) => {
  const session = await requireAdmin();
  const body = await req.json().catch(() => null);
  const input = revenueFrameworkSchema.parse(body);
  const snapshot = await saveRevenueFramework(input, session.user.id);
  return NextResponse.json(snapshot);
});
