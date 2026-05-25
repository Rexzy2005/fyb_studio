"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Cloud, FileImage, RefreshCw, Wand2 } from "lucide-react";

import type { CloudinaryStorageStats } from "@/backend/services/storage.service";

export function CloudinaryStorageCard() {
  const [stats, setStats] = useState<CloudinaryStorageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const requestIdRef = useRef(0);

  const loadStats = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/storage/cloudinary", { cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(body.error?.message ?? `Request failed (${res.status})`);
      }
      const payload = (await res.json()) as { stats: CloudinaryStorageStats };
      if (requestIdRef.current !== requestId) return;
      setStats(payload.stats);
      setLastCheckedAt(new Date());
    } catch (e) {
      if (requestIdRef.current !== requestId) return;
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      if (requestIdRef.current === requestId) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  if (error && !stats) {
    return (
      <div className="rounded-2xl border border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.08)] p-4 text-sm text-danger dark:border-[rgba(239,68,68,0.28)] dark:bg-red-950/40 dark:text-danger">
        <div className="font-semibold">Couldn&apos;t load Cloudinary stats</div>
        <div className="mt-1 text-xs text-danger/80">{error}</div>
        <button
          type="button"
          onClick={() => void loadStats()}
          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[rgba(239,68,68,0.28)] px-3 py-1.5 text-xs font-semibold text-danger transition hover:bg-[rgba(239,68,68,0.08)]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </button>
      </div>
    );
  }

  const percent = stats?.percentUsed ?? 0;
  const usedBytes = stats?.usedBytes ?? 0;
  const quotaBytes = stats?.quotaBytes ?? null;
  const remainingBytes = stats?.remainingBytes ?? null;
  const hasQuota = quotaBytes !== null && quotaBytes > 0;

  let barColor = "bg-[rgb(34,197,94)]";
  let pillBg = "bg-[rgba(34,197,94,0.10)]";
  let pillText = "text-[rgb(34,197,94)]";
  let statusLabel = "Healthy";
  if (!hasQuota && !loading) {
    barColor = "bg-[var(--accent-blue)]";
    pillBg = "bg-[var(--accent-blue-soft)]";
    pillText = "text-[var(--accent-blue)]";
    statusLabel = "Tracking";
  } else if (percent >= 90) {
    barColor = "bg-danger";
    pillBg = "bg-[rgba(239,68,68,0.10)]";
    pillText = "text-danger";
    statusLabel = "Critical";
  } else if (percent >= 70) {
    barColor = "bg-warning";
    pillBg = "bg-[rgba(245,158,11,0.10)]";
    pillText = "text-warning";
    statusLabel = "Watch";
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-hairline bg-surface-1 dark:border-hairline dark:bg-surface-1">
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-(--accent-blue-soft) text-accent-blue dark:bg-(--accent-blue-soft) dark:text-accent-blue">
              <Cloud className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint dark:text-ink-faint">
                Media usage
              </div>
              <div className="text-sm font-semibold text-ink dark:text-ink">
                Cloudinary storage
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wider ${pillBg} ${pillText}`}
            >
              <span aria-hidden className={`inline-block h-1.5 w-1.5 rounded-full ${barColor}`} />
              {loading ? "…" : statusLabel}
            </span>
            <button
              type="button"
              onClick={() => void loadStats()}
              disabled={loading}
              aria-label="Refresh Cloudinary storage usage"
              title="Refresh Cloudinary storage usage"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-hairline text-ink-muted transition hover:bg-canvas hover:text-ink disabled:cursor-wait disabled:opacity-60 dark:border-hairline dark:text-ink-muted dark:hover:bg-surface-2 dark:hover:text-ink"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl dark:text-ink tabular-nums">
            {loading ? "…" : formatBytes(usedBytes)}
          </span>
          <span className="text-sm text-ink-faint dark:text-ink-faint">
            {loading
              ? "checking quota"
              : hasQuota
                ? `of ${formatBytes(quotaBytes)} used`
                : "used, quota not reported"}
          </span>
        </div>

        <div
          className="mt-3 h-2 w-full overflow-hidden rounded-full bg-canvas dark:bg-surface-2"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={hasQuota ? Math.round(percent) : 0}
          aria-valuetext={hasQuota ? undefined : "Quota not reported by Cloudinary"}
          aria-label="Cloudinary storage usage"
        >
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${barColor}`}
            style={{
              opacity: hasQuota || loading ? 1 : 0.35,
              width: loading
                ? "2%"
                : hasQuota
                  ? `${Math.max(2, Math.min(100, percent))}%`
                  : "100%",
            }}
          />
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-ink-muted dark:text-ink-muted">
          <span>
            <span className="font-semibold text-ink dark:text-ink">
              {loading ? "…" : hasQuota ? `${percent.toFixed(1)}%` : "Live"}
            </span>{" "}
            {hasQuota ? "of quota" : "usage check"}
          </span>
          <span>
            <span className="font-semibold text-ink dark:text-ink">
              {loading
                ? "…"
                : hasQuota
                  ? formatBytes(remainingBytes ?? 0)
                  : stats?.plan ?? "Quota unavailable"}
            </span>{" "}
            {hasQuota ? "remaining" : stats?.plan ? "plan" : ""}
          </span>
        </div>

        {(stats?.lastUpdated || lastCheckedAt || error) ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3 text-[11px] text-ink-faint dark:border-hairline dark:text-ink-faint">
            <span>
              Cloudinary data: {stats?.lastUpdated ? formatTimestamp(stats.lastUpdated) : "latest available"}
            </span>
            <span>
              {error ? `Last refresh failed: ${error}` : lastCheckedAt ? `Checked ${formatTimestamp(lastCheckedAt)}` : null}
            </span>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 divide-x divide-hairline border-t border-hairline dark:divide-hairline dark:border-hairline">
        <Stat
          icon={<FileImage className="h-3.5 w-3.5" />}
          label="Assets"
          value={loading ? "…" : (stats?.assetCount ?? 0).toLocaleString()}
        />
        <Stat
          icon={<Wand2 className="h-3.5 w-3.5" />}
          label="Transforms"
          value={loading ? "…" : (stats?.transformationCount ?? 0).toLocaleString()}
        />
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="px-3 py-3 sm:px-4">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint dark:text-ink-faint">
        <span className="text-accent-blue">{icon}</span>
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-semibold tracking-tight text-ink tabular-nums sm:text-base dark:text-ink">
        {value}
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exp;
  return `${value.toFixed(value >= 100 || exp === 0 ? 0 : value >= 10 ? 1 : 2)} ${units[exp]}`;
}

function formatTimestamp(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
