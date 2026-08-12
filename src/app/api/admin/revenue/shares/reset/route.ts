import { NextResponse } from "next/server";

import { requireAdmin } from "@/backend/auth/session";
import { withErrorHandler } from "@/backend/errors/handler";
import { resetRevenueFramework } from "@/backend/services/revenueShare.service";

export const runtime = "nodejs";

/**
 * POST /api/admin/revenue/shares/reset
 *
 * Restore the signed PDF framework (50/25/15/10 across the original five).
 */
export const POST = withErrorHandler(async () => {
  const session = await requireAdmin();
  const snapshot = await resetRevenueFramework(session.user.id);
  return NextResponse.json(snapshot);
});
