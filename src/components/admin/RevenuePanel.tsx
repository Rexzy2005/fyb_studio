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
      <div className="rounded-xl border border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.08)] p-4 text-sm text-danger dark:border-[rgba(239,68,68,0.28)] dark:bg-red-950/40 dark:text-danger">
        {error}
      </div>
    );
  }

  return (
    <section className="space-y-4 sm:space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink-faint dark:text-ink-faint">
            <span aria-hidden className="inline-block h-px w-5 bg-[var(--accent-blue)] opacity-60" />
            Revenue
          </div>
          <h2 className="mt-1 text-base font-semibold tracking-tight text-ink sm:text-lg dark:text-ink">
            Revenue &amp; downloads
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-muted sm:text-[13px] dark:text-ink-muted">
            Paystack-confirmed earnings and customer download activity.
          </p>
        </div>
        {data ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface-1 px-3 py-1 text-[10.5px] font-semibold uppercase tracking-wider text-ink-muted dark:border-hairline dark:bg-surface-1 dark:text-ink-muted">
            <span
              aria-hidden
              className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent-blue)]"
            />
            30 days · {formatNgn(data.summary.last30Days.revenueNgn)}
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
        <div className="rounded-2xl border border-hairline bg-surface-1 p-4 lg:col-span-2 dark:border-hairline dark:bg-surface-1">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted dark:text-ink-muted">
              Last 30 days
            </div>
            <div className="flex items-center gap-3 text-[11px] text-ink-muted dark:text-ink-faint">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-3 rounded-full bg-[var(--accent-blue)]" /> Revenue
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-3 rounded-full bg-ink-faint" /> Downloads
              </span>
            </div>
          </div>
          {loading || !data ? (
            <div className="h-40 rounded-xl bg-canvas dark:bg-surface-2/40" />
          ) : (
            <DailyChart buckets={data.daily} />
          )}
        </div>

        <div className="rounded-2xl border border-hairline bg-surface-1 p-4 dark:border-hairline dark:bg-surface-1">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted dark:text-ink-muted">
            Top earners
          </div>
          {loading || !data ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="fyb-skeleton h-9 rounded-lg" />
              ))}
            </div>
          ) : data.topTemplates.length === 0 ? (
            <div className="text-xs text-ink-faint dark:text-ink-faint">No paid downloads yet.</div>
          ) : (
            <ul className="space-y-2">
              {data.topTemplates.map((t) => (
                <li
                  key={t.templateId}
                  className="flex items-center justify-between gap-3 rounded-lg border border-hairline-soft px-3 py-2 dark:border-hairline"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-ink dark:text-ink">
                      {t.templateName}
                    </div>
                    <div className="text-[11px] text-ink-faint dark:text-ink-faint">
                      {t.payments.toLocaleString()} payments · {t.downloads.toLocaleString()} downloads
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-[var(--accent-blue)] dark:text-[var(--accent-blue)]">
                    {formatNgn(t.revenueNgn)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Recent payments table */}
      <div className="rounded-2xl border border-hairline bg-surface-1 dark:border-hairline dark:bg-surface-1">
        <div className="border-b border-hairline px-4 py-3 dark:border-hairline">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted dark:text-ink-muted">
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
          <div className="px-4 py-6 text-sm text-ink-faint dark:text-ink-faint">
            No payments yet - this fills in once your first user buys a download.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-ink-faint dark:text-ink-faint">
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
                  <tr key={p.id} className="hover:bg-canvas/60 dark:hover:bg-surface-2/30">
                    <td className="px-4 py-2 text-xs text-ink-muted dark:text-ink-faint">
                      {formatDate(p.paidAt ?? p.createdAt)}
                    </td>
                    <td className="px-4 py-2">
                      <div className="text-sm text-ink dark:text-ink">
                        {p.userName ?? "-"}
                      </div>
                      <div className="text-[11px] text-ink-faint dark:text-ink-faint">
                        {p.userEmail ?? ""}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-sm text-ink dark:text-ink">
                      {p.templateName ?? "(deleted)"}
                    </td>
                    <td className="px-4 py-2 font-medium text-ink dark:text-ink">
                      {formatNgn(p.amountNgn)}
                    </td>
                    <td className="px-4 py-2">
                      <StatusPill status={p.status} />
                    </td>
                    <td className="px-4 py-2">
                      <span className="font-mono text-[11px] text-ink-faint dark:text-ink-faint">
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
    <div className="rounded-2xl border border-hairline bg-surface-1 p-3 transition-all hover:-translate-y-0.5 hover:shadow-sm sm:p-4 dark:border-hairline dark:bg-surface-1">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint sm:text-[10.5px] dark:text-ink-faint">
        {label}
      </div>
      <div className="mt-1 truncate text-xl font-semibold tracking-tight text-ink sm:text-2xl dark:text-ink">
        {value}
      </div>
      {sub ? (
        <div className="mt-0.5 truncate text-[10.5px] text-ink-muted sm:text-[11.5px] dark:text-ink-muted">{sub}</div>
      ) : null}
    </div>
  );
}

function StatusPill({ status }: { status: RecentPaymentRow["status"] }) {
  const map: Record<RecentPaymentRow["status"], string> = {
    success:
      "border-[rgba(0,153,255,0.28)] bg-[var(--accent-blue-soft)] text-[var(--accent-blue)] dark:border-[rgba(0,153,255,0.28)] dark:bg-[var(--accent-blue-soft)] dark:text-[var(--accent-blue)]",
    pending:
      "border-[rgba(245,158,11,0.28)] bg-[rgba(245,158,11,0.08)] text-warning dark:border-[rgba(245,158,11,0.28)] dark:bg-[rgba(245,158,11,0.12)] dark:text-warning",
    failed:
      "border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.08)] text-danger dark:border-[rgba(239,68,68,0.28)] dark:bg-[rgba(239,68,68,0.12)] dark:text-danger",
    abandoned:
      "border-hairline bg-canvas text-ink-muted dark:border-hairline dark:bg-surface-1/30 dark:text-ink-faint",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wide ${map[status]}`}>
      {status}
    </span>
  );
}

/**
 * Inline SVG bar+line chart - keeps the bundle small (no chart lib) and
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
          className="stroke-[var(--accent-blue)]"
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
              className="fill-[var(--accent-blue)]"
            />
          );
        })}
      </svg>
      <div className="mt-2 flex items-center justify-between text-[11px] text-ink-faint dark:text-ink-faint">
        <span>{buckets[0]?.date ?? ""}</span>
        <span>
          {totalDownloads.toLocaleString()} downloads · {formatNgn(totalRevenue)} earned
        </span>
        <span>{buckets[buckets.length - 1]?.date ?? ""}</span>
      </div>
    </div>
  );
}
