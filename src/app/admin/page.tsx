"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Crown,
  Database,
  FileImage,
  FileText,
  GraduationCap,
  Hourglass,
  LayoutGrid,
  Send,
  UserCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

import { createLocalTemplateRepository } from "@/lib/storage/templateRepo";
import type { StorageStats, TemplateMeta } from "@/lib/storage/types";
import type { UserStats } from "@/backend/services/user.service";
import { RevenuePanel } from "@/components/admin/RevenuePanel";
import { FeedbackSummaryCard } from "@/components/admin/FeedbackSummaryCard";
import { DatabaseStorageCard } from "@/components/admin/DatabaseStorageCard";

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
    <div className="h-full overflow-y-auto bg-canvas/40 dark:bg-canvas/40">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
        {/* ═══════════════════════ PAGE HEADER ═══════════════════════ */}
        <header className="mb-8 sm:mb-10">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-faint dark:text-ink-faint">
            <span className="relative inline-flex h-1.5 w-1.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-[var(--accent-blue)] opacity-60" />
              <span className="relative inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent-blue)]" />
            </span>
            Live · Admin overview
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl dark:text-ink">
            Dashboard
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted dark:text-ink-muted">
            Audience, library, revenue and storage at a glance. Every card
            below links into a dedicated page for the deep dive.
          </p>
        </header>

        {error ? (
          <div className="mb-6 rounded-xl border border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.08)] p-4 text-sm text-danger dark:border-[rgba(239,68,68,0.28)] dark:bg-red-950/40 dark:text-danger">
            {error}
          </div>
        ) : null}

        <div className="space-y-8 sm:space-y-10">
          {/* ═════════════════════════ PEOPLE ════════════════════════ */}
          <Section
            eyebrow="People"
            title="Your audience"
            subtitle="Sign-ups, onboarding status, and the heads driving each department."
            cta={{ href: "/admin/users", label: "Open users" }}
          >
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              <StatCard
                icon={Users}
                accent="blue"
                label="Total users"
                value={userStats?.total ?? (loading ? "…" : 0)}
                sub="All accounts"
              />
              <StatCard
                icon={UserCheck}
                accent="green"
                label="Onboarded"
                value={userStats?.onboarded ?? (loading ? "…" : 0)}
                sub="Ready to design"
              />
              <StatCard
                icon={Hourglass}
                accent="amber"
                label="Pending"
                value={userStats?.pending ?? (loading ? "…" : 0)}
                sub="Started, not done"
              />
              <StatCard
                icon={Crown}
                accent="purple"
                label="Dept. heads"
                value={userStats?.departmentHeads ?? (loading ? "…" : 0)}
                sub="Reserving for class"
              />
            </div>
          </Section>

          {/* ═══════════════════════ LIBRARY ═════════════════════════ */}
          <Section
            eyebrow="Library"
            title="Templates"
            subtitle="Local drafts in this browser plus templates published to all users."
            cta={{ href: "/admin/templates", label: "Open library" }}
          >
            {/* Mobile: 2-up with the third card spanning the full row so
                the trio reads as "two primaries + one summary". Tablet+
                falls back to a balanced 3-up layout. */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
              <StatCard
                icon={LayoutGrid}
                accent="blue"
                label="Templates"
                value={stats?.templates ?? (loading ? "…" : 0)}
                sub="All sources"
              />
              <StatCard
                icon={Send}
                accent="green"
                label="Published"
                value={stats?.published ?? (loading ? "…" : 0)}
                sub="Live to users"
              />
              <div className="col-span-2 sm:col-span-1">
                <StatCard
                  icon={FileText}
                  accent="amber"
                  label="Drafts"
                  value={stats?.drafts ?? (loading ? "…" : 0)}
                  sub="Local only"
                />
              </div>
            </div>
          </Section>

          {/* ═══════════════════════ REVENUE ═════════════════════════ */}
          {/* Revenue & downloads - its own self-contained panel that fetches
              /api/admin/revenue. Keeps the dashboard's other cards
              independent so a temporary payments outage doesn't block the
              rest of the page. */}
          <RevenuePanel />

          {/* ═══════════════════════ FEEDBACK ════════════════════════ */}
          <FeedbackSummaryCard />

          {/* ═══════════════════════ STORAGE ═════════════════════════ */}
          <Section
            eyebrow="Storage"
            title="Storage & footprint"
            subtitle="MongoDB cluster usage and the local IndexedDB cache this browser keeps for drafts."
          >
            <div className="grid grid-cols-1 gap-3 sm:gap-4">
              {/* Live MongoDB usage with a quota progress bar */}
              <DatabaseStorageCard />

              {/* Local IndexedDB cache (per-browser, not server) */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                <StatCard
                  icon={Database}
                  accent="blue"
                  label="Design JSON (local)"
                  value={stats ? formatBytes(stats.totalBytesDesign) : loading ? "…" : "0 B"}
                  sub="Editor + draft cache"
                />
                <StatCard
                  icon={FileImage}
                  accent="purple"
                  label="Preview images (local)"
                  value={stats ? formatBytes(stats.totalBytesPreview) : loading ? "…" : "0 B"}
                  sub="Thumbnail cache"
                />
              </div>
            </div>
          </Section>

          {/* ═══════════════════════ ACTIVITY ════════════════════════ */}
          <Section
            eyebrow="Activity"
            title="Recent templates"
            subtitle="Latest drafts and published edits across the team."
            cta={{ href: "/admin/templates", label: "See all" }}
          >
            <RecentTemplatesList loading={loading} rows={meta.slice(0, 8)} />
          </Section>
        </div>
      </div>
    </div>
  );
}

/* ─── Building blocks ───────────────────────────────────── */

function Section({
  eyebrow,
  title,
  subtitle,
  cta,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  cta?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section>
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3 sm:mb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.22em] text-ink-faint dark:text-ink-faint">
            <span aria-hidden className="inline-block h-px w-5 bg-[var(--accent-blue)] opacity-60" />
            {eyebrow}
          </div>
          <h2 className="mt-1 text-base font-semibold tracking-tight text-ink sm:text-lg dark:text-ink">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-muted sm:text-[13px] dark:text-ink-muted">
              {subtitle}
            </p>
          ) : null}
        </div>
        {cta ? (
          <Link
            href={cta.href}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-hairline bg-surface-1 px-3 text-xs font-medium text-ink-muted transition hover:bg-canvas hover:text-ink active:scale-95 dark:border-hairline dark:bg-surface-1 dark:text-ink-muted dark:hover:bg-surface-2 dark:hover:text-ink"
          >
            {cta.label}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </header>
      {children}
    </section>
  );
}

type Accent = "blue" | "green" | "amber" | "purple" | "red";

const ACCENT_STYLES: Record<
  Accent,
  { bg: string; text: string; stripe: string }
> = {
  blue: {
    bg: "bg-[var(--accent-blue-soft)]",
    text: "text-[var(--accent-blue)]",
    stripe: "from-[var(--accent-blue)]",
  },
  green: {
    bg: "bg-[rgba(34,197,94,0.10)]",
    text: "text-[rgb(34,197,94)]",
    stripe: "from-[rgb(34,197,94)]",
  },
  amber: {
    bg: "bg-[rgba(245,158,11,0.10)]",
    text: "text-warning",
    stripe: "from-warning",
  },
  purple: {
    bg: "bg-[rgba(168,85,247,0.10)]",
    text: "text-[rgb(168,85,247)]",
    stripe: "from-[rgb(168,85,247)]",
  },
  red: {
    bg: "bg-[rgba(239,68,68,0.10)]",
    text: "text-danger",
    stripe: "from-danger",
  },
};

function StatCard({
  icon: Icon,
  accent,
  label,
  value,
  sub,
}: {
  icon: LucideIcon;
  accent: Accent;
  label: string;
  value: string | number;
  sub?: string;
}) {
  const a = ACCENT_STYLES[accent];
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-hairline bg-surface-1 p-3 transition-all hover:-translate-y-0.5 hover:border-hairline hover:shadow-sm sm:p-4 dark:border-hairline dark:bg-surface-1">
      {/* Accent top stripe - subtle, only on hover for restraint. */}
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r ${a.stripe} via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100`}
      />
      <div className="flex items-start justify-between gap-2">
        <span
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${a.bg} ${a.text}`}
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
      </div>
      <div className="mt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint sm:text-[10.5px] dark:text-ink-faint">
        {label}
      </div>
      <div className="mt-1 truncate text-xl font-semibold tracking-tight text-ink sm:text-2xl dark:text-ink">
        {value}
      </div>
      {sub ? (
        <div className="mt-0.5 truncate text-[10.5px] text-ink-muted sm:text-[11.5px] dark:text-ink-muted">
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function RecentTemplatesList({
  loading,
  rows,
}: {
  loading: boolean;
  rows: TemplateMeta[];
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-hairline bg-surface-1 dark:border-hairline dark:bg-surface-1">
      {loading ? (
        <div className="divide-y divide-hairline dark:divide-hairline">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <div className="fyb-skeleton h-9 w-9 rounded-xl" />
              <div className="flex-1 space-y-2">
                <div className="fyb-skeleton h-3 w-1/3 rounded-full" />
                <div className="fyb-skeleton h-2.5 w-1/4 rounded-full" />
              </div>
              <div className="fyb-skeleton h-5 w-14 rounded-full" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-ink-faint dark:bg-surface-2">
            <GraduationCap className="h-5 w-5" />
          </span>
          <div className="text-sm font-medium text-ink dark:text-ink">No templates yet</div>
          <div className="max-w-xs text-xs text-ink-muted dark:text-ink-muted">
            Create the first one to see it land here, then publish to share with users.
          </div>
          <Link
            href="/admin/templates/new"
            className="mt-1 inline-flex h-9 items-center gap-1.5 rounded-xl bg-[var(--accent-blue)] px-3 text-xs font-semibold text-white transition hover:opacity-90 active:scale-95"
          >
            New template
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-hairline dark:divide-hairline">
          {rows.map((t) => (
            <li
              key={t.id}
              className="group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-canvas sm:px-4 sm:py-3 dark:hover:bg-surface-2/40"
            >
              <span
                aria-hidden
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-canvas text-ink-muted dark:bg-surface-2 dark:text-ink-muted"
              >
                <FileText className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink dark:text-ink">
                  {t.name}
                </div>
                <div className="truncate text-[11.5px] text-ink-faint dark:text-ink-faint">
                  Updated {formatDate(t.updatedAt)}
                </div>
              </div>
              <StatusPill status={t.status} />
              <Link
                href={`/admin/templates/${t.id}`}
                aria-label={`Open ${t.name}`}
                className="hidden shrink-0 items-center justify-center rounded-lg p-1.5 text-ink-faint transition group-hover:text-ink sm:inline-flex"
              >
                <ArrowRight className="h-4 w-4" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const lower = status.toLowerCase();
  const published = lower === "published";
  return (
    <span
      className={
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide " +
        (published
          ? "border-[rgba(0,153,255,0.28)] bg-[var(--accent-blue-soft)] text-[var(--accent-blue)] dark:border-[rgba(0,153,255,0.28)] dark:bg-[var(--accent-blue-soft)] dark:text-[var(--accent-blue)]"
          : "border-[rgba(245,158,11,0.28)] bg-[rgba(245,158,11,0.10)] text-warning dark:border-[rgba(245,158,11,0.28)] dark:bg-[rgba(245,158,11,0.12)] dark:text-warning")
      }
    >
      <span
        aria-hidden
        className={
          "h-1.5 w-1.5 rounded-full " +
          (published ? "bg-[var(--accent-blue)]" : "bg-warning")
        }
      />
      {status}
    </span>
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
