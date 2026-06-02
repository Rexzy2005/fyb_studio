import { NextResponse } from "next/server";

import { withErrorHandler } from "@/backend/errors/handler";
import { getPaymentResumeTarget } from "@/backend/services/payment.service";

export const runtime = "nodejs";

/**
 * GET /api/payments/callback
 *
 * Paystack redirects here after hosted/redirect-style payment completion.
 * We only use it to route the browser back to the user's editing page. The
 * actual delivery decision still happens through the signed webhook or the
 * authenticated verify endpoint.
 */
export const GET = withErrorHandler(async (req) => {
  const url = new URL(req.url);
  const reference =
    url.searchParams.get("reference") ?? url.searchParams.get("trxref");

  if (!reference) {
    return NextResponse.redirect(new URL("/dashboard?payment=missing-reference", url.origin));
  }

  const target = await getPaymentResumeTarget(reference);
  if (!target) {
    const params = new URLSearchParams({
      payment: "unknown-reference",
      reference,
    });
    return NextResponse.redirect(new URL(`/dashboard?${params.toString()}`, url.origin));
  }

  const params = new URLSearchParams({
    resume: "1",
    reference,
  });
  if (target.userDesignId) params.set("userDesignId", target.userDesignId);

  return NextResponse.redirect(
    new URL(`/templates/${target.templateId}/use?${params.toString()}`, url.origin)
  );
});
