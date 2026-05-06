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

      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          disabled={submitting}
          className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        >
          <X className="h-4 w-4" />
        </button>

        {stage.kind === "success" ? (
          <div className="px-6 py-10 text-center">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
              <Check className="h-5 w-5" />
            </div>
            <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">
              Thank you!
            </div>
            <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              Your feedback is on its way to the team.
            </div>
          </div>
        ) : (
          <div className="px-6 py-5">
            <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">
              How&apos;s FYB Studio working for you?
            </div>
            <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
              Honest feedback shapes the next release. Takes 30 seconds.
            </div>

            {/* Rating picker — emoji row */}
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
                        "group flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-2xl transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 " +
                        (selected
                          ? "border-emerald-500 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-950/40"
                          : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/30 dark:hover:bg-zinc-800")
                      }
                    >
                      <span aria-hidden>{r.emoji}</span>
                      <span
                        className={
                          "text-[10px] font-medium tracking-wide " +
                          (selected
                            ? "text-emerald-700 dark:text-emerald-300"
                            : "text-zinc-500 dark:text-zinc-400")
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
              <legend className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                What is this about? <span className="text-zinc-400">(optional)</span>
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
                        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 " +
                        (selected
                          ? "border-emerald-500 bg-emerald-500 text-white dark:bg-emerald-600"
                          : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-200 dark:hover:bg-zinc-800")
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
              <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Anything else? <span className="text-zinc-400">(optional)</span>
              </div>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, 4000))}
                rows={4}
                placeholder="Tell us what's on your mind…"
                className="mt-1.5 w-full resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:border-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-100"
              />
              <div className="mt-1 text-right text-[10.5px] text-zinc-400">
                {message.length}/4000
              </div>
            </label>

            {stage.kind === "error" ? (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
                {stage.message}
              </div>
            ) : null}

            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                Maybe later
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !rating}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-500"
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
