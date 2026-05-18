"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";

import {
  FEEDBACK_CATEGORY_KEYS,
  FEEDBACK_CATEGORY_LABELS,
  type FeedbackCategoryKey,
  type FeedbackSource,
  submitFeedback,
} from "@/lib/api/feedback";

const RATING_EMOJIS: Array<{
  value: 1 | 2 | 3 | 4 | 5;
  emoji: string;
  label: string;
}> = [
  { value: 1, emoji: "😞", label: "Rough" },
  { value: 2, emoji: "😕", label: "Meh" },
  { value: 3, emoji: "😐", label: "Okay" },
  { value: 4, emoji: "🙂", label: "Good" },
  { value: 5, emoji: "🤩", label: "Love it" },
];

const FONT_JKT = "var(--font-plus-jakarta, var(--font-geist-sans)), sans-serif";
const FONT_MONO = "var(--font-geist-mono), monospace";
const FONT_SANS = "var(--font-geist-sans), sans-serif";

type Props = {
  open: boolean;
  source: FeedbackSource;
  context?: {
    page?: string;
    templateId?: string;
    userDesignId?: string;
  };
  onClose: () => void;
  onSubmitted?: () => void;
};

type Stage =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string };

export function FeedbackModal({
  open,
  source,
  context,
  onClose,
  onSubmitted,
}: Props) {
  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [categories, setCategories] = useState<Set<FeedbackCategoryKey>>(new Set());
  const [message, setMessage] = useState("");
  const [stage, setStage] = useState<Stage>({ kind: "idle" });

  useEffect(() => {
    if (open) {
      setRating(null);
      setCategories(new Set());
      setMessage("");
      setStage({ kind: "idle" });
    }
  }, [open]);

  // Auto-close on success after a short pause so the user sees the
  // confirmation before the modal disappears.
  useEffect(() => {
    if (stage.kind !== "success") return;
    const t = window.setTimeout(() => onClose(), 1600);
    return () => window.clearTimeout(t);
  }, [stage, onClose]);

  // Lock body scroll while open so the dim layer behind the modal stays
  // anchored on mobile.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  function toggleCategory(c: FeedbackCategoryKey) {
    setCategories((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }

  async function handleSubmit() {
    if (!rating) {
      setStage({
        kind: "error",
        message: "Pick a rating before sending.",
      });
      return;
    }
    setStage({ kind: "submitting" });
    try {
      await submitFeedback({
        rating,
        categories: Array.from(categories),
        message: message.trim(),
        source,
        context: {
          ...context,
          userAgent:
            typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        },
      });
      setStage({ kind: "success" });
      onSubmitted?.();
    } catch (err) {
      setStage({
        kind: "error",
        message:
          err instanceof Error
            ? err.message
            : "Couldn't send your feedback. Please try again.",
      });
    }
  }

  const submitting = stage.kind === "submitting";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Share feedback"
      style={{ padding: 0 }}
      onMouseDown={(e) => {
        if (e.currentTarget === e.target && !submitting) onClose();
      }}
    >
      {/* Dim backdrop with brand-tinted blur */}
      <div
        aria-hidden
        style={{
          position: "absolute", inset: 0,
          background:
            "radial-gradient(ellipse 50% 40% at 50% 30%, rgba(255,180,0,0.10), rgba(0,0,0,0.65) 70%)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
      />

      <div
        className="relative w-full sm:w-auto sm:max-w-[460px]"
        style={{
          background: "linear-gradient(180deg, rgba(20,16,4,0.98), rgba(8,8,8,0.98))",
          border: "1px solid rgba(255,215,0,0.22)",
          borderRadius: 24,
          boxShadow:
            "0 40px 100px rgba(0,0,0,0.7), 0 0 80px rgba(255,180,0,0.08), inset 0 1px 0 rgba(255,255,255,0.04)",
          maxHeight: "calc(100dvh - 16px)",
          overflow: "hidden",
          // On mobile we glue the modal to the bottom of the viewport
          // (sheet style). Override radius for that look.
          margin: "0 8px 8px",
        }}
      >
        {/* Gold top accent stripe */}
        <div
          aria-hidden
          style={{
            position: "absolute", top: 0, left: 0, right: 0, height: 2,
            background: "linear-gradient(90deg, transparent, #FFD700, transparent)",
          }}
        />

        {/* Close button */}
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          disabled={submitting}
          className="absolute inline-flex items-center justify-center rounded-full transition active:scale-90 disabled:opacity-50"
          style={{
            top: 14, right: 14,
            width: 32, height: 32,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,215,0,0.18)",
            color: "rgba(255,255,255,0.7)",
            zIndex: 2,
          }}
        >
          <X className="h-4 w-4" />
        </button>

        {stage.kind === "success" ? (
          <div className="px-6 py-12 text-center">
            <div
              className="mx-auto mb-4 grid place-items-center rounded-full"
              style={{
                width: 64, height: 64,
                background: "radial-gradient(circle at 30% 30%, #FFD700, #FF8C42)",
                boxShadow: "0 12px 32px rgba(255,180,0,0.45), inset 0 1px 0 rgba(255,255,255,0.35)",
                color: "#0a0a0a",
              }}
            >
              <Check className="h-7 w-7" strokeWidth={3} />
            </div>
            <div
              style={{
                fontFamily: FONT_JKT, fontWeight: 800, fontSize: 22,
                color: "#fff", letterSpacing: "-0.025em", lineHeight: 1.1,
              }}
            >
              Thank you
            </div>
            <div
              style={{
                fontFamily: FONT_SANS, fontSize: 13.5, color: "rgba(255,255,255,0.5)",
                marginTop: 6, maxWidth: "32ch", marginInline: "auto", lineHeight: 1.5,
              }}
            >
              Your feedback is on its way to the team. We read every one.
            </div>
          </div>
        ) : (
          <div
            className="fyb-feedback-scroll overflow-y-auto"
            style={{
              maxHeight: "calc(100dvh - 32px)",
              padding: "24px 22px 22px",
              // Hide native scrollbar (Firefox + IE) — WebKit handled by
              // the .fyb-feedback-scroll class block below.
              scrollbarWidth: "none",
              msOverflowStyle: "none",
            }}
          >
            {/* WebKit scrollbar hide — scoped to this modal's scroller. */}
            <style>{`
              .fyb-feedback-scroll::-webkit-scrollbar { display: none; }
            `}</style>

            {/* Eyebrow — centered, plain text only (no AI-ish icon). */}
            <div
              style={{
                display: "block",
                textAlign: "center",
                fontFamily: FONT_MONO, fontSize: 9, letterSpacing: "0.26em",
                color: "rgba(255,215,0,0.8)", textTransform: "uppercase", fontWeight: 700,
                marginBottom: 10,
              }}
            >
              Studio feedback
            </div>

            <h2
              style={{
                fontFamily: FONT_JKT, fontWeight: 800,
                fontSize: "clamp(20px, 4.6vw, 26px)",
                color: "#fff", letterSpacing: "-0.025em",
                lineHeight: 1.15, margin: 0,
                textAlign: "center",
              }}
            >
              How&apos;s FYB Studio working for you?
            </h2>
            <p
              style={{
                fontFamily: FONT_SANS, fontSize: 13.5, lineHeight: 1.55,
                color: "rgba(255,255,255,0.5)",
                marginTop: 8, marginBottom: 20,
                textAlign: "center",
              }}
            >
              Honest feedback shapes the next release. Takes 30 seconds.
            </p>

            {/* Rating picker - emoji row, larger touch targets on mobile */}
            <div
              role="radiogroup"
              aria-label="Overall rating"
              className="grid grid-cols-5 gap-1.5"
            >
              {RATING_EMOJIS.map((r) => {
                const selected = rating === r.value;
                return (
                  <button
                    key={r.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={r.label}
                    onClick={() => setRating(r.value)}
                    className="group flex flex-col items-center gap-1.5 rounded-2xl transition active:scale-95"
                    style={{
                      padding: "10px 4px 8px",
                      background: selected
                        ? "linear-gradient(140deg, rgba(255,215,0,0.20), rgba(255,140,66,0.08))"
                        : "rgba(255,255,255,0.025)",
                      border: `1px solid ${selected ? "rgba(255,215,0,0.55)" : "rgba(255,215,0,0.10)"}`,
                      boxShadow: selected ? "0 6px 18px rgba(255,180,0,0.18)" : "none",
                    }}
                  >
                    <span style={{ fontSize: 26, lineHeight: 1, transform: selected ? "scale(1.1)" : "scale(1)", transition: "transform 200ms" }} aria-hidden>{r.emoji}</span>
                    <span
                      style={{
                        fontFamily: FONT_MONO, fontSize: 8.5, letterSpacing: "0.14em",
                        color: selected ? "#FFD700" : "rgba(255,255,255,0.4)",
                        textTransform: "uppercase", fontWeight: 700,
                      }}
                    >
                      {r.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Category chips */}
            <fieldset style={{ marginTop: 20 }}>
              <legend
                style={{
                  fontFamily: FONT_MONO, fontSize: 9, letterSpacing: "0.22em",
                  color: "rgba(255,255,255,0.5)", textTransform: "uppercase",
                  fontWeight: 700, marginBottom: 10,
                }}
              >
                What is this about?{" "}
                <span style={{ color: "rgba(255,255,255,0.3)", letterSpacing: "0.12em" }}>· Optional</span>
              </legend>
              <div className="flex flex-wrap gap-1.5">
                {FEEDBACK_CATEGORY_KEYS.map((key) => {
                  const selected = categories.has(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleCategory(key)}
                      aria-pressed={selected}
                      className="inline-flex items-center rounded-full transition active:scale-95"
                      style={{
                        fontFamily: FONT_SANS, fontSize: 12, fontWeight: 600,
                        padding: "6px 12px",
                        background: selected
                          ? "linear-gradient(140deg, #FFD700, #FFB400)"
                          : "rgba(255,255,255,0.04)",
                        color: selected ? "#0a0a0a" : "rgba(255,255,255,0.7)",
                        border: `1px solid ${selected ? "transparent" : "rgba(255,215,0,0.18)"}`,
                        boxShadow: selected ? "0 4px 14px rgba(255,180,0,0.3)" : "none",
                      }}
                    >
                      {FEEDBACK_CATEGORY_LABELS[key]}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {/* Free text */}
            <label style={{ display: "block", marginTop: 20 }}>
              <div
                style={{
                  fontFamily: FONT_MONO, fontSize: 9, letterSpacing: "0.22em",
                  color: "rgba(255,255,255,0.5)", textTransform: "uppercase",
                  fontWeight: 700, marginBottom: 10,
                }}
              >
                Anything else?{" "}
                <span style={{ color: "rgba(255,255,255,0.3)", letterSpacing: "0.12em" }}>· Optional</span>
              </div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 4000))}
                rows={4}
                placeholder="Tell us what's on your mind…"
                className="w-full resize-none outline-none transition focus-visible:ring-2"
                style={{
                  fontFamily: FONT_SANS, fontSize: 13.5,
                  lineHeight: 1.55, color: "#fff",
                  padding: "12px 14px",
                  borderRadius: 14,
                  background: "rgba(0,0,0,0.35)",
                  border: "1px solid rgba(255,215,0,0.18)",
                }}
              />
              <div
                style={{
                  textAlign: "right",
                  fontFamily: FONT_MONO, fontSize: 9, letterSpacing: "0.15em",
                  color: "rgba(255,255,255,0.32)", marginTop: 6,
                }}
              >
                {message.length} / 4000
              </div>
            </label>

            {stage.kind === "error" ? (
              <div
                style={{
                  marginTop: 14,
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

            {/* CTA row */}
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="inline-flex items-center justify-center rounded-full transition active:scale-95 disabled:opacity-50"
                style={{
                  fontFamily: FONT_MONO, fontSize: 11,
                  letterSpacing: "0.16em", textTransform: "uppercase",
                  fontWeight: 700,
                  height: 44, padding: "0 18px",
                  background: "rgba(255,255,255,0.04)",
                  color: "rgba(255,255,255,0.75)",
                  border: "1px solid rgba(255,215,0,0.15)",
                }}
              >
                Maybe later
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !rating}
                className="inline-flex items-center justify-center rounded-full transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  fontFamily: FONT_MONO, fontSize: 11,
                  letterSpacing: "0.16em", textTransform: "uppercase",
                  fontWeight: 800,
                  height: 44, padding: "0 22px",
                  background: "#FFD700",
                  color: "#000",
                  boxShadow: "0 10px 28px rgba(255,180,0,0.35), inset 0 1px 0 rgba(255,255,255,0.25)",
                }}
              >
                {submitting ? "Sending…" : "Send feedback"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
