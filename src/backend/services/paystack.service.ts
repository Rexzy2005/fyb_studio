import crypto from "node:crypto";

import { env } from "@/backend/env";
import { AppError } from "@/backend/errors/app-error";

const PAYSTACK_BASE = "https://api.paystack.co";
const PAYSTACK_INIT_TIMEOUT_MS = 8000;
const PAYSTACK_VERIFY_TIMEOUT_MS = 10000;

export type PaystackInitializeResult = {
  reference: string;
  accessCode: string;
  authorizationUrl: string;
};

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

function createPaystackTimeout(timeoutMs: number): {
  signal: AbortSignal;
  clear: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  };
}

export async function initializePaystackTransaction(input: {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<PaystackInitializeResult> {
  const secret = requireSecretKey();
  const timeout = createPaystackTimeout(PAYSTACK_INIT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: input.email,
        amount: input.amountKobo,
        reference: input.reference,
        callback_url: input.callbackUrl ?? undefined,
        metadata: input.metadata,
      }),
      cache: "no-store",
      signal: timeout.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new AppError(
        "PAYMENT_INIT_FAILED",
        "Paystack took too long to start checkout. Please try again.",
        504
      );
    }
    throw err;
  } finally {
    timeout.clear();
  }

  const body = (await safeJson(res)) as {
    status?: boolean;
    message?: string;
    data?: {
      reference?: string;
      access_code?: string;
      authorization_url?: string;
    };
  } | null;

  if (!res.ok || !body?.status || !body.data?.access_code) {
    throw new AppError(
      "PAYMENT_INIT_FAILED",
      extractMessage(body) ?? "Paystack could not initialize the transaction",
      502,
      { paystackStatus: res.status }
    );
  }

  return {
    reference: body.data.reference ?? input.reference,
    accessCode: body.data.access_code,
    authorizationUrl: body.data.authorization_url ?? "",
  };
}

/**
 * Server-side verification of a Paystack transaction. Called BOTH from the
 * popup-callback handler and from the webhook - Paystack guarantees at-least-
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
    const timeout = createPaystackTimeout(PAYSTACK_VERIFY_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers,
        cache: "no-store",
        signal: timeout.signal,
      });
      if (!res.ok) {
        // 4xx from Paystack is authoritative - no point retrying. Read the
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
      if (err instanceof Error && err.name === "AbortError") {
        lastError = new Error("Paystack verification timed out");
        continue;
      }
      // Don't retry AppError - those are deterministic.
      if (err instanceof AppError) throw err;
    } finally {
      timeout.clear();
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
 * `x-paystack-signature` header. Caller passes the raw body string - DO NOT
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
