"use client";

import { useEffect, useMemo, useState } from "react";

import type {
  RecentPaymentRow,
  RevenueDailyBucket,
  RevenueSummary,
  TopTemplateRow,
} from "@/backend/services/revenue.service";

type RevenueResponse = {
  summary: RevenueSummary;
  daily: RevenueDailyBucket[];
  topTemplates: TopTemplateRow[];
  recentPayments: RecentPaymentRow[];
};

function formatNgn(n: number): string {
  return `₦${n.toLocaleString()}`;
}
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

/**
 * Admin revenue + downloads analytics. One panel covering:
 *   - Headline stats (total revenue, 30d revenue, paying users, downloads).
 *   - Daily revenue+downloads chart (last 30 days, inline SVG so no chart lib).
 *   - Top revenue templates.
 *   - Recent payments table.
 */
export function RevenuePanel() {
  const [data, setData] = useState<RevenueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/admin/revenue", { cache: "no-store" });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: { message?: string };
          };
          throw new Error(body.error?.message ?? `Request failed (${res.status})`);
        }
        const payload = (await res.json()) as RevenueResponse;
        if (!cancelled) setData(payload);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Unknown error");
        }
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
      <header className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-zinc-950 dark:text-zinc-100">
            Revenue & downloads
          </h2>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            Paystack-confirmed earnings and customer download activity.
          </p>
        </div>
        {data ? (
          <span className="text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
            Last 30 days · {formatNgn(data.summary.last30Days.revenueNgn)}
          </span>
        ) : null}
      </header>

      {/* Headline stat cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <RevenueStat
          label="Total revenue"
          value={data ? formatNgn(data.summary.totalRevenueNgn) : loading ? "…" : "₦0"}
          sub={
            data
              ? `${data.summary.successfulPayments.toLocaleString()} successful payments`
              : ""
          }
        />
        <RevenueStat
          label="30-day revenue"
          value={data ? formatNgn(data.summary.last30Days.revenueNgn) : loading ? "…" : "₦0"}
          sub={
            data
              ? `${data.summary.last30Days.payments.toLocaleString()} payments · ${data.summary.last30Days.downloads.toLocaleString()} downloads`
              : ""
          }
        />
        <RevenueStat
          label="Paying users"
          value={data ? data.summary.uniquePayingUsers.toLocaleString() : loading ? "…" : "0"}
          sub={
            data
              ? `Avg ${data.summary.averageDownloadsPerPaidUser} downloads / user`
              : ""
          }
        />
        <RevenueStat
          label="Total downloads"
          value={data ? data.summary.totalDownloads.toLocaleString() : loading ? "…" : "0"}
          sub={
            data
              ? `${data.summary.pendingPayments} pending · ${data.summary.failedPayments} failed`
              : ""
          }
        />
      </div>

      {/* Daily chart + top templates side-by-side on wide screens */}
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 lg:col-span-2 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
              Last 30 days
            </div>
            <div className="flex items-center gap-3 text-[11px] text-zinc-600 dark:text-zinc-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-3 rounded-full bg-emerald-500" /> Revenue
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-3 rounded-full bg-zinc-400" /> Downloads
              </span>
            </div>
          </div>
          {loading || !data ? (
            <div className="h-40 rounded-xl bg-zinc-50 dark:bg-zinc-800/40" />
          ) : (
            <DailyChart buckets={data.daily} />
          )}
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
            Top earners
          </div>
          {loading || !data ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="fyb-skeleton h-9 rounded-lg" />
              ))}
            </div>
          ) : data.topTemplates.length === 0 ? (
            <div className="text-xs text-zinc-500 dark:text-zinc-400">No paid downloads yet.</div>
          ) : (
            <ul className="space-y-2">
              {data.topTemplates.map((t) => (
                <li
                  key={t.templateId}
                  className="flex items-center justify-between gap-3 rounded-lg border border-zinc-100 px-3 py-2 dark:border-zinc-800"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {t.templateName}
                    </div>
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      {t.payments.toLocaleString()} payments · {t.downloads.toLocaleString()} downloads
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatNgn(t.revenueNgn)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Recent payments table */}
      <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
            Recent payments
          </div>
        </div>
        {loading || !data ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="fyb-skeleton h-9 rounded-lg" />
            ))}
          </div>
        ) : data.recentPayments.length === 0 ? (
          <div className="px-4 py-6 text-sm text-zinc-500 dark:text-zinc-400">
            No payments yet — this fills in once your first user buys a download.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  <th className="px-4 py-2">When</th>
                  <th className="px-4 py-2">User</th>
                  <th className="px-4 py-2">Template</th>
                  <th className="px-4 py-2">Amount</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {data.recentPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/30">
                    <td className="px-4 py-2 text-xs text-zinc-600 dark:text-zinc-400">
                      {formatDate(p.paidAt ?? p.createdAt)}
                    </td>
                    <td className="px-4 py-2">
                      <div className="text-sm text-zinc-900 dark:text-zinc-100">
                        {p.userName ?? "—"}
                      </div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        {p.userEmail ?? ""}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-sm text-zinc-900 dark:text-zinc-100">
                      {p.templateName ?? "(deleted)"}
                    </td>
                    <td className="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
                      {formatNgn(p.amountNgn)}
                    </td>
                    <td className="px-4 py-2">
                      <StatusPill status={p.status} />
                    </td>
                    <td className="px-4 py-2">
                      <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                        {p.paystackReference}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function RevenueStat({
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
        <div className="mt-0.5 truncate text-[11px] text-zinc-500 dark:text-zinc-400">{sub}</div>
      ) : null}
    </div>
  );
}

function StatusPill({ status }: { status: RecentPaymentRow["status"] }) {
  const map: Record<RecentPaymentRow["status"], string> = {
    success:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200",
    pending:
      "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200",
    failed:
      "border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200",
    abandoned:
      "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-400",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wide ${map[status]}`}>
      {status}
    </span>
  );
}

/**
 * Inline SVG bar+line chart — keeps the bundle small (no chart lib) and
 * looks consistent with the rest of the admin UI. Bars = downloads, line =
 * revenue. Both axes share the X (date), but each metric is normalised to
 * its own max so the lines/bars don't drown each other out at low values.
 */
function DailyChart({ buckets }: { buckets: RevenueDailyBucket[] }) {
  const dims = useMemo(() => ({ w: 720, h: 160, padX: 12, padY: 12 }), []);
  const maxDownloads = Math.max(1, ...buckets.map((b) => b.downloads));
  const maxRevenue = Math.max(1, ...buckets.map((b) => b.revenueNgn));

  const innerW = dims.w - dims.padX * 2;
  const innerH = dims.h - dims.padY * 2;
  const stepX = buckets.length > 1 ? innerW / (buckets.length - 1) : 0;
  const barW = Math.max(2, Math.min(stepX * 0.7, 14));

  const linePoints = buckets
    .map((b, i) => {
      const x = dims.padX + stepX * i;
      const y = dims.padY + innerH - (b.revenueNgn / maxRevenue) * innerH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const totalRevenue = buckets.reduce((sum, b) => sum + b.revenueNgn, 0);
  const totalDownloads = buckets.reduce((sum, b) => sum + b.downloads, 0);

  return (
    <div>
      <svg
        viewBox={`0 0 ${dims.w} ${dims.h}`}
        className="h-40 w-full"
        preserveAspectRatio="none"
        aria-label="Daily revenue and downloads"
      >
        {/* Download bars */}
        {buckets.map((b, i) => {
          const x = dims.padX + stepX * i - barW / 2;
          const h = (b.downloads / maxDownloads) * innerH;
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
        {/* Revenue line */}
        <polyline
          fill="none"
          strokeWidth={2}
          className="stroke-emerald-500"
          points={linePoints}
        />
        {/* Revenue points */}
        {buckets.map((b, i) => {
          const x = dims.padX + stepX * i;
          const y = dims.padY + innerH - (b.revenueNgn / maxRevenue) * innerH;
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
        <span>{buckets[0]?.date ?? ""}</span>
        <span>
          {totalDownloads.toLocaleString()} downloads · {formatNgn(totalRevenue)} earned
        </span>
        <span>{buckets[buckets.length - 1]?.date ?? ""}</span>
      </div>
    </div>
  );
}
