import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/backend/auth/session";
import { withErrorHandler } from "@/backend/errors/handler";
import { initializePayment } from "@/backend/services/payment.service";

export const runtime = "nodejs";

const initBodySchema = z.object({
  templateId: z.string().min(1),
  userDesignId: z.string().min(1).nullable().optional(),
});

/**
 * POST /api/payments/init
 *
 * Creates (or returns an idempotent existing) pending payment for the given
 * template, returning everything the client needs to open the Paystack popup
 * (reference, amount in kobo, public key).
 */
export const POST = withErrorHandler(async (req) => {
  const session = await requireSession();
  const body = initBodySchema.parse(await req.json());

  const result = await initializePayment({
    userId: session.user.id,
    templateId: body.templateId,
    userDesignId: body.userDesignId ?? null,
  });

  return NextResponse.json({
    reference: result.reference,
    amountKobo: result.amountKobo,
    amountNgn: result.amountNgn,
    currency: result.currency,
    publicKey: result.publicKey,
    customerEmail: session.user.email ?? null,
  });
});
