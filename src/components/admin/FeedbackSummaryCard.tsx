"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, MessageSquareText } from "lucide-react";

import type { FeedbackStats } from "@/backend/services/feedback.service";

/**
 * At-a-glance feedback summary on the main admin dashboard. Shows the
 * three numbers admins care about most (responses, average rating, new
 * triage queue) and links into the full /admin/feedback page.
 */
export function FeedbackSummaryCard() {
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/feedback/stats", {
          cache: "no-store",
        });
        if (!res.ok) return;
        const payload = (await res.json()) as { stats: FeedbackStats };
        if (!cancelled) setStats(payload.stats);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const newCount =
    stats?.statusBreakdown.find((s) => s.status === "new")?.count ?? 0;

  return (
    <section className="space-y-4 sm:space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink-faint dark:text-ink-faint">
            <span aria-hidden className="inline-block h-px w-5 bg-[var(--accent-blue)] opacity-60" />
            Feedback
          </div>
          <h2 className="mt-1 flex items-center gap-2 text-base font-semibold tracking-tight text-ink sm:text-lg dark:text-ink">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[var(--accent-blue-soft)] text-[var(--accent-blue)] dark:bg-[var(--accent-blue-soft)] dark:text-[var(--accent-blue)]">
              <MessageSquareText className="h-3.5 w-3.5" />
            </span>
            What users are saying
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-muted sm:text-[13px] dark:text-ink-muted">
            Pulse on responses, ratings, and what is awaiting triage.
          </p>
        </div>
        <Link
          href="/admin/feedback"
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-hairline bg-surface-1 px-3 text-xs font-medium text-ink-muted transition hover:bg-canvas hover:text-ink active:scale-95 dark:border-hairline dark:bg-surface-1 dark:text-ink-muted dark:hover:bg-surface-2 dark:hover:text-ink"
        >
          Open feedback
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </header>

      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <Item
          label="Responses"
          value={stats ? stats.total.toLocaleString() : loading ? "…" : "0"}
          sub={
            stats
              ? `${stats.uniqueRespondents.toLocaleString()} unique respondents`
              : ""
          }
        />
        <Item
          label="Avg rating"
          value={
            stats ? `${stats.averageRating.toFixed(1)}` : loading ? "…" : "-"
          }
          sub={stats ? `${stats.last30Days.total} this month` : ""}
        />
        <Item
          label="To triage"
          value={loading ? "…" : newCount.toLocaleString()}
          sub={
            newCount > 0 ? "Awaiting your review" : "Inbox zero ✨"
          }
          highlight={newCount > 0}
        />
      </dl>
    </section>
  );
}

function Item({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        "rounded-2xl border p-3 transition-all hover:-translate-y-0.5 hover:shadow-sm sm:p-4 " +
        (highlight
          ? "border-[rgba(245,158,11,0.28)] bg-[rgba(245,158,11,0.08)] dark:border-[rgba(245,158,11,0.28)] dark:bg-[rgba(245,158,11,0.08)]"
          : "border-hairline bg-surface-1 dark:border-hairline dark:bg-surface-1")
      }
    >
      <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint sm:text-[10.5px] dark:text-ink-faint">
        {label}
      </dt>
      <dd
        className={
          "mt-1 truncate text-xl font-semibold tracking-tight sm:text-2xl " +
          (highlight
            ? "text-warning dark:text-warning"
            : "text-ink dark:text-ink")
        }
      >
        {value}
      </dd>
      {sub ? (
        <div className="mt-0.5 truncate text-[10.5px] text-ink-muted sm:text-[11.5px] dark:text-ink-muted">
          {sub}
        </div>
      ) : null}
    </div>
  );
}
