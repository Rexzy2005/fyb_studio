"use client";

import { useEffect, useState } from "react";
import { Lock, ShieldCheck } from "lucide-react";

import {
  initializePayment,
  openPaystackPopup,
  verifyPayment,
} from "@/lib/api/payments";
import { recordPendingDownload } from "@/lib/payment/pendingDownloads";

type Props = {
  open: boolean;
  templateId: string;
  templateName: string;
  userDesignId: string | null;
  customerEmail: string | null;
  /** Called after server-side verify succeeds and a grant is issued. */
  onPaid: () => void | Promise<void>;
  onClose: () => void;
};

type Stage =
  | { kind: "idle" }
  | { kind: "initializing" }
  | { kind: "popup" }
  | { kind: "verifying" }
  | { kind: "error"; message: string };

/**
 * Payment modal. Renders a simple summary + "Pay ₦X" button. On click:
 *   1. POST /api/payments/init  → reference, kobo amount, public key
 *   2. open Paystack popup with those values
 *   3. on popup success → POST /api/payments/verify (server-side)
 *   4. fire onPaid() so the editor can resume the download
 *
 * Failures are surfaced inline; the user can retry without re-typing
 * anything. Cancellation closes the modal silently — payments left in
 * `pending` are reused on the next attempt by the init endpoint, so a
 * cancelled popup doesn't create churn.
 */
export function PaymentModal({
  open,
  templateId,
  templateName,
  userDesignId,
  customerEmail,
  onPaid,
  onClose,
}: Props) {
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [priceNgn, setPriceNgn] = useState<number | null>(null);

  // Reset stage every time the modal opens so a previous error doesn't
  // bleed into the next attempt.
  useEffect(() => {
    if (open) {
      setStage({ kind: "idle" });
    }
  }, [open]);

  if (!open) return null;

  async function startPayment() {
    if (!customerEmail) {
      setStage({
        kind: "error",
        message:
          "We couldn't find an email on your account. Sign in again and retry.",
      });
      return;
    }

    setStage({ kind: "initializing" });
    try {
      const init = await initializePayment({ templateId, userDesignId });
      setPriceNgn(init.amountNgn);
      setStage({ kind: "popup" });

      const reference = await openPaystackPopup({
        publicKey: init.publicKey,
        reference: init.reference,
        amountKobo: init.amountKobo,
        email: customerEmail,
        onSuccess: () => {
          // handled in resolved promise
        },
        onCancel: () => {
          // handled in rejected promise
        },
      });

      setStage({ kind: "verifying" });
      const verifyResult = await verifyPayment(reference);
      // Persist a local "I paid for this" marker BEFORE running the export.
      // If the export blows up (network drop, refresh, render error), the
      // dashboard can still surface this entry so the user finishes their
      // download — the server grant is also there as the source of truth.
      recordPendingDownload({
        reference: verifyResult.grant.paystackReference,
        templateId: verifyResult.grant.templateId,
        templateName,
        userDesignId: verifyResult.grant.userDesignId,
        paidAt: Date.now(),
      });
      await onPaid();
      onClose();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Payment could not be completed. Please try again.";
      // "Payment was cancelled" is a normal user action — close quietly
      // rather than scaring them with a red error banner.
      if (message === "Payment was cancelled") {
        setStage({ kind: "idle" });
        return;
      }
      setStage({ kind: "error", message });
    }
  }

  const submitting =
    stage.kind === "initializing" ||
    stage.kind === "popup" ||
    stage.kind === "verifying";
  const submitLabel =
    stage.kind === "initializing"
      ? "Preparing…"
      : stage.kind === "popup"
        ? "Waiting for payment…"
        : stage.kind === "verifying"
          ? "Verifying…"
          : `Pay ₦${(priceNgn ?? 1000).toLocaleString()} to download`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Confirm payment"
      onMouseDown={(e) => {
        if (e.currentTarget === e.target && !submitting) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-start gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
            <Lock className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">
              Unlock download
            </div>
            <div className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              You&apos;re about to download{" "}
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                {templateName}
              </span>
              . A one-off payment of <span className="font-semibold">₦1,000</span>{" "}
              unlocks this design — re-downloads of the same design are free for
              the next 24 hours.
            </div>
          </div>
        </div>

        <div className="px-5 py-4">
          <ul className="space-y-2 text-sm text-zinc-700 dark:text-zinc-300">
            <li className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              Secure payment processed by Paystack — we never see your card details.
            </li>
            <li className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
              A receipt is emailed to you once payment succeeds.
            </li>
          </ul>

          {stage.kind === "error" ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
              {stage.message}
            </div>
          ) : null}

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-900 shadow-xs transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              Not now
            </button>
            <button
              type="button"
              onClick={startPayment}
              disabled={submitting}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white shadow-xs transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-500"
            >
              {submitLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
