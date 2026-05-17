import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/backend/auth/session";
import { withErrorHandler } from "@/backend/errors/handler";
import { AppError } from "@/backend/errors/app-error";
import { confirmPaymentByReference } from "@/backend/services/payment.service";

export const runtime = "nodejs";

const verifyBodySchema = z.object({
  reference: z.string().min(1),
});

/**
 * POST /api/payments/verify
 *
 * Called by the client after the Paystack popup callback fires. Verifies the
 * payment server-side via Paystack's API, marks our local payment row as
 * `success`, and issues a download grant.
 *
 * Idempotent - safe to call multiple times for the same reference. The
 * webhook also calls confirmPaymentByReference, so whichever lands first
 * wins and the other becomes a no-op.
 *
 * Authorization: the verifier must be signed in AND must be the same user
 * who initialized the payment. This stops User A from confirming User B's
 * pending payment as a cross-account hijack.
 */
export const POST = withErrorHandler(async (req) => {
  const session = await requireSession();
  const body = verifyBodySchema.parse(await req.json());

  const { payment, grant } = await confirmPaymentByReference(body.reference);

  if (String(payment.userId) !== session.user.id) {
    throw new AppError(
      "FORBIDDEN",
      "This payment belongs to a different user",
      403
    );
  }

  return NextResponse.json({
    status: "success",
    grant: {
      id: String(grant._id),
      templateId: String(grant.templateId),
      userDesignId: grant.userDesignId,
      expiresAt: grant.expiresAt.toISOString(),
      paystackReference: payment.paystackReference,
    },
  });
});
