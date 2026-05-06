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
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
            <MessageSquareText className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-zinc-950 dark:text-zinc-100">
              User feedback
            </h2>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              What customers are telling you, in 30 seconds.
            </p>
          </div>
        </div>
        <Link
          href="/admin/feedback"
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-300 dark:hover:bg-zinc-800"
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
            stats ? `${stats.averageRating.toFixed(1)}` : loading ? "…" : "—"
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
          ? "border-amber-200 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/15"
          : "border-zinc-200 bg-zinc-50/40 dark:border-zinc-800 dark:bg-zinc-950/30")
      }
    >
      <dt className="text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </dt>
      <dd
        className={
          "mt-1 text-xl font-semibold tracking-tight " +
          (highlight
            ? "text-amber-700 dark:text-amber-300"
            : "text-zinc-950 dark:text-zinc-100")
        }
      >
        {value}
      </dd>
      {sub ? (
        <div className="mt-0.5 truncate text-[11px] text-zinc-500 dark:text-zinc-400">
          {sub}
        </div>
      ) : null}
    </div>
  );
}
