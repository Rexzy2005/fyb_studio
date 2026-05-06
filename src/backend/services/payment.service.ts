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
} from "@/backend/db/models";
import { sendReceiptEmail } from "@/backend/email/send-receipt";
import { env } from "@/backend/env";
import { AppError } from "@/backend/errors/app-error";
import {
  generatePaystackReference,
  verifyPaystackTransaction,
} from "./paystack.service";

const PRICE_NGN = env.PAYMENT_DOWNLOAD_PRICE_NGN;
const GRANT_EXPIRY_HOURS = env.PAYMENT_GRANT_EXPIRY_HOURS;

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
 * All active grants for a user — used by the dashboard to surface "you've
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
  templateId: string;
  userDesignId: string | null;
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
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

  const existing = await Payment.findOne({
    userId: userObjectId,
    templateId: templateObjectId,
    userDesignId: opts.userDesignId ?? null,
    status: "pending",
    initializedAt: { $gt: thirtyMinutesAgo },
  })
    .sort({ initializedAt: -1 })
    .lean();

  const quote = quoteDownloadPrice();

  if (existing) {
    return {
      reference: existing.paystackReference,
      amountKobo: existing.amountKobo,
      amountNgn: existing.amountKobo / 100,
      currency: "NGN",
      publicKey,
    };
  }

  const reference = generatePaystackReference();
  await Payment.create({
    userId: userObjectId,
    templateId: templateObjectId,
    userDesignId: opts.userDesignId ?? null,
    amountKobo: quote.amountKobo,
    currency: "NGN",
    paystackReference: reference,
    status: "pending",
  });

  return {
    reference,
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

/**
 * Confirm a payment by reference. Pulls the truth from Paystack, updates the
 * Payment row, and issues a DownloadGrant if successful.
 *
 * Idempotency: safe to call multiple times for the same reference. Re-runs
 * either return the existing success row or correct an out-of-date status.
 * Callers (popup-callback handler AND webhook) MUST handle the case where
 * another caller wins the race — we use Mongo's unique reference index to
 * make that race serialised.
 */
export async function confirmPaymentByReference(
  reference: string
): Promise<ConfirmedPayment> {
  await connectDb();

  const payment = await Payment.findOne({ paystackReference: reference });
  if (!payment) {
    throw new AppError(
      "PAYMENT_NOT_FOUND",
      "No matching payment for the provided reference",
      404
    );
  }

  // Already finalized — return the existing grant (or refuse if it failed).
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
  if (payment.status === "failed" || payment.status === "abandoned") {
    throw new AppError(
      "PAYMENT_NOT_SUCCESSFUL",
      `Payment is in '${payment.status}' state and cannot be confirmed`,
      409
    );
  }

  const result = await verifyPaystackTransaction(reference);

  if (result.status !== "success") {
    payment.status = result.status === "abandoned" ? "abandoned" : "failed";
    payment.failedAt = new Date();
    payment.failureReason = `Paystack reported '${result.status}'`;
    payment.providerResponse = result.raw;
    await payment.save();
    throw new AppError(
      "PAYMENT_NOT_SUCCESSFUL",
      `Payment was not successful (${result.status})`,
      402,
      { paystackStatus: result.status }
    );
  }

  // Sanity check the amount. Paystack returns amount in kobo too. If the
  // user somehow paid less than expected (shouldn't be possible via the
  // popup flow but webhooks can carry surprises), refuse to issue the grant.
  if (result.amount < payment.amountKobo) {
    payment.status = "failed";
    payment.failedAt = new Date();
    payment.failureReason = `Paid amount ${result.amount} below expected ${payment.amountKobo}`;
    payment.providerResponse = result.raw;
    await payment.save();
    throw new AppError(
      "PAYMENT_AMOUNT_MISMATCH",
      "Paid amount is below the expected price",
      402
    );
  }

  payment.status = "success";
  payment.paidAt = result.paidAt ? new Date(result.paidAt) : new Date();
  payment.providerResponse = result.raw;
  await payment.save();

  const grant = await issueGrantForPayment(payment);

  // Receipt email — fire-and-forget, never throws. We look up the user and
  // template here (and not at the route layer) so both the popup-callback
  // verify and the webhook path send the receipt without duplicating logic.
  // Idempotency: confirmPaymentByReference returns early on already-success
  // payments, so the receipt only sends once per payment.
  void sendReceiptForPayment(payment).catch((err) => {
    console.error("[payment] receipt dispatch failed", err);
  });

  return { payment, grant };
}

async function sendReceiptForPayment(payment: PaymentDoc): Promise<void> {
  const [user, template] = await Promise.all([
    User.findById(payment.userId).lean(),
    Template.findById(payment.templateId).lean(),
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
 * with `consumedAt: null` filter — if two requests race, only one wins;
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
