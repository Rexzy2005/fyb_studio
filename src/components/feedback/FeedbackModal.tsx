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
  { value: 1, emoji: "😞", label: "Frustrating" },
  { value: 2, emoji: "😕", label: "Needs work" },
  { value: 3, emoji: "😐", label: "It's okay" },
  { value: 4, emoji: "🙂", label: "Pretty good" },
  { value: 5, emoji: "🤩", label: "Love it" },
];

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
    const t = window.setTimeout(() => onClose(), 1400);
    return () => window.clearTimeout(t);
  }, [stage, onClose]);

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
        message: "Please pick a rating before submitting.",
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Share feedback"
      onMouseDown={(e) => {
        if (e.currentTarget === e.target && !submitting) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/40" />

      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-hairline bg-surface-1 shadow-xl dark:border-hairline dark:bg-surface-1">
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          disabled={submitting}
          className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-faint transition hover:bg-surface-2 hover:text-ink disabled:opacity-50 dark:hover:bg-surface-2 dark:hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>

        {stage.kind === "success" ? (
          <div className="px-6 py-10 text-center">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-[rgba(255,215,0,0.15)] text-[#FFD700] dark:bg-[rgba(255,215,0,0.15)] dark:text-[#FFD700]">
              <Check className="h-5 w-5" />
            </div>
            <div className="text-sm font-semibold text-ink dark:text-ink">
              Thank you!
            </div>
            <div className="mt-1 text-sm text-ink-muted dark:text-ink-muted">
              Your feedback is on its way to the team.
            </div>
          </div>
        ) : (
          <div className="px-6 py-5">
            <div className="text-sm font-semibold text-ink dark:text-ink">
              How&apos;s FYB Studio working for you?
            </div>
            <div className="mt-1 text-xs text-ink-muted dark:text-ink-muted">
              Honest feedback shapes the next release. Takes 30 seconds.
            </div>

            {/* Rating picker - emoji row */}
            <div className="mt-5">
              <div
                role="radiogroup"
                aria-label="Overall rating"
                className="grid grid-cols-5 gap-1"
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
                      className={
                        "group flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-2xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(255,215,0,0.4)] " +
                        (selected
                          ? "border-[#FFD700] bg-[rgba(255,215,0,0.15)] dark:border-[#FFD700] dark:bg-[rgba(255,215,0,0.15)]"
                          : "border-hairline bg-surface-1 hover:border-hairline hover:bg-canvas dark:border-hairline dark:bg-surface-1 dark:hover:bg-surface-2")
                      }
                    >
                      <span aria-hidden>{r.emoji}</span>
                      <span
                        className={
                          "text-[10px] font-medium tracking-wide " +
                          (selected
                            ? "text-[#FFD700] dark:text-[#FFD700]"
                            : "text-ink-faint dark:text-ink-faint")
                        }
                      >
                        {r.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Category chips */}
            <fieldset className="mt-5">
              <legend className="text-xs font-medium text-ink-muted dark:text-ink-muted">
                What is this about? <span className="text-ink-faint">(optional)</span>
              </legend>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {FEEDBACK_CATEGORY_KEYS.map((key) => {
                  const selected = categories.has(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => toggleCategory(key)}
                      className={
                        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(255,215,0,0.4)] " +
                        (selected
                          ? "border-[#FFD700] bg-[#FFD700] text-white dark:bg-[#FFD700]"
                          : "border-hairline bg-surface-1 text-ink-muted hover:border-hairline hover:bg-canvas dark:border-hairline dark:bg-surface-1 dark:text-ink dark:hover:bg-surface-2")
                      }
                      aria-pressed={selected}
                    >
                      {FEEDBACK_CATEGORY_LABELS[key]}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            {/* Free text */}
            <label className="mt-5 block">
              <div className="text-xs font-medium text-ink-muted dark:text-ink-muted">
                Anything else? <span className="text-ink-faint">(optional)</span>
              </div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 4000))}
                rows={4}
                placeholder="Tell us what's on your mind…"
                className="mt-1.5 w-full resize-none rounded-xl border border-hairline bg-surface-1 px-3 py-2 text-sm text-ink outline-none transition focus-visible:ring-2 focus-visible:ring-[rgba(255,215,0,0.4)] dark:border-hairline dark:bg-surface-1 dark:text-ink"
              />
              <div className="mt-1 text-right text-[10.5px] text-ink-faint">
                {message.length}/4000
              </div>
            </label>

            {stage.kind === "error" ? (
              <div className="mt-3 rounded-xl border border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.08)] px-3 py-2 text-xs text-danger dark:border-[rgba(239,68,68,0.28)] dark:bg-red-950/30 dark:text-danger">
                {stage.message}
              </div>
            ) : null}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-hairline bg-surface-1 px-4 text-sm font-medium text-ink transition hover:bg-canvas disabled:opacity-50 dark:border-hairline dark:bg-surface-1 dark:text-ink dark:hover:bg-surface-2"
              >
                Maybe later
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !rating}
                className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 active:scale-95"
                style={{
                  background: "#FFD700",
                  color: "#000",
                  boxShadow: "0 6px 18px rgba(255,180,0,0.25)",
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
