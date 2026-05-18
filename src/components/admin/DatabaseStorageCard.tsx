"use client";

import { useEffect, useState } from "react";
import { Database, FileBox, FileBarChart2, FileText, HardDrive } from "lucide-react";

import type { DatabaseStorageStats } from "@/backend/services/storage.service";

/**
 * Live MongoDB usage gauge for the admin dashboard. Reads
 * /api/admin/storage which runs `db.stats()` against the connected
 * database and combines the result with the configured cluster quota
 * (env: MONGODB_STORAGE_QUOTA_MB, default 512 = Atlas free tier).
 *
 * Renders a usage bar that shifts colour as you approach the quota,
 * plus a breakdown of documents, collections, and indexes.
 */
export function DatabaseStorageCard() {
  const [stats, setStats] = useState<DatabaseStorageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/storage", { cache: "no-store" });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: { message?: string };
          };
          throw new Error(body.error?.message ?? `Request failed (${res.status})`);
        }
        const payload = (await res.json()) as { stats: DatabaseStorageStats };
        if (!cancelled) setStats(payload.stats);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <div className="rounded-2xl border border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.08)] p-4 text-sm text-danger dark:border-[rgba(239,68,68,0.28)] dark:bg-red-950/40 dark:text-danger">
        Couldn&apos;t load database stats: {error}
      </div>
    );
  }

  const percent = stats?.percentUsed ?? 0;
  const usedBytes = stats?.totalUsedBytes ?? 0;
  const quotaBytes = stats?.quotaBytes ?? 0;
  const remainingBytes = stats?.remainingBytes ?? 0;

  // Bar colour ramps from green → amber → red as we eat the quota.
  let barColor = "bg-[rgb(34,197,94)]";
  let pillBg = "bg-[rgba(34,197,94,0.10)]";
  let pillText = "text-[rgb(34,197,94)]";
  let statusLabel = "Healthy";
  if (percent >= 90) {
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
      {/* Top - primary gauge */}
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-blue-soft)] text-[var(--accent-blue)] dark:bg-[var(--accent-blue-soft)] dark:text-[var(--accent-blue)]">
              <Database className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint dark:text-ink-faint">
                Cluster usage
              </div>
              <div className="text-sm font-semibold text-ink dark:text-ink">
                MongoDB storage
              </div>
            </div>
          </div>

          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wider ${pillBg} ${pillText}`}
          >
            <span
              aria-hidden
              className={`inline-block h-1.5 w-1.5 rounded-full ${barColor}`}
            />
            {loading ? "…" : statusLabel}
          </span>
        </div>

        {/* Big used / total readout */}
        <div className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl dark:text-ink tabular-nums">
            {loading ? "…" : formatBytes(usedBytes)}
          </span>
          <span className="text-sm text-ink-faint dark:text-ink-faint">
            of {loading ? "…" : formatBytes(quotaBytes)} used
          </span>
        </div>

        {/* Progress bar */}
        <div
          className="mt-3 h-2 w-full overflow-hidden rounded-full bg-canvas dark:bg-surface-2"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(percent)}
          aria-label="Database storage usage"
        >
          <div
            className={`h-full rounded-full transition-all duration-700 ease-out ${barColor}`}
            style={{ width: `${Math.max(2, Math.min(100, percent))}%` }}
          />
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-ink-muted dark:text-ink-muted">
          <span>
            <span className="font-semibold text-ink dark:text-ink">
              {loading ? "…" : `${percent.toFixed(1)}%`}
            </span>{" "}
            of quota
          </span>
          <span>
            <span className="font-semibold text-ink dark:text-ink">
              {loading ? "…" : formatBytes(remainingBytes)}
            </span>{" "}
            remaining
          </span>
        </div>
      </div>

      {/* Bottom - breakdown grid */}
      <div className="grid grid-cols-3 divide-x divide-hairline border-t border-hairline dark:divide-hairline dark:border-hairline">
        <Stat
          icon={<FileText className="h-3.5 w-3.5" />}
          label="Documents"
          value={loading ? "…" : (stats?.documentCount ?? 0).toLocaleString()}
        />
        <Stat
          icon={<FileBox className="h-3.5 w-3.5" />}
          label="Collections"
          value={loading ? "…" : (stats?.collectionCount ?? 0).toLocaleString()}
        />
        <Stat
          icon={<FileBarChart2 className="h-3.5 w-3.5" />}
          label="Indexes"
          value={loading ? "…" : (stats?.indexCount ?? 0).toLocaleString()}
        />
      </div>

      {/* Footer microcopy */}
      <div className="flex items-center gap-1.5 border-t border-hairline px-4 py-2.5 text-[10.5px] text-ink-faint sm:px-5 dark:border-hairline dark:text-ink-faint">
        <HardDrive className="h-3 w-3" />
        Quota set via <code className="font-mono text-ink-muted dark:text-ink-muted">MONGODB_STORAGE_QUOTA_MB</code>
      </div>
    </div>
  );
}

function Stat({
  icon, label, value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="px-3 py-3 sm:px-4">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint dark:text-ink-faint">
        <span className="text-[var(--accent-blue)]">{icon}</span>
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
