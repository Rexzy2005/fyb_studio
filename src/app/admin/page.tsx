"use client";

import { useEffect, useState } from "react";

import { createLocalTemplateRepository } from "@/lib/storage/templateRepo";
import type { StorageStats, TemplateMeta } from "@/lib/storage/types";
import type { UserStats } from "@/backend/services/user.service";
import { RevenuePanel } from "@/components/admin/RevenuePanel";
import { FeedbackSummaryCard } from "@/components/admin/FeedbackSummaryCard";

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<TemplateMeta[]>([]);
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const repo = createLocalTemplateRepository();

    (async () => {
      try {
        setLoading(true);
        const [list, s, usersRes] = await Promise.all([
          repo.listMeta(),
          repo.getStats(),
          fetch("/api/admin/users/stats", { cache: "no-store" }),
        ]);
        setMeta(list);
        setStats(s);
        if (usersRes.ok) {
          const data = (await usersRes.json()) as { stats: UserStats };
          setUserStats(data.stats);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-ink dark:text-ink">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-ink-muted dark:text-ink-muted">
          Template overview and local storage usage.
        </p>
      </header>

      {error ? (
        <div className="rounded-xl border border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.08)] p-4 text-sm text-danger dark:border-[rgba(239,68,68,0.28)] dark:bg-red-950/40 dark:text-danger">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total users" value={userStats?.total ?? (loading ? "…" : 0)} />
        <StatCard label="Onboarded" value={userStats?.onboarded ?? (loading ? "…" : 0)} />
        <StatCard label="Pending onboarding" value={userStats?.pending ?? (loading ? "…" : 0)} />
        <StatCard label="Department heads" value={userStats?.departmentHeads ?? (loading ? "…" : 0)} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Templates" value={stats?.templates ?? (loading ? "…" : 0)} />
        <StatCard label="Published" value={stats?.published ?? (loading ? "…" : 0)} />
        <StatCard label="Drafts" value={stats?.drafts ?? (loading ? "…" : 0)} />
      </div>

      {/* Revenue & downloads - its own self-contained panel that fetches
          /api/admin/revenue. Keeps the dashboard's other cards independent
          so a temporary payments outage doesn't block the rest of the page. */}
      <RevenuePanel />

      {/* User feedback summary - at-a-glance metrics with a deep link to the
          dedicated /admin/feedback page for triage. */}
      <FeedbackSummaryCard />

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Design JSON (approx)"
          value={stats ? formatBytes(stats.totalBytesDesign) : loading ? "…" : "0 B"}
        />
        <StatCard
          label="Preview images (approx)"
          value={stats ? formatBytes(stats.totalBytesPreview) : loading ? "…" : "0 B"}
        />
      </div>

      <div className="rounded-2xl border border-hairline bg-surface-1 dark:border-hairline dark:bg-surface-1">
        <div className="border-b border-hairline px-4 py-3 dark:border-hairline">
          <div className="text-sm font-medium text-ink dark:text-ink">Recent Templates</div>
        </div>
        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {loading ? (
            <div className="px-4 py-4 text-sm text-ink-muted dark:text-ink-muted">Loading…</div>
          ) : meta.length === 0 ? (
            <div className="px-4 py-4 text-sm text-ink-muted dark:text-ink-muted">
              No templates yet.
            </div>
          ) : (
            meta.slice(0, 8).map((t) => (
              <div key={t.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-ink dark:text-ink">{t.name}</div>
                  <div className="text-xs text-ink-muted dark:text-ink-muted">Updated {formatDate(t.updatedAt)}</div>
                </div>
                <div className="text-xs text-ink-muted dark:text-ink-muted">{t.status}</div>
              </div>
            ))
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl border border-hairline bg-surface-1 p-4 dark:border-hairline dark:bg-surface-1">
      <div className="text-xs text-ink-muted dark:text-ink-muted">{label}</div>
      <div className="mt-1 text-lg font-semibold text-ink dark:text-ink">{value}</div>
    </div>
  );
}


function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exp;
  return `${value.toFixed(value >= 10 || exp === 0 ? 0 : 1)} ${units[exp]}`;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}
