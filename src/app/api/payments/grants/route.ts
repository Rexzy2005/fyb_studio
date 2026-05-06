import { NextResponse } from "next/server";

import { requireSession } from "@/backend/auth/session";
import { withErrorHandler } from "@/backend/errors/handler";
import { listPendingGrantsForUser } from "@/backend/services/payment.service";

export const runtime = "nodejs";

/**
 * GET /api/payments/grants
 *
 * Lists every active (unconsumed, unexpired) grant the signed-in user owns.
 * Powers the dashboard's "pending downloads" section so a user who paid but
 * never finished the export can pick up where they left off.
 */
export const GET = withErrorHandler(async () => {
  const session = await requireSession();
  const grants = await listPendingGrantsForUser(session.user.id);
  return NextResponse.json({ grants });
});
