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
        <h1 className="text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-100">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
          Template overview and local storage usage.
        </p>
      </header>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200">
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

      {/* Revenue & downloads — its own self-contained panel that fetches
          /api/admin/revenue. Keeps the dashboard's other cards independent
          so a temporary payments outage doesn't block the rest of the page. */}
      <RevenuePanel />

      {/* User feedback summary — at-a-glance metrics with a deep link to the
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

      <div className="rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="text-sm font-medium text-zinc-950 dark:text-zinc-100">Recent Templates</div>
        </div>
        <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {loading ? (
            <div className="px-4 py-4 text-sm text-zinc-600 dark:text-zinc-300">Loading…</div>
          ) : meta.length === 0 ? (
            <div className="px-4 py-4 text-sm text-zinc-600 dark:text-zinc-300">
              No templates yet.
            </div>
          ) : (
            meta.slice(0, 8).map((t) => (
              <div key={t.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-zinc-950 dark:text-zinc-100">{t.name}</div>
                  <div className="text-xs text-zinc-600 dark:text-zinc-300">Updated {formatDate(t.updatedAt)}</div>
                </div>
                <div className="text-xs text-zinc-600 dark:text-zinc-300">{t.status}</div>
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
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-xs text-zinc-600 dark:text-zinc-300">{label}</div>
      <div className="mt-1 text-lg font-semibold text-zinc-950 dark:text-zinc-100">{value}</div>
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
