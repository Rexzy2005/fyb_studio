import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/backend/auth/session";
import { withErrorHandler } from "@/backend/errors/handler";
import {
  findActiveGrant,
  quoteDownloadPrice,
} from "@/backend/services/payment.service";

export const runtime = "nodejs";

const querySchema = z.object({
  templateId: z.string().min(1),
  userDesignId: z.string().min(1).nullable().optional(),
});

/**
 * GET /api/payments/grant?templateId=…&userDesignId=…
 *
 * Tells the client whether the signed-in user already has an active download
 * grant for this design. Used by the editor to pick between "download
 * straight away" and "open payment modal".
 *
 * Always returns the price too, so the modal can render without a second
 * round-trip.
 */
export const GET = withErrorHandler(async (req) => {
  const session = await requireSession();
  const { searchParams } = new URL(req.url);
  const parsed = querySchema.parse({
    templateId: searchParams.get("templateId"),
    userDesignId: searchParams.get("userDesignId"),
  });

  const grant = await findActiveGrant({
    userId: session.user.id,
    templateId: parsed.templateId,
    userDesignId: parsed.userDesignId ?? null,
  });
  const price = quoteDownloadPrice();

  return NextResponse.json({
    grant,
    price: {
      amountKobo: price.amountKobo,
      amountNgn: price.amountNgn,
      currency: price.currency,
    },
  });
});
