import { NextResponse } from "next/server";

import { withErrorHandler } from "@/backend/errors/handler";
import { getPaymentResumeTarget } from "@/backend/services/payment.service";

export const runtime = "nodejs";

/**
 * GET /api/payments/callback
 *
 * Paystack redirects here after hosted/redirect-style payment completion.
 * Route the browser to the dashboard, where the pending-download controller
 * verifies the reference if needed and starts the download when possible.
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
    autoDownload: "1",
    reference,
  });
  if (target.userDesignId) params.set("userDesignId", target.userDesignId);
  params.set("templateId", target.templateId);

  return NextResponse.redirect(
    new URL(`/dashboard?${params.toString()}`, url.origin)
  );
});
