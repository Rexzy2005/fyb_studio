import { NextResponse } from "next/server";

import { withErrorHandler } from "@/backend/errors/handler";
import {
  confirmPaymentFromPaystackWebhook,
} from "@/backend/services/payment.service";
import { isValidPaystackWebhookSignature } from "@/backend/services/paystack.service";

export const runtime = "nodejs";

type PaystackWebhookPayload = {
  event?: string;
  data?: {
    reference?: unknown;
    status?: unknown;
    amount?: unknown;
    currency?: unknown;
    paid_at?: unknown;
  };
};

function numericAmount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * POST /api/payments/webhook
 *
 * Paystack's at-least-once delivery channel for transaction events. We use
 * it as the safety net behind the popup-callback verify - if a user closes
 * the browser between paying and the popup callback firing, this still
 * promotes the payment to `success` and issues the grant.
 *
 * Always returns 200 (even on internal errors) UNLESS the signature is bad -
 * Paystack disables the webhook after several non-200 responses, and most of
 * the "errors" we'd encounter (e.g. unknown reference for a different
 * environment's payment) are not worth burning the webhook over.
 */
export const POST = withErrorHandler(async (req) => {
  // Read the raw body BEFORE parsing - signature is over the bytes Paystack
  // sent us, not over a re-serialised JSON.
  const raw = await req.text();
  const sig = req.headers.get("x-paystack-signature");
  if (!isValidPaystackWebhookSignature(raw, sig)) {
    return NextResponse.json(
      { error: { code: "BAD_SIGNATURE", message: "Invalid signature" } },
      { status: 401 }
    );
  }

  let payload: PaystackWebhookPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true, ignored: "unparseable body" });
  }

  // Only `charge.success` carries an actionable transaction. We log+ack
  // everything else so Paystack stops retrying.
  if (payload.event !== "charge.success") {
    return NextResponse.json({ ok: true, ignored: payload.event ?? null });
  }

  const reference = payload.data?.reference;
  if (typeof reference !== "string" || reference.length === 0) {
    return NextResponse.json({ ok: true, ignored: "no reference" });
  }

  const amount = numericAmount(payload.data?.amount);
  if (amount === null) {
    return NextResponse.json({ ok: true, ignored: "no amount" });
  }

  const currency =
    typeof payload.data?.currency === "string" ? payload.data.currency : null;
  if (!currency) {
    return NextResponse.json({ ok: true, ignored: "no currency" });
  }

  const status =
    typeof payload.data?.status === "string" ? payload.data.status : "success";
  const paidAt =
    typeof payload.data?.paid_at === "string" ? payload.data.paid_at : null;

  try {
    await confirmPaymentFromPaystackWebhook({
      reference,
      status,
      amount,
      currency,
      paidAt,
      raw: payload.data,
    });
  } catch (err) {
    // Swallow - Paystack will retry forever otherwise. The original error is
    // logged for ops; downstream `/verify` calls will surface the right state
    // to the user.
    console.error("[paystack-webhook] confirm failed", { reference, err });
  }

  return NextResponse.json({ ok: true });
});
