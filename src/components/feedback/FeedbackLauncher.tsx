"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageSquareText, Sparkles, X } from "lucide-react";

import { FeedbackModal } from "./FeedbackModal";
import type { FeedbackSource } from "@/lib/api/feedback";

const DISMISS_KEY = "fyb:feedback:dismissed";
const SUBMITTED_KEY = "fyb:feedback:submittedAt";

/**
 * Two complementary feedback surfaces, both designed to be ignorable:
 *
 *   1. **Dashboard CTA card** — a clean, professional "Share feedback"
 *      tile near the top of the page. Visible until the user dismisses it
 *      OR submits feedback within the last 60 days.
 *
 *   2. **Floating circular button** — bottom-right of the dashboard only,
 *      always available. Stays visible even after the card is dismissed
 *      so power users can still volunteer feedback whenever they want.
 *
 * Both routes open the same modal, with a `source` tag so the dashboard
 * stats can show which surface drives the most replies.
 */
export function FeedbackLauncher() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<FeedbackSource>("dashboard_card");
  const [cardDismissed, setCardDismissed] = useState(false);
  const [recentlySubmitted, setRecentlySubmitted] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const dismissed = window.localStorage.getItem(DISMISS_KEY);
    if (dismissed === "1") setCardDismissed(true);
    const lastSubmitted = window.localStorage.getItem(SUBMITTED_KEY);
    if (lastSubmitted) {
      const ts = Number(lastSubmitted);
      if (Number.isFinite(ts)) {
        const sixtyDaysMs = 60 * 24 * 60 * 60 * 1000;
        if (Date.now() - ts < sixtyDaysMs) {
          setRecentlySubmitted(true);
        }
      }
    }
    setHydrated(true);
  }, []);

  // Auto-open after a successful download. The use-page redirects with
  // ?justDownloaded=1 to nudge this. We only fire AFTER hydration so we've
  // read the cooldown from localStorage and don't pester recent responders.
  useEffect(() => {
    if (!hydrated) return;
    if (!searchParams) return;
    if (searchParams.get("justDownloaded") !== "1") return;

    // Clear the marker before opening (so navigating back / refreshing
    // doesn't retrigger). Done via router.replace so we don't add a
    // history entry.
    const params = new URLSearchParams(searchParams.toString());
    params.delete("justDownloaded");
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "/dashboard");

    if (recentlySubmitted) return;
    setSource("post_download");
    setOpen(true);
  }, [hydrated, searchParams, recentlySubmitted, router]);

  function dismissCard() {
    window.localStorage.setItem(DISMISS_KEY, "1");
    setCardDismissed(true);
  }

  function openModal(s: FeedbackSource) {
    setSource(s);
    setOpen(true);
  }

  function onSubmitted() {
    window.localStorage.setItem(SUBMITTED_KEY, String(Date.now()));
    setRecentlySubmitted(true);
  }

  const showCard = !cardDismissed && !recentlySubmitted;

  return (
    <>
      {showCard ? (
        <section className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-linear-to-br from-white via-zinc-50 to-emerald-50/40 p-4 shadow-xs dark:border-zinc-800 dark:from-zinc-950 dark:via-zinc-900 dark:to-emerald-950/15">
          <button
            type="button"
            onClick={dismissCard}
            aria-label="Hide feedback request"
            className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="flex items-start gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">
                  How&apos;s your experience?
                </div>
                <div className="mt-0.5 text-xs text-zinc-700 dark:text-zinc-300">
                  Help us shape what we build next. 30 seconds, totally optional.
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => openModal("dashboard_card")}
              className="inline-flex h-9 shrink-0 items-center justify-center rounded-xl bg-zinc-900 px-4 text-xs font-semibold text-white transition hover:bg-zinc-800 dark:bg-emerald-600 dark:hover:bg-emerald-500"
            >
              Share feedback
            </button>
          </div>
        </section>
      ) : null}

      {/* Floating button — bottom-right of the viewport, dashboard only.
          Stays visible even when the card is dismissed so users always have
          a way in. Doesn't follow the user across the editor / templates
          pages where it would compete with the existing action UI. */}
      <button
        type="button"
        onClick={() => openModal("floating_button")}
        aria-label="Share feedback"
        title="Share feedback"
        className="fixed bottom-5 right-5 z-40 inline-flex h-12 items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 shadow-lg transition hover:-translate-y-0.5 hover:bg-zinc-50 hover:shadow-xl dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
      >
        <MessageSquareText className="h-4 w-4" />
        <span className="hidden sm:inline">Feedback</span>
      </button>

      <FeedbackModal
        open={open}
        source={source}
        context={{ page: "/dashboard" }}
        onClose={() => setOpen(false)}
        onSubmitted={onSubmitted}
      />
    </>
  );
}
