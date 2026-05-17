"use client";

import { useEffect, useRef, useState } from "react";
import { GraduationCap, ShieldCheck, Zap, X } from "lucide-react";

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

        {/* Close button — top-right */}
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
          {/* Eyebrow + header */}
          <div className="px-5 pt-5 pb-3 sm:px-6 sm:pt-6">
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span
                style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  width: 22, height: 22,
                  borderRadius: 7,
                  background: "rgba(255,215,0,0.12)",
                  color: "#FFD700",
                  border: "1px solid rgba(255,215,0,0.28)",
                }}
              >
                <GraduationCap size={13} strokeWidth={2} />
              </span>
              <span
                style={{
                  fontFamily: FONT_MONO, fontSize: 9, letterSpacing: "0.26em",
                  color: "rgba(255,215,0,0.8)", textTransform: "uppercase", fontWeight: 700,
                }}
              >
                Unlock download
              </span>
            </div>

            <h2
              style={{
                fontFamily: FONT_JKT, fontWeight: 800,
                fontSize: "clamp(22px, 4.8vw, 28px)",
                color: "#fff", letterSpacing: "-0.025em",
                lineHeight: 1.15, margin: 0,
              }}
            >
              Download your design
            </h2>
            <p
              style={{
                fontFamily: FONT_SANS, fontSize: 13.5, lineHeight: 1.55,
                color: "rgba(255,255,255,0.5)",
                marginTop: 6,
              }}
            >
              <span style={{ color: "rgba(255,255,255,0.85)", fontWeight: 500 }}>{templateName}</span>
              {" "}· one-time unlock · re-download free for 24 hours
            </p>
          </div>

          {/* Price card */}
          <div className="mx-5 mb-5 sm:mx-6">
            <div
              style={{
                position: "relative",
                borderRadius: 18,
                padding: "20px 22px",
                background:
                  "linear-gradient(140deg, rgba(255,215,0,0.16), rgba(255,140,66,0.06))",
                border: "1px solid rgba(255,215,0,0.32)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06), 0 8px 22px rgba(255,180,0,0.12)",
                overflow: "hidden",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: FONT_MONO, fontSize: 9, letterSpacing: "0.22em",
                      color: "rgba(255,215,0,0.7)", textTransform: "uppercase",
                      fontWeight: 700,
                    }}
                  >
                    One-off payment
                  </div>
                  <div
                    style={{
                      fontFamily: FONT_JKT,
                      fontSize: "clamp(36px, 8vw, 44px)",
                      fontWeight: 900,
                      letterSpacing: "-0.04em",
                      lineHeight: 1,
                      marginTop: 6,
                      color: "#fff",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    ₦{(priceNgn ?? 1000).toLocaleString()}
                  </div>
                  <div
                    style={{
                      fontFamily: FONT_SANS, fontSize: 11.5,
                      color: "rgba(255,255,255,0.5)", marginTop: 8,
                    }}
                  >
                    Print-ready PNG · personal use
                  </div>
                </div>
                <div
                  aria-hidden
                  style={{
                    flexShrink: 0,
                    display: "grid", placeItems: "center",
                    width: 56, height: 56,
                    borderRadius: "50%",
                    background: "radial-gradient(circle at 30% 30%, #FFD700, #FFB400)",
                    color: "#0a0a0a",
                    boxShadow: "0 8px 22px rgba(255,180,0,0.45), inset 0 1px 0 rgba(255,255,255,0.35)",
                  }}
                >
                  <GraduationCap size={26} strokeWidth={1.8} />
                </div>
              </div>
            </div>
          </div>

          {/* Trust strip */}
          <div className="mx-5 mb-4 grid grid-cols-2 gap-2 sm:mx-6">
            <TrustChip icon={<Zap size={11} />} label="Re-downloads" sub="Free for 24 h" />
            <TrustChip icon={<ShieldCheck size={11} />} label="Secure" sub="Paystack" />
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

            {/* CTA stack — gap and button padding both bump up on mobile
                so the row feels less cramped against the modal edges and
                each tap target has comfortable breathing room. */}
            <div className="payment-cta-row flex flex-col gap-3 sm:flex-row-reverse sm:gap-2">
              <button
                type="button"
                onClick={startPayment}
                disabled={submitting}
                className="payment-cta-btn inline-flex flex-1 items-center justify-center rounded-2xl transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  background: submitting
                    ? "rgba(255,215,0,0.18)"
                    : "#FFD700",
                  color: submitting ? "rgba(255,255,255,0.7)" : "#000",
                  boxShadow: submitting
                    ? "none"
                    : "0 12px 30px rgba(255,180,0,0.4), inset 0 1px 0 rgba(255,255,255,0.25)",
                }}
              >
                {btnLabel}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="payment-cta-btn inline-flex flex-1 items-center justify-center rounded-2xl transition active:scale-95 disabled:opacity-50"
                style={{
                  fontFamily: FONT_MONO,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  background: "rgba(255,255,255,0.04)",
                  color: "rgba(255,255,255,0.7)",
                  border: "1px solid rgba(255,215,0,0.15)",
                }}
              >
                Not now
              </button>
            </div>
            {/* Mobile padding — taller tap targets + roomier h-padding.
                Desktop keeps the tighter 52px height we had before. */}
            <style>{`
              .payment-cta-btn {
                height: 58px;
                padding: 0 28px;
              }
              @media (min-width: 640px) {
                .payment-cta-btn {
                  height: 52px;
                  padding: 0 22px;
                }
              }
            `}</style>

            <p
              style={{
                marginTop: 14, textAlign: "center",
                fontFamily: FONT_MONO, fontSize: 9, letterSpacing: "0.18em",
                color: "rgba(255,255,255,0.32)", textTransform: "uppercase",
              }}
            >
              Receipt emailed · Card details never shared
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function TrustChip({
  icon, label, sub,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
}) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 12px",
        borderRadius: 12,
        background: "rgba(255,255,255,0.025)",
        border: "1px solid rgba(255,215,0,0.14)",
      }}
    >
      <span
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 22, height: 22, borderRadius: 6,
          background: "rgba(255,215,0,0.12)",
          color: "#FFD700",
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span
          style={{
            fontFamily: FONT_MONO, fontSize: 8.5, letterSpacing: "0.18em",
            color: "rgba(255,215,0,0.65)", textTransform: "uppercase", fontWeight: 700,
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontFamily: FONT_SANS, fontSize: 11.5,
            color: "rgba(255,255,255,0.7)", marginTop: 1,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}
        >
          {sub}
        </span>
      </div>
    </div>
  );
}
