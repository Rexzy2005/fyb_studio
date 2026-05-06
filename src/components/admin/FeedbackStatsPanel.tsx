"use client";

import { useEffect, useMemo, useState } from "react";

import {
  FEEDBACK_CATEGORY_LABELS,
  type FeedbackCategoryKey,
} from "@/lib/api/feedback";
import type { FeedbackStats } from "@/backend/services/feedback.service";

const SENTIMENT_COLORS = {
  positive: "bg-emerald-500",
  neutral: "bg-zinc-400",
  negative: "bg-red-500",
} as const;

export function FeedbackStatsPanel() {
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/admin/feedback/stats", {
          cache: "no-store",
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: { message?: string };
          };
          throw new Error(body.error?.message ?? `Request failed (${res.status})`);
        }
        const payload = (await res.json()) as { stats: FeedbackStats };
        if (!cancelled) setStats(payload.stats);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200">
        {error}
      </div>
    );
  }

  return (
    <section className="space-y-4">
      {/* Headline cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total responses"
          value={stats ? stats.total.toLocaleString() : loading ? "…" : "0"}
          sub={stats ? `${stats.uniqueRespondents.toLocaleString()} unique users` : ""}
        />
        <StatCard
          label="Average rating"
          value={stats ? `${stats.averageRating.toFixed(1)} / 5` : loading ? "…" : "—"}
          sub={stats ? renderStars(stats.averageRating) : ""}
        />
        <StatCard
          label="Last 30 days"
          value={stats ? stats.last30Days.total.toLocaleString() : loading ? "…" : "0"}
          sub={
            stats
              ? `Avg ${stats.last30Days.averageRating.toFixed(1)} / 5`
              : ""
          }
        />
        <StatCard
          label="In triage"
          value={
            stats
              ? (
                  stats.statusBreakdown.find((s) => s.status === "new")?.count ?? 0
                ).toLocaleString()
              : loading
                ? "…"
                : "0"
          }
          sub={stats ? `${stats.statusBreakdown.length} statuses tracked` : ""}
        />
      </div>

      {/* Charts row: rating distribution + sentiment + categories */}
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
            Rating distribution
          </div>
          {loading || !stats ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="fyb-skeleton h-4 rounded-full" />
              ))}
            </div>
          ) : (
            <DistributionChart distribution={stats.ratingDistribution} />
          )}
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
            Sentiment
          </div>
          {loading || !stats ? (
            <div className="fyb-skeleton h-32 rounded-xl" />
          ) : (
            <SentimentDonut breakdown={stats.sentimentBreakdown} />
          )}
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
            Top topics
          </div>
          {loading || !stats ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="fyb-skeleton h-4 rounded-full" />
              ))}
            </div>
          ) : (
            <CategoryChart breakdown={stats.categoryBreakdown} />
          )}
        </div>
      </div>

      {/* 30-day trend */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
            Last 30 days
          </div>
          <div className="flex items-center gap-3 text-[11px] text-zinc-600 dark:text-zinc-400">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-3 rounded-full bg-emerald-500" /> Avg rating
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-3 rounded-full bg-zinc-400" /> Responses
            </span>
          </div>
        </div>
        {loading || !stats ? (
          <div className="fyb-skeleton h-40 rounded-xl" />
        ) : (
          <DailyTrendChart daily={stats.last30Days.daily} />
        )}
      </div>
    </section>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-100">
        {value}
      </div>
      {sub ? (
        <div className="mt-0.5 truncate text-[11px] text-zinc-500 dark:text-zinc-400">
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function DistributionChart({
  distribution,
}: {
  distribution: FeedbackStats["ratingDistribution"];
}) {
  return (
    <ul className="space-y-2">
      {[5, 4, 3, 2, 1].map((star) => {
        const row = distribution.find((d) => d.rating === star) ?? {
          count: 0,
          pct: 0,
        };
        const pct = row.pct;
        const barColor =
          star >= 4
            ? "bg-emerald-500"
            : star === 3
              ? "bg-zinc-400"
              : "bg-red-500";
        return (
          <li key={star} className="flex items-center gap-3">
            <span className="w-12 shrink-0 text-xs font-medium text-zinc-700 dark:text-zinc-300">
              {"★".repeat(star)}
              {"☆".repeat(5 - star)}
            </span>
            <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div
                className={`absolute inset-y-0 left-0 ${barColor}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-16 shrink-0 text-right text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
              {row.count.toLocaleString()} ({pct}%)
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function SentimentDonut({
  breakdown,
}: {
  breakdown: FeedbackStats["sentimentBreakdown"];
}) {
  const total = breakdown.positive + breakdown.neutral + breakdown.negative;
  // SVG donut math: stroke-dasharray on one circle per slice. Circumference
  // = 2πr. We slice by % of total. Drawn clockwise from 12 o'clock.
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const segments = useMemo(() => {
    if (total === 0) return [];
    const order: Array<{ key: keyof typeof SENTIMENT_COLORS; pct: number }> = [
      { key: "positive", pct: breakdown.positive / total },
      { key: "neutral", pct: breakdown.neutral / total },
      { key: "negative", pct: breakdown.negative / total },
    ];
    let offset = 0;
    return order.map((s) => {
      const length = s.pct * circumference;
      const dash = `${length} ${circumference - length}`;
      const dashOffset = -offset;
      offset += length;
      return { ...s, dash, dashOffset };
    });
  }, [breakdown, circumference, total]);

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="h-28 w-28 -rotate-90">
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          strokeWidth="14"
          className="stroke-zinc-100 dark:stroke-zinc-800"
        />
        {segments.map((s) => (
          <circle
            key={s.key}
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            strokeWidth="14"
            strokeDasharray={s.dash}
            strokeDashoffset={s.dashOffset}
            className={
              s.key === "positive"
                ? "stroke-emerald-500"
                : s.key === "neutral"
                  ? "stroke-zinc-400"
                  : "stroke-red-500"
            }
          />
        ))}
      </svg>
      <ul className="flex-1 space-y-1.5 text-xs">
        <SentimentRow label="Positive" count={breakdown.positive} total={total} colorClass={SENTIMENT_COLORS.positive} />
        <SentimentRow label="Neutral" count={breakdown.neutral} total={total} colorClass={SENTIMENT_COLORS.neutral} />
        <SentimentRow label="Negative" count={breakdown.negative} total={total} colorClass={SENTIMENT_COLORS.negative} />
      </ul>
    </div>
  );
}

function SentimentRow({
  label,
  count,
  total,
  colorClass,
}: {
  label: string;
  count: number;
  total: number;
  colorClass: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="inline-flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300">
        <span className={`h-2 w-2 rounded-full ${colorClass}`} />
        {label}
      </span>
      <span className="text-zinc-500 dark:text-zinc-400 tabular-nums">
        {count} <span className="text-zinc-400">·</span> {pct}%
      </span>
    </li>
  );
}

function CategoryChart({
  breakdown,
}: {
  breakdown: FeedbackStats["categoryBreakdown"];
}) {
  const max = Math.max(1, ...breakdown.map((b) => b.count));
  const sorted = [...breakdown].sort((a, b) => b.count - a.count);
  return (
    <ul className="space-y-2">
      {sorted.map((b) => {
        const pct = (b.count / max) * 100;
        const label =
          FEEDBACK_CATEGORY_LABELS[b.category as FeedbackCategoryKey] ??
          b.category;
        return (
          <li key={b.category} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="truncate text-zinc-700 dark:text-zinc-300">{label}</span>
              <span className="text-zinc-500 dark:text-zinc-400 tabular-nums">
                {b.count.toLocaleString()}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div
                className="h-full bg-emerald-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function DailyTrendChart({
  daily,
}: {
  daily: FeedbackStats["last30Days"]["daily"];
}) {
  const dims = { w: 720, h: 160, padX: 12, padY: 12 };
  const maxResponses = Math.max(1, ...daily.map((d) => d.total));
  const innerW = dims.w - dims.padX * 2;
  const innerH = dims.h - dims.padY * 2;
  const stepX = daily.length > 1 ? innerW / (daily.length - 1) : 0;
  const barW = Math.max(2, Math.min(stepX * 0.7, 14));

  const linePoints = daily
    .map((b, i) => {
      const x = dims.padX + stepX * i;
      // Average rating sits on a 1-5 scale; map full range to inner height.
      const ratingForY = b.averageRating ?? 0;
      const normalised = (ratingForY - 1) / 4; // 0 at 1★, 1 at 5★
      const y =
        dims.padY +
        innerH -
        Math.max(0, Math.min(1, normalised)) * innerH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const totalResponses = daily.reduce((sum, b) => sum + b.total, 0);

  return (
    <div>
      <svg
        viewBox={`0 0 ${dims.w} ${dims.h}`}
        className="h-40 w-full"
        preserveAspectRatio="none"
        aria-label="Daily feedback trend"
      >
        {daily.map((b, i) => {
          const x = dims.padX + stepX * i - barW / 2;
          const h = (b.total / maxResponses) * innerH;
          const y = dims.padY + innerH - h;
          return (
            <rect
              key={`bar-${b.date}`}
              x={x.toFixed(1)}
              y={y.toFixed(1)}
              width={barW.toFixed(1)}
              height={Math.max(0, h).toFixed(1)}
              rx={1.5}
              className="fill-zinc-300 dark:fill-zinc-700"
            />
          );
        })}
        <polyline
          fill="none"
          strokeWidth={2}
          className="stroke-emerald-500"
          points={linePoints}
        />
        {daily.map((b, i) => {
          if (b.averageRating === null) return null;
          const x = dims.padX + stepX * i;
          const normalised = (b.averageRating - 1) / 4;
          const y =
            dims.padY +
            innerH -
            Math.max(0, Math.min(1, normalised)) * innerH;
          return (
            <circle
              key={`pt-${b.date}`}
              cx={x.toFixed(1)}
              cy={y.toFixed(1)}
              r={2.4}
              className="fill-emerald-500"
            />
          );
        })}
      </svg>
      <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
        <span>{daily[0]?.date ?? ""}</span>
        <span>{totalResponses.toLocaleString()} responses · 30 days</span>
        <span>{daily[daily.length - 1]?.date ?? ""}</span>
      </div>
    </div>
  );
}

function renderStars(value: number): string {
  const full = Math.round(value);
  return "★".repeat(full) + "☆".repeat(5 - full);
}
