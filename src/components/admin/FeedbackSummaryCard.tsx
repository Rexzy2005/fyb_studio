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
    <section className="rounded-2xl border border-hairline bg-surface-1 p-4 dark:border-hairline dark:bg-surface-1">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--accent-blue-soft)] text-[var(--accent-blue)] dark:bg-[var(--accent-blue-soft)] dark:text-[var(--accent-blue)]">
            <MessageSquareText className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-ink dark:text-ink">
              User feedback
            </h2>
            <p className="text-xs text-ink-muted dark:text-ink-faint">
              What customers are telling you, in 30 seconds.
            </p>
          </div>
        </div>
        <Link
          href="/admin/feedback"
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-hairline bg-surface-1 px-3 text-xs font-medium text-ink-muted transition hover:bg-canvas dark:border-hairline dark:bg-surface-1 dark:text-ink-muted dark:hover:bg-surface-2"
        >
          Open
          <ArrowRight className="h-3 w-3" />
        </Link>
      </header>

      <dl className="mt-4 grid grid-cols-3 gap-3">
        <Item
          label="Responses"
          value={stats ? stats.total.toLocaleString() : loading ? "…" : "0"}
          sub={
            stats
              ? `${stats.uniqueRespondents.toLocaleString()} unique`
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
        "rounded-xl border p-3 " +
        (highlight
          ? "border-[rgba(245,158,11,0.28)] bg-[rgba(245,158,11,0.08)]/60 dark:border-[rgba(245,158,11,0.28)] dark:bg-[rgba(245,158,11,0.08)]"
          : "border-hairline bg-canvas/40 dark:border-hairline dark:bg-surface-1")
      }
    >
      <dt className="text-[11px] uppercase tracking-wide text-ink-faint dark:text-ink-faint">
        {label}
      </dt>
      <dd
        className={
          "mt-1 text-xl font-semibold tracking-tight " +
          (highlight
            ? "text-warning dark:text-warning"
            : "text-ink dark:text-ink")
        }
      >
        {value}
      </dd>
      {sub ? (
        <div className="mt-0.5 truncate text-[11px] text-ink-faint dark:text-ink-faint">
          {sub}
        </div>
      ) : null}
    </div>
  );
}
