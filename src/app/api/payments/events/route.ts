import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/backend/auth/session";
import { withErrorHandler } from "@/backend/errors/handler";
import { markPaymentCancelledByReference } from "@/backend/services/payment.service";

export const runtime = "nodejs";

const eventBodySchema = z.object({
  reference: z.string().min(1),
  event: z.literal("cancelled"),
});

export const POST = withErrorHandler(async (req) => {
  const session = await requireSession();
  const body = eventBodySchema.parse(await req.json());

  await markPaymentCancelledByReference({
    reference: body.reference,
    userId: session.user.id,
  });

  return NextResponse.json({ ok: true });
});
