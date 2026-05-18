"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldCheck, X } from "lucide-react";

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

const FONT_JKT = "var(--font-plus-jakarta, var(--font-geist-sans)), sans-serif";
const FONT_MONO = "var(--font-geist-mono), monospace";
const FONT_SANS = "var(--font-geist-sans), sans-serif";

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

  const submitting =
    stage.kind === "initializing" ||
    stage.kind === "popup" ||
    stage.kind === "verifying";

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, submitting, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

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
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Payment"
      onMouseDown={(e) => {
        if (e.target === backdropRef.current && !submitting) onClose();
      }}
      style={{
        background:
          "radial-gradient(ellipse 50% 40% at 50% 30%, rgba(255,180,0,0.12), rgba(0,0,0,0.7) 70%)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }}
    >
      <div
        className="relative w-full sm:max-w-[440px]"
        style={{
          background: "linear-gradient(180deg, rgba(20,16,4,0.98), rgba(8,8,8,0.98))",
          border: "1px solid rgba(255,215,0,0.22)",
          /* Bottom-sheet on mobile (square bottom), centred card with full
             radius on tablet+. We always round the top corners. */
          borderRadius: "24px 24px 0 0",
          boxShadow:
            "0 -10px 60px rgba(0,0,0,0.65), 0 0 80px rgba(255,180,0,0.08), inset 0 1px 0 rgba(255,255,255,0.04)",
          overflow: "hidden",
          maxHeight: "calc(100dvh - 8px)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Round the bottom corners only on desktop where the card floats. */}
        <style>{`
          @media (min-width: 640px) {
            .payment-card { border-radius: 24px !important; }
          }
        `}</style>
        <div className="payment-card" style={{ display: "contents" }} />

        {/* Gold top accent stripe */}
        <div
          aria-hidden
          style={{
            position: "absolute", top: 0, left: 0, right: 0, height: 2,
            background: "linear-gradient(90deg, transparent, #FFD700, transparent)",
            zIndex: 2,
          }}
        />

        {/* Drag handle (mobile only) */}
        <div className="flex justify-center pt-2.5 pb-1 sm:hidden">
          <div
            aria-hidden
            style={{ height: 4, width: 44, borderRadius: 999, background: "rgba(255,215,0,0.32)" }}
          />
        </div>

        {/* Close button - top-right */}
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          disabled={submitting}
          className="absolute inline-flex items-center justify-center rounded-full transition active:scale-90 disabled:opacity-50"
          style={{
            top: 12, right: 12,
            width: 32, height: 32,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,215,0,0.18)",
            color: "rgba(255,255,255,0.7)",
            zIndex: 3,
          }}
        >
          <X className="h-4 w-4" />
        </button>

        {/* Scrollable body so long content survives short viewports */}
        <div
          className="overflow-y-auto"
          style={{
            paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)",
          }}
        >
          {/* Checkout-style header: title + small eyebrow. */}
          <div className="px-5 pt-5 pb-4 sm:px-6 sm:pt-6">
            <div
              style={{
                fontFamily: FONT_MONO, fontSize: 9, letterSpacing: "0.28em",
                color: "rgba(255,215,0,0.7)", textTransform: "uppercase",
                fontWeight: 700, marginBottom: 10,
              }}
            >
              Checkout
            </div>
            <h2
              style={{
                fontFamily: FONT_JKT, fontWeight: 800,
                fontSize: "clamp(20px, 4.6vw, 24px)",
                color: "#fff", letterSpacing: "-0.025em",
                lineHeight: 1.15, margin: 0,
              }}
            >
              Download your design
            </h2>
          </div>

          {/* Order summary line + total - clean financial-document feel. */}
          <div className="mx-5 mb-5 sm:mx-6">
            <div
              style={{
                borderRadius: 14,
                border: "1px solid rgba(255,215,0,0.18)",
                background: "rgba(255,255,255,0.025)",
                overflow: "hidden",
              }}
            >
              {/* Item row */}
              <div
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  gap: 12, padding: "14px 16px",
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    className="truncate"
                    style={{
                      fontFamily: FONT_SANS, fontSize: 14, fontWeight: 600,
                      color: "#fff", letterSpacing: "-0.01em",
                    }}
                  >
                    {templateName}
                  </div>
                  <div
                    style={{
                      fontFamily: FONT_SANS, fontSize: 12, color: "rgba(255,255,255,0.5)",
                      marginTop: 2,
                    }}
                  >
                    Print-ready PNG · one-time unlock
                  </div>
                </div>
                <div
                  style={{
                    fontFamily: FONT_JKT, fontVariantNumeric: "tabular-nums",
                    fontSize: 16, fontWeight: 700, color: "rgba(255,255,255,0.85)",
                    letterSpacing: "-0.01em",
                  }}
                >
                  ₦{(priceNgn ?? 1000).toLocaleString()}
                </div>
              </div>

              {/* Total row */}
              <div
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  gap: 12, padding: "14px 16px",
                  borderTop: "1px dashed rgba(255,215,0,0.18)",
                  background: "linear-gradient(180deg, rgba(255,215,0,0.05), rgba(255,140,66,0.02))",
                }}
              >
                <span
                  style={{
                    fontFamily: FONT_MONO, fontSize: 10, letterSpacing: "0.24em",
                    color: "rgba(255,215,0,0.75)", textTransform: "uppercase", fontWeight: 700,
                  }}
                >
                  Total due
                </span>
                <span
                  style={{
                    fontFamily: FONT_JKT, fontWeight: 900,
                    fontSize: "clamp(26px, 6vw, 30px)",
                    letterSpacing: "-0.03em", lineHeight: 1,
                    color: "#fff", fontVariantNumeric: "tabular-nums",
                  }}
                >
                  ₦{(priceNgn ?? 1000).toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Status / error banners */}
          <div className="px-5 sm:px-6">
            {stage.kind === "error" ? (
              <div
                style={{
                  marginBottom: 12,
                  padding: "10px 14px", borderRadius: 12,
                  background: "rgba(239,68,68,0.10)",
                  border: "1px solid rgba(239,68,68,0.32)",
                  fontFamily: FONT_SANS, fontSize: 12.5,
                  color: "#fca5a5",
                }}
              >
                {stage.message}
              </div>
            ) : null}

            {submitting ? (
              <div
                style={{
                  marginBottom: 12,
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 14px", borderRadius: 12,
                  background: "rgba(255,215,0,0.08)",
                  border: "1px solid rgba(255,215,0,0.22)",
                  fontFamily: FONT_SANS, fontSize: 12.5,
                  color: "rgba(255,255,255,0.75)",
                }}
              >
                <span className="fyb-dots" aria-hidden>
                  <span /> <span /> <span />
                </span>
                {stage.kind === "initializing"
                  ? "Opening payment…"
                  : stage.kind === "popup"
                    ? "Waiting for Paystack…"
                    : "Confirming payment…"}
              </div>
            ) : null}

            {/* CTA row - side-by-side on every viewport. Pay (primary)
                sits on the right via flex-row-reverse so it lines up with
                the user's thumb on right-handed mobile use. */}
            <div className="mt-1 flex flex-row-reverse gap-2.5">
              <button
                type="button"
                onClick={startPayment}
                disabled={submitting}
                className="inline-flex flex-1 items-center justify-center rounded-2xl transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 h-[56px] px-4 sm:h-[50px] sm:px-5"
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  background: submitting
                    ? "rgba(255,215,0,0.18)"
                    : "#FFD700",
                  color: submitting ? "rgba(255,255,255,0.7)" : "#000",
                  boxShadow: submitting
                    ? "none"
                    : "0 12px 30px rgba(255,180,0,0.4), inset 0 1px 0 rgba(255,255,255,0.25)",
                  whiteSpace: "nowrap",
                }}
              >
                {btnLabel}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="inline-flex flex-1 items-center justify-center rounded-2xl transition active:scale-95 disabled:opacity-50 h-[56px] px-4 sm:h-[50px] sm:px-5"
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  background: "rgba(255,255,255,0.04)",
                  color: "rgba(255,255,255,0.7)",
                  border: "1px solid rgba(255,215,0,0.15)",
                  whiteSpace: "nowrap",
                }}
              >
                Not now
              </button>
            </div>

            {/* Trust line - small, single row, no clutter. */}
            <div
              style={{
                marginTop: 18,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                fontFamily: FONT_MONO, fontSize: 9.5, letterSpacing: "0.18em",
                color: "rgba(255,255,255,0.4)", textTransform: "uppercase", fontWeight: 700,
              }}
            >
              <ShieldCheck size={11} style={{ color: "#FFD700" }} />
              <span>Secured by Paystack</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

