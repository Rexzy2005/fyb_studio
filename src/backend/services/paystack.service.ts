import crypto from "node:crypto";

import { env } from "@/backend/env";
import { AppError } from "@/backend/errors/app-error";

const PAYSTACK_BASE = "https://api.paystack.co";

export type PaystackVerifyResult = {
  status: "success" | "failed" | "abandoned" | string;
  reference: string;
  amount: number; // kobo
  currency: string;
  paidAt: string | null;
  customer: {
    email: string | null;
  } | null;
  /** Full Paystack `data` payload preserved verbatim for storage. */
  raw: unknown;
};

function requireSecretKey(): string {
  const key = env.PAYSTACK_SECRET_KEY;
  if (!key) {
    throw new AppError(
      "PAYMENT_NOT_CONFIGURED",
      "Payments are not configured on this server",
      503
    );
  }
  return key;
}

/**
 * Server-side verification of a Paystack transaction. Called BOTH from the
 * popup-callback handler and from the webhook — Paystack guarantees at-least-
 * once delivery, so the caller is responsible for idempotency (we use the
 * unique `paystackReference` index on `Payment`).
 *
 * Network failures are retried once: real-world Paystack hiccups occasionally
 * return a 502 for ~1s while their LB reconfigures. A second attempt almost
 * always succeeds; we don't want to fail a paying user over a transient blip.
 */
export async function verifyPaystackTransaction(
  reference: string
): Promise<PaystackVerifyResult> {
  const secret = requireSecretKey();

  const url = `${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`;
  const headers = {
    Authorization: `Bearer ${secret}`,
    Accept: "application/json",
  };

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { headers, cache: "no-store" });
      if (!res.ok) {
        // 4xx from Paystack is authoritative — no point retrying. Read the
        // body so the AppError carries Paystack's message back to the client.
        const body = await safeJson(res);
        if (res.status >= 400 && res.status < 500) {
          throw new AppError(
            "PAYMENT_VERIFY_FAILED",
            extractMessage(body) ?? `Paystack rejected the request (${res.status})`,
            502,
            { paystackStatus: res.status }
          );
        }
        // Fall through to retry on 5xx.
        lastError = new Error(`Paystack 5xx (${res.status})`);
        continue;
      }

      const json = (await res.json()) as {
        status?: boolean;
        message?: string;
        data?: {
          status: string;
          reference: string;
          amount: number;
          currency: string;
          paid_at?: string | null;
          customer?: { email?: string | null } | null;
        };
      };

      if (!json.status || !json.data) {
        throw new AppError(
          "PAYMENT_VERIFY_FAILED",
          json.message ?? "Paystack returned an unexpected payload",
          502
        );
      }

      const data = json.data;
      return {
        status: data.status,
        reference: data.reference,
        amount: data.amount,
        currency: data.currency,
        paidAt: data.paid_at ?? null,
        customer: { email: data.customer?.email ?? null },
        raw: data,
      };
    } catch (err) {
      lastError = err;
      // Don't retry AppError — those are deterministic.
      if (err instanceof AppError) throw err;
    }
  }

  throw new AppError(
    "PAYMENT_VERIFY_FAILED",
    "Could not reach Paystack to verify the transaction",
    502,
    { cause: lastError instanceof Error ? lastError.message : String(lastError) }
  );
}

/**
 * Verify a Paystack webhook signature. Paystack signs the raw request body
 * with the merchant secret (HMAC-SHA512) and sends the digest in the
 * `x-paystack-signature` header. Caller passes the raw body string — DO NOT
 * pass a parsed JSON object, since serialisation differences will break the
 * signature.
 */
export function isValidPaystackWebhookSignature(
  rawBody: string,
  signatureHeader: string | null
): boolean {
  if (!signatureHeader) return false;
  const secret = env.PAYSTACK_WEBHOOK_SECRET ?? env.PAYSTACK_SECRET_KEY;
  if (!secret) return false;
  const computed = crypto
    .createHmac("sha512", secret)
    .update(rawBody, "utf8")
    .digest("hex");
  // Length check first to make the timingSafeEqual call safe.
  if (computed.length !== signatureHeader.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(computed, "utf8"),
    Buffer.from(signatureHeader, "utf8")
  );
}

/**
 * Generate a unique server-side reference. Embeds a short prefix so we can
 * recognise our own references in Paystack's dashboard/exports at a glance.
 */
export function generatePaystackReference(): string {
  return `fyb_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function extractMessage(body: unknown): string | null {
  if (body && typeof body === "object" && "message" in body) {
    const m = (body as { message?: unknown }).message;
    if (typeof m === "string" && m.length > 0) return m;
  }
  return null;
}
