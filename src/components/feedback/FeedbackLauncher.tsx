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
 *   1. **Dashboard CTA card** - a clean, professional "Share feedback"
 *      tile near the top of the page. Visible until the user dismisses it
 *      OR submits feedback within the last 60 days.
 *
 *   2. **Floating circular button** - bottom-right of the dashboard only,
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
        <section className="relative overflow-hidden rounded-2xl border border-hairline bg-linear-to-br from-surface-1 via-canvas to-[rgba(0,153,255,0.06)] p-4 shadow-xs dark:border-hairline dark:from-canvas dark:via-surface-1 dark:to-[rgba(0,153,255,0.05)]">
          <button
            type="button"
            onClick={dismissCard}
            aria-label="Hide feedback request"
            className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-ink-faint transition hover:bg-surface-2 hover:text-ink dark:hover:bg-surface-2 dark:hover:text-ink"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="flex items-start gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--accent-blue-soft)] text-[var(--accent-blue)] dark:bg-[var(--accent-blue-soft)] dark:text-[var(--accent-blue)]">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-ink dark:text-ink">
                  How&apos;s your experience?
                </div>
                <div className="mt-0.5 text-xs text-ink-muted dark:text-ink-muted">
                  Help us shape what we build next. 30 seconds, totally optional.
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => openModal("dashboard_card")}
              className="inline-flex h-9 shrink-0 items-center justify-center rounded-xl bg-surface-1 px-4 text-xs font-semibold text-white transition hover:bg-surface-2 dark:bg-[var(--accent-blue)] dark:hover:bg-[var(--accent-blue)]"
            >
              Share feedback
            </button>
          </div>
        </section>
      ) : null}

      {/* Floating button - bottom-right of the viewport, dashboard only.
          Stays visible even when the card is dismissed so users always have
          a way in. Doesn't follow the user across the editor / templates
          pages where it would compete with the existing action UI. */}
      <button
        type="button"
        onClick={() => openModal("floating_button")}
        aria-label="Share feedback"
        title="Share feedback"
        className="fixed bottom-5 right-5 z-40 inline-flex h-12 items-center gap-2 rounded-full border border-hairline bg-surface-1 px-4 text-sm font-semibold text-ink shadow-lg transition hover:-translate-y-0.5 hover:bg-canvas hover:shadow-xl dark:border-hairline dark:bg-surface-1 dark:text-ink dark:hover:bg-surface-2"
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
