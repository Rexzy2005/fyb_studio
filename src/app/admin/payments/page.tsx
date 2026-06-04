"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  CreditCard,
  RefreshCw,
  Search,
} from "lucide-react";

import type {
  RecentPaymentRow,
  RevenueSummary,
} from "@/backend/services/revenue.service";
import type { PaymentStatus } from "@/backend/db/models";

type PaymentsResponse = {
  summary: RevenueSummary;
  payments: RecentPaymentRow[];
};

type ApiErrorResponse = { error?: { message?: string } };

const STATUS_OPTIONS: Array<PaymentStatus | "all"> = [
  "all",
  "success",
  "pending",
  "ongoing",
  "processing",
  "queued",
  "cancelled",
  "expired",
  "timeout",
  "failed",
  "abandoned",
  "reversed",
];

const ACTIVE_STATUSES: PaymentStatus[] = [
  "pending",
  "ongoing",
  "processing",
  "queued",
];

const ATTENTION_STATUSES: PaymentStatus[] = [
  "failed",
  "abandoned",
  "cancelled",
  "expired",
  "timeout",
  "reversed",
];

function formatNgn(n: number): string {
  return `₦${n.toLocaleString()}`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function readPaymentError(res: Response): Promise<string> {
  return res
    .json()
    .then((body: ApiErrorResponse) => body.error?.message ?? `Request failed (${res.status})`)
    .catch(() => `Request failed (${res.status})`);
}

export default function AdminPaymentsPage() {
  const [data, setData] = useState<PaymentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<PaymentStatus | "all">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadPayments = useCallback(async (options: { quiet?: boolean } = {}) => {
    if (options.quiet) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/payments?limit=150", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(await readPaymentError(res));
      setData((await res.json()) as PaymentsResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load payments");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadPayments();
  }, [loadPayments]);

  const payments = useMemo(() => data?.payments ?? [], [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payments.filter((payment) => {
      if (status !== "all" && payment.status !== status) return false;
      if (!q) return true;
      return [
        payment.paystackReference,
        payment.paystackStatus ?? "",
        payment.templateName ?? "",
        payment.userName ?? "",
        payment.userEmail ?? "",
        payment.failureReason ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [payments, search, status]);

  const rowStatusCounts = useMemo(() => {
    return payments.reduce(
      (acc, payment) => {
        acc[payment.status] = (acc[payment.status] ?? 0) + 1;
        return acc;
      },
      {} as Record<PaymentStatus, number>
    );
  }, [payments]);

  const stats = useMemo(() => {
    const counts = data?.summary.paymentStatusCounts;
    const count = (items: PaymentStatus[]) =>
      items.reduce((sum, item) => sum + (counts?.[item] ?? 0), 0);
    return {
      successful: data?.summary.successfulPayments ?? 0,
      active: count(ACTIVE_STATUSES),
      attention: count(ATTENTION_STATUSES),
      totalRows: payments.length,
    };
  }, [data, payments.length]);

  const excludedRows = useMemo(
    () => payments.filter((payment) => payment.isExcludedFromRevenue).length,
    [payments]
  );

  return (
    <div className="h-full overflow-y-auto bg-canvas/40 p-4 sm:p-6 lg:p-8 dark:bg-canvas/40">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
              <CreditCard className="h-3.5 w-3.5" />
              Paystack payments
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink dark:text-ink">
              Payment history
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-muted dark:text-ink-muted">
              Monitor every checkout attempt from pending through success,
              cancellation, timeout, expiry, and Paystack failure states.
              Revenue cards exclude marked test users.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadPayments({ quiet: true })}
            disabled={refreshing || loading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-hairline bg-surface-1 px-4 text-sm font-medium text-ink-muted transition hover:bg-canvas hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 dark:border-hairline dark:bg-surface-1 dark:text-ink"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </header>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Real revenue" value={data ? formatNgn(data.summary.totalRevenueNgn) : loading ? "..." : "₦0"} />
          <Stat label="Real successful payments" value={stats.successful.toLocaleString()} tone="success" />
          <Stat label="Active attempts" value={stats.active.toLocaleString()} />
          <Stat label="Needs attention" value={stats.attention.toLocaleString()} tone={stats.attention ? "warning" : "normal"} />
        </div>

        {excludedRows > 0 ? (
          <div className="rounded-xl border border-hairline bg-surface-1 px-4 py-3 text-xs text-ink-muted dark:border-hairline dark:bg-surface-1 dark:text-ink-muted">
            {excludedRows.toLocaleString()} test payment row{excludedRows === 1 ? "" : "s"} shown below but excluded from revenue calculations.
          </div>
        ) : null}

        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="relative w-full xl:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search reference, template, user, Paystack status"
              className="h-10 w-full rounded-xl border border-hairline bg-surface-1 pl-9 pr-3 text-sm text-ink outline-none transition placeholder:text-ink-faint focus:border-accent-blue dark:border-hairline dark:bg-surface-1 dark:text-ink"
            />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 xl:max-w-3xl xl:justify-end">
            {STATUS_OPTIONS.map((option) => {
              const active = status === option;
              const label = option === "all" ? "All" : option;
              const count =
                option === "all"
                  ? stats.totalRows
                  : rowStatusCounts[option] ?? 0;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setStatus(option)}
                  className={
                    "inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border px-3 text-xs font-medium capitalize transition " +
                    (active
                      ? "border-hairline bg-surface-2 text-ink dark:border-hairline dark:bg-surface-2 dark:text-ink"
                      : "border-hairline bg-surface-1 text-ink-muted hover:bg-canvas hover:text-ink dark:border-hairline dark:bg-surface-1 dark:text-ink-muted dark:hover:bg-surface-2/60")
                  }
                >
                  {label}
                  <span className="rounded-full bg-canvas px-1.5 py-0.5 text-[10px] tabular-nums text-ink-faint dark:bg-surface-2">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.08)] p-4 text-sm text-danger dark:border-[rgba(239,68,68,0.28)] dark:bg-red-950/40 dark:text-danger">
            {error}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-2xl border border-hairline bg-surface-1 dark:border-hairline dark:bg-surface-1">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left text-sm">
              <thead className="border-b border-hairline bg-canvas text-xs uppercase tracking-wider text-ink-faint dark:border-hairline dark:bg-surface-1/60">
                <tr>
                  <th className="px-4 py-3 font-medium">Journey</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Template</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Paystack</th>
                  <th className="px-4 py-3 font-medium">Latest event</th>
                  <th className="px-4 py-3 font-medium">Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-ink-muted">
                      Loading payment history...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-ink-muted">
                      {payments.length === 0 ? "No payment attempts yet." : "No payments match your filters."}
                    </td>
                  </tr>
                ) : (
                  filtered.map((payment) => {
                    const expanded = expandedId === payment.id;
                    const journey = normalizeJourney(payment);
                    const latest = journey[journey.length - 1];
                    return (
                      <Fragment key={payment.id}>
                        <tr className="hover:bg-canvas dark:hover:bg-surface-2/40">
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => setExpandedId(expanded ? null : payment.id)}
                              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-hairline bg-surface-1 px-3 text-xs font-medium text-ink-muted transition hover:bg-canvas hover:text-ink dark:border-hairline dark:bg-surface-1 dark:text-ink"
                            >
                              {expanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                              View
                            </button>
                          </td>
                          <td className="px-4 py-3">
                            <div className="max-w-[210px]">
                              <div className="truncate font-medium text-ink dark:text-ink">
                                {payment.userName ?? "Unknown user"}
                              </div>
                              <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-ink-muted">
                                <span className="truncate">{payment.userEmail ?? "No email"}</span>
                                {payment.isExcludedFromRevenue ? (
                                  <span className="shrink-0 rounded-full border border-[rgba(245,158,11,0.28)] bg-[rgba(245,158,11,0.1)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
                                    Test
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="max-w-[220px] truncate font-medium text-ink dark:text-ink">
                              {payment.templateName ?? "(deleted template)"}
                            </div>
                            <div className="mt-1 text-xs text-ink-faint">
                              Started {formatDateTime(payment.initializedAt ?? payment.createdAt)}
                            </div>
                          </td>
                          <td className="px-4 py-3 tabular-nums text-ink dark:text-ink">
                            <div className="font-semibold">{formatNgn(payment.amountNgn)}</div>
                            {payment.isExcludedFromRevenue ? (
                              <div className="mt-1 text-[11px] text-ink-faint">
                                Excluded from revenue
                              </div>
                            ) : null}
                          </td>
                          <td className="px-4 py-3">
                            <StatusPill status={payment.status} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-sm font-medium text-ink dark:text-ink">
                              {payment.paystackStatus ?? "-"}
                            </div>
                            <div className="mt-1 text-xs text-ink-muted">
                              Verified {formatDateTime(payment.lastVerifiedAt)}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-ink-muted">
                            <div>{latest ? formatDateTime(latest.at) : "-"}</div>
                            <div className="mt-1 max-w-[220px] truncate text-xs">
                              {latest?.message ?? payment.failureReason ?? "No event message"}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <code className="rounded-lg bg-canvas px-2 py-1 text-xs text-ink-muted dark:bg-surface-2 dark:text-ink-muted">
                              {payment.paystackReference}
                            </code>
                          </td>
                        </tr>
                        {expanded ? (
                          <tr className="bg-canvas/70 dark:bg-surface-2/30">
                            <td colSpan={8} className="px-4 py-4">
                              <PaymentJourney payment={payment} journey={journey} />
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function normalizeJourney(payment: RecentPaymentRow): RecentPaymentRow["journey"] {
  const rows = payment.journey.length
    ? payment.journey
    : [
        {
          status: payment.status,
          source: "system",
          message: payment.failureReason,
          paystackStatus: payment.paystackStatus,
          at: payment.createdAt,
        },
      ];
  return [...rows].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

function PaymentJourney({
  payment,
  journey,
}: {
  payment: RecentPaymentRow;
  journey: RecentPaymentRow["journey"];
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="rounded-2xl border border-hairline bg-surface-1 p-4 dark:border-hairline dark:bg-surface-1">
        <div className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
          Payment journey
        </div>
        <div className="mt-4 space-y-3">
          {journey.map((entry, index) => (
            <div key={`${entry.at}-${index}`} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className="grid h-7 w-7 place-items-center rounded-full border border-hairline bg-canvas text-[10px] font-semibold tabular-nums text-ink-muted dark:border-hairline dark:bg-surface-2">
                  {index + 1}
                </span>
                {index < journey.length - 1 ? (
                  <span className="mt-1 h-full min-h-6 w-px bg-[var(--hairline)]" />
                ) : null}
              </div>
              <div className="min-w-0 pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status={entry.status} compact />
                  <span className="rounded-full border border-hairline bg-canvas px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-ink-muted dark:border-hairline dark:bg-surface-2">
                    {entry.source}
                  </span>
                  <span className="text-xs text-ink-faint">
                    {formatDateTime(entry.at)}
                  </span>
                </div>
                <div className="mt-1 text-sm text-ink-muted">
                  {entry.message ?? "Status changed"}
                </div>
                {entry.paystackStatus ? (
                  <div className="mt-1 text-xs text-ink-faint">
                    Paystack: {entry.paystackStatus}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-hairline bg-surface-1 p-4 dark:border-hairline dark:bg-surface-1">
        <div className="text-xs font-semibold uppercase tracking-wider text-ink-faint">
          Attempt facts
        </div>
        <dl className="mt-4 space-y-3 text-sm">
          <Fact label="Created" value={formatDateTime(payment.createdAt)} />
          <Fact label="Expires" value={formatDateTime(payment.expiresAt)} />
          <Fact label="Paid" value={formatDateTime(payment.paidAt)} />
          <Fact label="Last verified" value={formatDateTime(payment.lastVerifiedAt)} />
          <Fact label="Reason" value={payment.failureReason ?? "-"} />
        </dl>
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">
        {label}
      </dt>
      <dd className="mt-0.5 break-words text-ink-muted">{value}</dd>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "normal",
}: {
  label: string;
  value: string;
  tone?: "normal" | "success" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "warning"
        ? "text-warning"
        : "text-ink dark:text-ink";
  return (
    <div className="rounded-2xl border border-hairline bg-surface-1 p-4 dark:border-hairline dark:bg-surface-1">
      <div className="text-xs font-medium uppercase tracking-wider text-ink-faint">
        {label}
      </div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>
        {value}
      </div>
    </div>
  );
}

function StatusPill({
  status,
  compact = false,
}: {
  status: PaymentStatus;
  compact?: boolean;
}) {
  const className =
    status === "success"
      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
      : status === "pending" ||
          status === "ongoing" ||
          status === "processing" ||
          status === "queued"
        ? "border-[rgba(0,153,255,0.28)] bg-[var(--accent-blue-soft)] text-[var(--accent-blue)]"
        : status === "cancelled" || status === "expired" || status === "timeout"
          ? "border-[rgba(245,158,11,0.3)] bg-[rgba(245,158,11,0.1)] text-warning"
          : "border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.08)] text-danger";

  return (
    <span
      className={`inline-flex items-center rounded-full border font-semibold uppercase tracking-wide ${className} ${
        compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]"
      }`}
    >
      {status}
    </span>
  );
}
