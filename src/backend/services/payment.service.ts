import mongoose from "mongoose";

import { connectDb } from "@/backend/db/client";
import {
  DownloadEvent,
  DownloadGrant,
  Payment,
  Template,
  User,
  type DownloadGrantDoc,
  type PaymentDoc,
  type PaymentStatus,
} from "@/backend/db/models";
import { sendReceiptEmail } from "@/backend/email/send-receipt";
import { env } from "@/backend/env";
import { AppError } from "@/backend/errors/app-error";
import {
  generatePaystackReference,
  initializePaystackTransaction,
  verifyPaystackTransaction,
} from "./paystack.service";

const PRICE_NGN = env.PAYMENT_DOWNLOAD_PRICE_NGN;
const GRANT_EXPIRY_HOURS = env.PAYMENT_GRANT_EXPIRY_HOURS;
const ATTEMPT_EXPIRY_MINUTES = env.PAYMENT_ATTEMPT_EXPIRY_MINUTES;
const PAYSTACK_ACTIVE_STATUSES: PaymentStatus[] = [
  "pending",
  "ongoing",
  "processing",
  "queued",
  "timeout",
];
const PAYSTACK_FINAL_FAILURE_STATUSES: PaymentStatus[] = [
  "failed",
  "abandoned",
  "reversed",
];
const PAYSTACK_RECONCILE_STATUSES: PaymentStatus[] = [
  ...PAYSTACK_ACTIVE_STATUSES,
  "expired",
  "timeout",
];
const RECONCILE_LOOKBACK_DAYS = 90;
const RECONCILE_THROTTLE_MINUTES = 5;

export type PriceQuote = {
  amountKobo: number;
  amountNgn: number;
  currency: "NGN";
};

/**
 * Flat NGN price for any download. Centralised so that pricing changes
 * (env override, future per-template pricing) flow through one helper.
 */
export function quoteDownloadPrice(): PriceQuote {
  return {
    amountKobo: PRICE_NGN * 100,
    amountNgn: PRICE_NGN,
    currency: "NGN",
  };
}

function attemptExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + ATTEMPT_EXPIRY_MINUTES * 60 * 1000);
}

function isPaymentStatus(value: string): value is PaymentStatus {
  return [
    "pending",
    "success",
    "failed",
    "abandoned",
    "cancelled",
    "expired",
    "timeout",
    "ongoing",
    "processing",
    "queued",
    "reversed",
  ].includes(value);
}

function localStatusFromPaystack(status: string): PaymentStatus {
  return isPaymentStatus(status) ? status : "failed";
}

function dateFromPaystack(value: string | null | undefined): Date {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function appendStatusHistory(
  payment: PaymentDoc,
  input: {
    status: PaymentStatus;
    source: "init" | "popup" | "verify" | "webhook" | "system";
    message?: string | null;
    paystackStatus?: string | null;
    at?: Date;
  }
): void {
  payment.statusHistory.push({
    status: input.status,
    source: input.source,
    message: input.message ?? null,
    paystackStatus: input.paystackStatus ?? null,
    at: input.at ?? new Date(),
  });
}

export type ActiveGrantSummary = {
  grantId: string;
  expiresAt: string;
  paymentId: string;
};

/**
 * Find an active (unconsumed, unexpired) download grant for the user ×
 * template × userDesign tuple. Returns the most recent if multiple exist
 * (shouldn't with single-use semantics, but defensive against race-y inserts).
 */
export async function findActiveGrant(opts: {
  userId: string;
  templateId: string;
  userDesignId: string | null;
}): Promise<ActiveGrantSummary | null> {
  await connectDb();
  if (!mongoose.Types.ObjectId.isValid(opts.templateId)) return null;

  const grant = await DownloadGrant.findOne({
    userId: new mongoose.Types.ObjectId(opts.userId),
    templateId: new mongoose.Types.ObjectId(opts.templateId),
    userDesignId: opts.userDesignId ?? null,
    consumedAt: null,
    expiresAt: { $gt: new Date() },
  })
    .sort({ expiresAt: -1 })
    .lean();

  if (!grant) return null;
  return {
    grantId: String(grant._id),
    expiresAt: grant.expiresAt.toISOString(),
    paymentId: String(grant.paymentId),
  };
}

export type PendingGrantRow = {
  grantId: string;
  paymentId: string;
  templateId: string;
  templateName: string | null;
  userDesignId: string | null;
  issuedAt: string;
  expiresAt: string;
};

/**
 * All active grants for a user - used by the dashboard to surface "you've
 * paid but haven't downloaded yet" entries so a refresh / network drop in
 * the middle of an export can be resumed without losing the payment.
 */
export async function listPendingGrantsForUser(
  userId: string
): Promise<PendingGrantRow[]> {
  await connectDb();
  const rows = await DownloadGrant.find({
    userId: new mongoose.Types.ObjectId(userId),
    consumedAt: null,
    expiresAt: { $gt: new Date() },
  })
    .sort({ issuedAt: -1 })
    .populate<{ templateId: { name?: string } | null }>([
      { path: "templateId", select: "name" },
    ])
    .lean();

  return rows.map((r) => {
    const template = r.templateId as unknown as
      | { _id?: mongoose.Types.ObjectId; name?: string }
      | mongoose.Types.ObjectId
      | null;
    const isPopulated =
      template && typeof template === "object" && "name" in template;
    return {
      grantId: String(r._id),
      paymentId: String(r.paymentId),
      templateId: isPopulated
        ? String((template as { _id?: mongoose.Types.ObjectId })._id ?? "")
        : String(template ?? ""),
      templateName: isPopulated
        ? (template as { name?: string }).name ?? null
        : null,
      userDesignId: r.userDesignId ?? null,
      issuedAt: r.issuedAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
    };
  });
}

export type InitPaymentResult = {
  reference: string;
  accessCode: string | null;
  authorizationUrl: string | null;
  amountKobo: number;
  amountNgn: number;
  currency: "NGN";
  publicKey: string;
};

/**
 * Create a `pending` Payment row and return everything the client needs to
 * open the Paystack popup.
 *
 * Idempotency: we reuse a pending row that's < 30 minutes old for the same
 * (user, template, userDesign) tuple. This stops a user double-clicking
 * "Download" from spawning two payments.
 */
export async function initializePayment(opts: {
  userId: string;
  email: string;
  templateId: string;
  userDesignId: string | null;
  callbackUrl?: string | null;
}): Promise<InitPaymentResult> {
  await connectDb();
  if (!mongoose.Types.ObjectId.isValid(opts.templateId)) {
    throw new AppError("VALIDATION_ERROR", "Invalid template id", 422);
  }
  const publicKey = env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;
  if (!publicKey) {
    throw new AppError(
      "PAYMENT_NOT_CONFIGURED",
      "Payments are not configured on this server",
      503
    );
  }

  const userObjectId = new mongoose.Types.ObjectId(opts.userId);
  const templateObjectId = new mongoose.Types.ObjectId(opts.templateId);
  const now = new Date();

  await expireStalePaymentAttempts(now);

  const existing = await Payment.findOne({
    userId: userObjectId,
    templateId: templateObjectId,
    userDesignId: opts.userDesignId ?? null,
    status: { $in: PAYSTACK_ACTIVE_STATUSES },
    $or: [
      { expiresAt: { $gt: now } },
      {
        expiresAt: null,
        initializedAt: {
          $gt: new Date(now.getTime() - ATTEMPT_EXPIRY_MINUTES * 60 * 1000),
        },
      },
    ],
  })
    .sort({ initializedAt: -1 })
    .lean();

  const quote = quoteDownloadPrice();

  if (existing) {
    if (!existing.paystackAccessCode) {
      await Payment.updateOne(
        { _id: existing._id },
        {
          $set: {
            status: "expired",
            expiredAt: now,
            failureReason:
              "Legacy payment attempt could not be resumed without Paystack access code",
          },
          $push: {
            statusHistory: {
              status: "expired",
              source: "system",
              message:
                "Legacy payment attempt could not be resumed without Paystack access code",
              at: now,
            },
          },
        }
      );
    } else {
      return {
        reference: existing.paystackReference,
        accessCode: existing.paystackAccessCode,
        authorizationUrl: existing.paystackAuthorizationUrl ?? null,
        amountKobo: existing.amountKobo,
        amountNgn: existing.amountKobo / 100,
        currency: "NGN",
        publicKey,
      };
    }
  }

  const reference = generatePaystackReference();
  const paystack = await initializePaystackTransaction({
    email: opts.email,
    amountKobo: quote.amountKobo,
    reference,
    callbackUrl: opts.callbackUrl,
    metadata: {
      userId: opts.userId,
      templateId: opts.templateId,
      userDesignId: opts.userDesignId,
    },
  });
  await Payment.create({
    userId: userObjectId,
    templateId: templateObjectId,
    userDesignId: opts.userDesignId ?? null,
    amountKobo: quote.amountKobo,
    currency: "NGN",
    paystackReference: reference,
    paystackAccessCode: paystack.accessCode,
    paystackAuthorizationUrl: paystack.authorizationUrl,
    status: "pending",
    initializedAt: now,
    expiresAt: attemptExpiresAt(now),
    statusHistory: [
      {
        status: "pending",
        source: "init",
        message: "Payment attempt initialized",
        at: now,
      },
    ],
  });

  return {
    reference,
    accessCode: paystack.accessCode,
    authorizationUrl: paystack.authorizationUrl,
    amountKobo: quote.amountKobo,
    amountNgn: quote.amountNgn,
    currency: "NGN",
    publicKey,
  };
}

export type ConfirmedPayment = {
  payment: PaymentDoc;
  grant: DownloadGrantDoc;
};

export type PaymentResumeTarget = {
  templateId: string;
  userDesignId: string | null;
  status: PaymentStatus;
};

export async function getPaymentResumeTarget(
  reference: string
): Promise<PaymentResumeTarget | null> {
  await connectDb();
  const payment = await Payment.findOne({ paystackReference: reference })
    .select("templateId userDesignId status")
    .lean();

  if (!payment) return null;
  return {
    templateId: String(payment.templateId),
    userDesignId: payment.userDesignId ?? null,
    status: payment.status,
  };
}

/**
 * Confirm a payment by reference. Pulls the truth from Paystack, updates the
 * Payment row, and issues a DownloadGrant if successful.
 *
 * Idempotency: safe to call multiple times for the same reference. Re-runs
 * either return the existing success row or correct an out-of-date status.
 * Callers (popup-callback handler AND webhook) MUST handle the case where
 * another caller wins the race - we use Mongo's unique reference index to
 * make that race serialised.
 */
export async function confirmPaymentByReference(
  reference: string,
  options: { source?: "verify" | "webhook" | "system" } = {}
): Promise<ConfirmedPayment> {
  await connectDb();
  const source = options.source ?? "verify";

  const payment = await Payment.findOne({ paystackReference: reference });
  if (!payment) {
    throw new AppError(
      "PAYMENT_NOT_FOUND",
      "No matching payment for the provided reference",
      404
    );
  }

  // Already finalized - return the existing grant. Every other status remains
  // retryable because Paystack can still be the source of truth later.
  if (payment.status === "success") {
    const grant = await DownloadGrant.findOne({ paymentId: payment._id });
    if (!grant) {
      // Recoverable: the verify happened but the grant write failed
      // (extremely rare). Re-issue the grant idempotently.
      const reissued = await issueGrantForPayment(payment);
      return { payment, grant: reissued };
    }
    return { payment, grant };
  }

  let result: Awaited<ReturnType<typeof verifyPaystackTransaction>>;
  try {
    result = await verifyPaystackTransaction(reference);
  } catch (err) {
    if (err instanceof AppError && err.code === "PAYMENT_VERIFY_FAILED") {
      payment.status = "timeout";
      payment.timedOutAt = new Date();
      payment.lastVerifiedAt = new Date();
      payment.failureReason = err.message;
      appendStatusHistory(payment, {
        status: "timeout",
        source,
        message: err.message,
        paystackStatus: null,
      });
      await payment.save();
    }
    throw err;
  }

  const paystackStatus = result.status;
  const nextStatus = localStatusFromPaystack(paystackStatus);
  payment.lastVerifiedAt = new Date();
  payment.paystackStatus = paystackStatus;

  if (nextStatus !== "success") {
    payment.status = nextStatus;
    if (PAYSTACK_FINAL_FAILURE_STATUSES.includes(nextStatus)) {
      payment.failedAt = new Date();
    }
    if (nextStatus === "timeout") payment.timedOutAt = new Date();
    payment.failureReason = `Paystack reported '${paystackStatus}'`;
    payment.providerResponse = result.raw;
    appendStatusHistory(payment, {
      status: nextStatus,
      source,
      message: payment.failureReason,
      paystackStatus,
    });
    await payment.save();
    throw new AppError(
      "PAYMENT_NOT_SUCCESSFUL",
      `Payment was not successful (${paystackStatus})`,
      402,
      { paystackStatus }
    );
  }

  // Sanity check the amount. Paystack returns amount in kobo too. If the
  // user somehow paid less than expected (shouldn't be possible via the
  // popup flow but webhooks can carry surprises), refuse to issue the grant.
  if (result.amount < payment.amountKobo) {
    payment.status = "failed";
    payment.failedAt = new Date();
    payment.paystackStatus = result.status;
    payment.lastVerifiedAt = new Date();
    payment.failureReason = `Paid amount ${result.amount} below expected ${payment.amountKobo}`;
    payment.providerResponse = result.raw;
    appendStatusHistory(payment, {
      status: "failed",
      source,
      message: payment.failureReason,
      paystackStatus: result.status,
    });
    await payment.save();
    throw new AppError(
      "PAYMENT_AMOUNT_MISMATCH",
      "Paid amount is below the expected price",
      402
    );
  }

  payment.status = "success";
  payment.paidAt = result.paidAt ? new Date(result.paidAt) : new Date();
  payment.paystackStatus = result.status;
  payment.lastVerifiedAt = new Date();
  payment.providerResponse = result.raw;
  payment.failureReason = null;
  appendStatusHistory(payment, {
    status: "success",
    source,
    message: "Paystack verified successful payment",
    paystackStatus: result.status,
  });
  await payment.save();

  const grant = await issueGrantForPayment(payment);

  // Receipt email - fire-and-forget, never throws. We look up the user and
  // template here (and not at the route layer) so both the popup-callback
  // verify and the webhook path send the receipt without duplicating logic.
  // Idempotency: confirmPaymentByReference returns early on already-success
  // payments, so the receipt only sends once per payment.
  void sendReceiptForPayment(payment).catch((err) => {
    console.error("[payment] receipt dispatch failed", err);
  });

  return { payment, grant };
}

export type PaystackWebhookConfirmation = {
  reference: string;
  status: string;
  amount: number;
  currency: string;
  paidAt?: string | null;
  raw: unknown;
};

/**
 * Confirm a payment from a webhook payload after the route has validated the
 * Paystack signature. This avoids a second Paystack verify call in the webhook
 * path, which lets bank-transfer completions issue download grants with lower
 * latency.
 */
export async function confirmPaymentFromPaystackWebhook(
  input: PaystackWebhookConfirmation
): Promise<ConfirmedPayment> {
  await connectDb();

  const payment = await Payment.findOne({ paystackReference: input.reference });
  if (!payment) {
    throw new AppError(
      "PAYMENT_NOT_FOUND",
      "No matching payment for the provided reference",
      404
    );
  }

  if (payment.status === "success") {
    const grant = await DownloadGrant.findOne({ paymentId: payment._id });
    if (!grant) {
      const reissued = await issueGrantForPayment(payment);
      return { payment, grant: reissued };
    }
    return { payment, grant };
  }

  const paystackStatus = input.status || "success";
  const nextStatus = localStatusFromPaystack(paystackStatus);
  const now = new Date();
  payment.lastVerifiedAt = now;
  payment.paystackStatus = paystackStatus;
  payment.providerResponse = input.raw;

  if (nextStatus !== "success") {
    payment.status = nextStatus;
    if (PAYSTACK_FINAL_FAILURE_STATUSES.includes(nextStatus)) {
      payment.failedAt = now;
    }
    if (nextStatus === "timeout") payment.timedOutAt = now;
    payment.failureReason = `Paystack webhook reported '${paystackStatus}'`;
    appendStatusHistory(payment, {
      status: nextStatus,
      source: "webhook",
      message: payment.failureReason,
      paystackStatus,
      at: now,
    });
    await payment.save();
    throw new AppError(
      "PAYMENT_NOT_SUCCESSFUL",
      `Payment was not successful (${paystackStatus})`,
      402,
      { paystackStatus }
    );
  }

  if (input.amount < payment.amountKobo) {
    payment.status = "failed";
    payment.failedAt = now;
    payment.failureReason = `Paid amount ${input.amount} below expected ${payment.amountKobo}`;
    appendStatusHistory(payment, {
      status: "failed",
      source: "webhook",
      message: payment.failureReason,
      paystackStatus,
      at: now,
    });
    await payment.save();
    throw new AppError(
      "PAYMENT_AMOUNT_MISMATCH",
      "Paid amount is below the expected price",
      402
    );
  }

  if (input.currency.toUpperCase() !== payment.currency.toUpperCase()) {
    payment.status = "failed";
    payment.failedAt = now;
    payment.failureReason = `Paid currency ${input.currency} did not match expected ${payment.currency}`;
    appendStatusHistory(payment, {
      status: "failed",
      source: "webhook",
      message: payment.failureReason,
      paystackStatus,
      at: now,
    });
    await payment.save();
    throw new AppError(
      "PAYMENT_CURRENCY_MISMATCH",
      "Paid currency does not match the expected currency",
      402
    );
  }

  payment.status = "success";
  payment.paidAt = dateFromPaystack(input.paidAt);
  payment.failureReason = null;
  appendStatusHistory(payment, {
    status: "success",
    source: "webhook",
    message: "Paystack webhook confirmed successful payment",
    paystackStatus,
    at: now,
  });
  await payment.save();

  const grant = await issueGrantForPayment(payment);
  void sendReceiptForPayment(payment).catch((err) => {
    console.error("[payment] receipt dispatch failed", err);
  });

  return { payment, grant };
}

export async function markPaymentCancelledByReference(input: {
  reference: string;
  userId: string;
}): Promise<void> {
  await connectDb();
  const payment = await Payment.findOne({ paystackReference: input.reference });
  if (!payment) return;
  if (String(payment.userId) !== input.userId) {
    throw new AppError("FORBIDDEN", "This payment belongs to a different user", 403);
  }
  if (payment.status === "success") return;

  payment.status = "cancelled";
  payment.cancelledAt = new Date();
  payment.failureReason = "Customer cancelled the Paystack popup";
  appendStatusHistory(payment, {
    status: "cancelled",
    source: "popup",
    message: payment.failureReason,
    paystackStatus: payment.paystackStatus ?? null,
  });
  await payment.save();
}

export async function expireStalePaymentAttempts(now = new Date()): Promise<number> {
  await connectDb();
  const legacyCutoff = new Date(
    now.getTime() - ATTEMPT_EXPIRY_MINUTES * 60 * 1000
  );
  const res = await Payment.updateMany(
    {
      status: { $in: PAYSTACK_ACTIVE_STATUSES },
      $or: [
        { expiresAt: { $lt: now } },
        { expiresAt: null, initializedAt: { $lt: legacyCutoff } },
      ],
    },
    {
      $set: {
        status: "expired",
        expiredAt: now,
        failureReason: "Payment attempt expired before successful verification",
      },
      $push: {
        statusHistory: {
          status: "expired",
          source: "system",
          message: "Payment attempt expired before successful verification",
          at: now,
        },
      },
    }
  );
  return res.modifiedCount;
}

export async function reconcileRecentPaymentAttempts(
  now = new Date(),
  options: { limit?: number } = {}
): Promise<{ checked: number; corrected: number; expired: number }> {
  await connectDb();

  if (!env.PAYSTACK_SECRET_KEY) {
    return {
      checked: 0,
      corrected: 0,
      expired: await expireStalePaymentAttempts(now),
    };
  }

  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
  const lookback = new Date(
    now.getTime() - RECONCILE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  );
  const verifyCutoff = new Date(
    now.getTime() - RECONCILE_THROTTLE_MINUTES * 60 * 1000
  );

  const candidates = await Payment.find({
    status: { $in: PAYSTACK_RECONCILE_STATUSES },
    createdAt: { $gte: lookback },
    $or: [
      { lastVerifiedAt: null },
      { lastVerifiedAt: { $lt: verifyCutoff } },
    ],
  })
    .select("_id paystackReference status")
    .sort({ lastVerifiedAt: 1, createdAt: -1 })
    .limit(limit)
    .lean();

  let checked = 0;
  let corrected = 0;

  for (const candidate of candidates) {
    checked += 1;
    try {
      const { payment } = await confirmPaymentByReference(
        candidate.paystackReference,
        { source: "system" }
      );
      if (payment.status === "success" && candidate.status !== "success") {
        corrected += 1;
      }
    } catch (err) {
      if (
        err instanceof AppError &&
        (err.code === "PAYMENT_NOT_SUCCESSFUL" ||
          err.code === "PAYMENT_VERIFY_FAILED" ||
          err.code === "PAYMENT_NOT_FOUND")
      ) {
        continue;
      }
      console.error("[payment] reconcile failed", {
        reference: candidate.paystackReference,
        err,
      });
    }
  }

  return {
    checked,
    corrected,
    expired: await expireStalePaymentAttempts(now),
  };
}

async function sendReceiptForPayment(payment: PaymentDoc): Promise<void> {
  const [user, template] = await Promise.all([
    User.findById(payment.userId).lean(),
    Template.findById(payment.templateId).select("name").lean(),
  ]);
  if (!user?.email) return;
  await sendReceiptEmail({
    email: user.email,
    name: user.name ?? user.email.split("@")[0] ?? "there",
    templateName: template?.name ?? "your design",
    amountNgn: payment.amountKobo / 100,
    paystackReference: payment.paystackReference,
    paidAt: payment.paidAt ?? new Date(),
  });
}

async function issueGrantForPayment(
  payment: PaymentDoc
): Promise<DownloadGrantDoc> {
  // upsert by paymentId so a double-confirm doesn't double-grant.
  const expiresAt = new Date(
    Date.now() + GRANT_EXPIRY_HOURS * 60 * 60 * 1000
  );
  const result = await DownloadGrant.findOneAndUpdate(
    { paymentId: payment._id },
    {
      $setOnInsert: {
        paymentId: payment._id,
        userId: payment.userId,
        templateId: payment.templateId,
        userDesignId: payment.userDesignId,
        issuedAt: new Date(),
      },
      $set: { expiresAt },
    },
    { upsert: true, new: true }
  );
  if (!result) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Failed to issue download grant",
      500
    );
  }
  return result;
}

/**
 * Authoritative check the download endpoint runs before allowing the file to
 * be served. Returns the active (unconsumed) grant or throws PAYMENT_REQUIRED.
 */
export async function requireActiveGrant(opts: {
  userId: string;
  templateId: string;
  userDesignId: string | null;
}): Promise<DownloadGrantDoc> {
  await connectDb();
  const grant = await DownloadGrant.findOne({
    userId: new mongoose.Types.ObjectId(opts.userId),
    templateId: new mongoose.Types.ObjectId(opts.templateId),
    userDesignId: opts.userDesignId ?? null,
    consumedAt: null,
    expiresAt: { $gt: new Date() },
  }).sort({ expiresAt: -1 });

  if (!grant) {
    throw new AppError(
      "PAYMENT_REQUIRED",
      "An active payment is required to download this design",
      402
    );
  }
  return grant;
}

/**
 * Consume a grant: marks it `consumedAt`, increments analytics counters,
 * appends a DownloadEvent. Atomic on the grant doc via `findOneAndUpdate`
 * with `consumedAt: null` filter - if two requests race, only one wins;
 * the loser sees a 404 and the client can ignore (the file already shipped).
 */
export async function recordDownload(opts: {
  grantId: string;
  scale: number | null;
}): Promise<void> {
  await connectDb();
  const grant = await DownloadGrant.findOneAndUpdate(
    { _id: opts.grantId, consumedAt: null },
    {
      $inc: { downloadsUsed: 1 },
      $set: {
        lastDownloadAt: new Date(),
        consumedAt: new Date(),
      },
    },
    { new: true }
  );
  if (!grant) {
    // Either the grant id is wrong OR another request already consumed it.
    // The latter is a normal race condition; treat as success rather than
    // letting the user think their download didn't register.
    return;
  }
  await DownloadEvent.create({
    userId: grant.userId,
    templateId: grant.templateId,
    userDesignId: grant.userDesignId ?? null,
    grantId: grant._id,
    paymentId: grant.paymentId,
    scale: opts.scale ?? null,
    occurredAt: new Date(),
  });
}
