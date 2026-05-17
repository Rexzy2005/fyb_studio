import { NextResponse } from "next/server";

import { requireSession } from "@/backend/auth/session";
import { withErrorHandler } from "@/backend/errors/handler";
import { submitFeedback } from "@/backend/services/feedback.service";
import { submitFeedbackSchema } from "@/backend/validation/feedback.schema";

export const runtime = "nodejs";

/**
 * POST /api/feedback
 *
 * Submit a feedback / survey response. Auth-required so we can attribute
 * each submission to a real user. We do NOT rate-limit hard at the API
 * layer - the UI throttles via "you already gave feedback recently"
 * dismissal in localStorage; light spam tolerance is preferred over
 * blocking legitimate follow-up feedback.
 */
export const POST = withErrorHandler(async (req) => {
  const session = await requireSession();
  const body = submitFeedbackSchema.parse(await req.json());

  const doc = await submitFeedback({
    userId: session.user.id,
    input: body,
  });

  return NextResponse.json({
    ok: true,
    feedbackId: String(doc._id),
  });
});
