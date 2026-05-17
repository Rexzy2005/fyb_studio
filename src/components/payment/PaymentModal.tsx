"use client";

import { useEffect, useRef, useState } from "react";
import { GraduationCap, ShieldCheck, Zap } from "lucide-react";

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
  onPaid: () => void | Promise<void>;
  onClose: () => void;
};

type Stage =
  | { kind: "idle" }
  | { kind: "initializing" }
  | { kind: "popup" }
  | { kind: "verifying" }
  | { kind: "error"; message: string };

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
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setStage({ kind: "idle" });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const submitting =
    stage.kind === "initializing" ||
    stage.kind === "popup" ||
    stage.kind === "verifying";

  const btnLabel =
    stage.kind === "initializing"
      ? "Preparing…"
      : stage.kind === "popup"
        ? "Waiting for payment…"
        : stage.kind === "verifying"
          ? "Confirming…"
          : `Pay ₦${(priceNgn ?? 1000).toLocaleString()}`;

  async function startPayment() {
    if (!customerEmail) {
      setStage({
        kind: "error",
        message: "No email found on your account. Sign out and back in, then retry.",
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
        onSuccess: () => {},
        onCancel: () => {},
      });

      setStage({ kind: "verifying" });
      const verifyResult = await verifyPayment(reference);
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
        err instanceof Error ? err.message : "Payment could not be completed. Please try again.";
      if (message === "Payment was cancelled") {
        setStage({ kind: "idle" });
        return;
      }
      setStage({ kind: "error", message });
    }
  }

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Payment"
      onMouseDown={(e) => {
        if (e.target === backdropRef.current && !submitting) onClose();
      }}
      style={{ background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)" }}
    >
      <div
        className="relative w-full overflow-hidden sm:max-w-[420px]"
        style={{
          background: "var(--canvas)",
          border: "1px solid var(--hairline)",
          borderRadius: "28px 28px 0 0",
          boxShadow: "0 -8px 64px rgba(0,0,0,0.55)",
        }}
        // slide up on mobile
      >
        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="h-1 w-10 rounded-full" style={{ background: "var(--hairline)" }} />
        </div>

        {/* Header */}
        <div className="flex items-start gap-4 px-5 pt-5 pb-4">
          <div
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl"
            style={{ background: "rgba(255,215,0,0.12)", color: "#FFD700" }}
          >
            <GraduationCap size={22} strokeWidth={1.8} />
          </div>
          <div className="min-w-0">
            <div
              className="text-base font-semibold leading-snug"
              style={{ color: "var(--ink)", letterSpacing: "-0.02em" }}
            >
              Download your design
            </div>
            <div className="mt-1 text-sm" style={{ color: "var(--ink-muted)" }}>
              <span
                className="font-medium"
                style={{ color: "var(--ink)" }}
              >
                {templateName}
              </span>{" "}
              · one-time unlock
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "var(--hairline-soft)" }} />

        {/* Price callout */}
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <div className="text-xs font-medium" style={{ color: "var(--ink-faint)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              One-off payment
            </div>
            <div
              className="mt-1 text-3xl font-bold tabular-nums"
              style={{ color: "var(--ink)", letterSpacing: "-0.03em" }}
            >
              ₦{(priceNgn ?? 1000).toLocaleString()}
            </div>
          </div>
          <div
            className="flex flex-col items-end gap-1.5 text-right text-xs"
            style={{ color: "var(--ink-muted)" }}
          >
            <span className="flex items-center gap-1.5">
              <Zap size={11} className="text-[#FFD700]" />
              Re-downloads free for 24 h
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck size={11} style={{ color: "#FFD700" }} />
              Secured by Paystack
            </span>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "var(--hairline-soft)" }} />

        {/* Body */}
        <div className="px-5 py-4">
          {stage.kind === "error" ? (
            <div
              className="mb-4 rounded-xl px-3 py-2.5 text-sm"
              style={{
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.25)",
                color: "var(--semantic-danger)",
              }}
            >
              {stage.message}
            </div>
          ) : null}

          {/* Progress dots when paying */}
          {submitting ? (
            <div
              className="mb-4 flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--hairline)",
                color: "var(--ink-muted)",
              }}
            >
              <span className="fyb-dots">
                <span />
                <span />
                <span />
              </span>
              {stage.kind === "initializing"
                ? "Opening payment…"
                : stage.kind === "popup"
                  ? "Waiting for Paystack…"
                  : "Confirming payment…"}
            </div>
          ) : null}

          <div
            className="flex flex-col gap-2 sm:flex-row-reverse"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <button
              type="button"
              onClick={startPayment}
              disabled={submitting}
              className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl text-sm font-semibold transition active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                background: submitting ? "var(--surface-2)" : "#FFD700",
                color: "#000",
              }}
            >
              {btnLabel}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="inline-flex h-12 flex-1 items-center justify-center rounded-2xl border text-sm font-medium transition disabled:opacity-50"
              style={{
                background: "transparent",
                borderColor: "var(--hairline)",
                color: "var(--ink-muted)",
              }}
            >
              Not now
            </button>
          </div>

          <p
            className="mt-3 text-center text-xs"
            style={{ color: "var(--ink-faint)" }}
          >
            Receipt emailed after payment. Card details never shared with us.
          </p>
        </div>
      </div>
    </div>
  );
}
