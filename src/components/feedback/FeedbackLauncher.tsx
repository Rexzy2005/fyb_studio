"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MessageSquareText } from "lucide-react";

import { FeedbackModal } from "./FeedbackModal";
import type { FeedbackSource } from "@/lib/api/feedback";

const SUBMITTED_KEY = "fyb:feedback:submittedAt";

/**
 * Single feedback surface: a floating circular button at the bottom-right
 * of the dashboard. The inline "Share feedback" card has been retired so
 * the dashboard reads as one clean column.
 *
 * The floating button also serves the post-download nudge: when
 * /templates/[id]/use redirects back with ?justDownloaded=1, we auto-open
 * the modal once per 60-day cooldown.
 */
export function FeedbackLauncher() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<FeedbackSource>("floating_button");
  const [recentlySubmitted, setRecentlySubmitted] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
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

  useEffect(() => {
    if (!hydrated) return;
    if (!searchParams) return;
    if (searchParams.get("justDownloaded") !== "1") return;

    const params = new URLSearchParams(searchParams.toString());
    params.delete("justDownloaded");
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : "/dashboard");

    if (recentlySubmitted) return;
    setSource("post_download");
    setOpen(true);
  }, [hydrated, searchParams, recentlySubmitted, router]);

  function openModal(s: FeedbackSource) {
    setSource(s);
    setOpen(true);
  }

  function onSubmitted() {
    window.localStorage.setItem(SUBMITTED_KEY, String(Date.now()));
    setRecentlySubmitted(true);
  }

  return (
    <>
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
