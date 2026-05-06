import { NextResponse } from "next/server";

import { requireAdmin } from "@/backend/auth/session";
import { withErrorHandler } from "@/backend/errors/handler";
import { updateFeedback } from "@/backend/services/feedback.service";
import { updateFeedbackSchema } from "@/backend/validation/feedback.schema";

export const runtime = "nodejs";

/**
 * PATCH /api/admin/feedback/[id]
 *
 * Updates triage status and/or admin notes on a feedback row. Idempotent —
 * resending the same body is fine.
 */
export const PATCH = withErrorHandler(async (req, ctx) => {
  await requireAdmin();
  const { id } = await ctx.params;
  const body = updateFeedbackSchema.parse(await req.json());
  const row = await updateFeedback({ id, input: body });
  return NextResponse.json({ feedback: row });
});
