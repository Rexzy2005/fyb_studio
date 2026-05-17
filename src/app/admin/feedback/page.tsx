"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  FEEDBACK_CATEGORY_KEYS,
  FEEDBACK_CATEGORY_LABELS,
  type FeedbackCategoryKey,
} from "@/lib/api/feedback";
import { FeedbackStatsPanel } from "@/components/admin/FeedbackStatsPanel";
import { FeedbackList } from "@/components/admin/FeedbackList";
import type { FeedbackRow } from "@/backend/services/feedback.service";

type ListResponse = {
  rows: FeedbackRow[];
  nextCursor: string | null;
};

type StatusFilter = "all" | "new" | "reviewed" | "actioned" | "archived";

export default function AdminFeedbackPage() {
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState<StatusFilter>("all");
  const [rating, setRating] = useState<number | "all">("all");
  const [category, setCategory] = useState<FeedbackCategoryKey | "all">("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (rating !== "all") params.set("rating", String(rating));
    if (category !== "all") params.set("category", category);
    if (debouncedSearch) params.set("search", debouncedSearch);
    return params.toString();
  }, [status, rating, category, debouncedSearch]);

  const load = useCallback(
    async (cursor?: string | null) => {
      const isInitial = !cursor;
      try {
        if (isInitial) setLoading(true);
        else setLoadingMore(true);
        setError(null);

        const params = new URLSearchParams(queryString);
        if (cursor) params.set("cursor", cursor);
        const res = await fetch(`/api/admin/feedback?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: { message?: string };
          };
          throw new Error(body.error?.message ?? `Request failed (${res.status})`);
        }
        const payload = (await res.json()) as ListResponse;
        setRows((prev) => (isInitial ? payload.rows : [...prev, ...payload.rows]));
        setNextCursor(payload.nextCursor);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        if (isInitial) setLoading(false);
        else setLoadingMore(false);
      }
    },
    [queryString]
  );

  useEffect(() => {
    load();
  }, [load]);

  function handleRowUpdated(updated: FeedbackRow) {
    setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }

  return (
    <div className="h-full overflow-y-auto bg-canvas/40 dark:bg-canvas/40">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-ink dark:text-ink">
            User feedback
          </h1>
          <p className="mt-1 text-sm text-ink-muted dark:text-ink-faint">
            Surveys + free-text feedback collected from across the product. Use the
            stats to spot trends, then triage individual replies in the table below.
          </p>
        </header>

        <FeedbackStatsPanel />

        <section className="mt-6 rounded-2xl border border-hairline bg-surface-1 dark:border-hairline dark:bg-surface-1">
          <header className="flex flex-col gap-3 border-b border-hairline px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-hairline">
            <div>
              <div className="text-sm font-semibold text-ink dark:text-ink">
                All feedback
              </div>
              <div className="text-xs text-ink-muted dark:text-ink-faint">
                {rows.length.toLocaleString()} loaded · cursor-paginated
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={status}
                onChange={(v) => setStatus(v as StatusFilter)}
                options={[
                  { value: "all", label: "All statuses" },
                  { value: "new", label: "New" },
                  { value: "reviewed", label: "Reviewed" },
                  { value: "actioned", label: "Actioned" },
                  { value: "archived", label: "Archived" },
                ]}
              />
              <Select
                value={String(rating)}
                onChange={(v) => setRating(v === "all" ? "all" : Number(v))}
                options={[
                  { value: "all", label: "Any rating" },
                  { value: "1", label: "★ 1 only" },
                  { value: "2", label: "★ 2 only" },
                  { value: "3", label: "★ 3 only" },
                  { value: "4", label: "★ 4 only" },
                  { value: "5", label: "★ 5 only" },
                ]}
              />
              <Select
                value={category}
                onChange={(v) => setCategory(v as FeedbackCategoryKey | "all")}
                options={[
                  { value: "all", label: "All topics" },
                  ...FEEDBACK_CATEGORY_KEYS.map((k) => ({
                    value: k,
                    label: FEEDBACK_CATEGORY_LABELS[k],
                  })),
                ]}
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search messages…"
                className="h-9 w-44 rounded-xl border border-hairline bg-surface-1 px-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--accent-blue-ring)] dark:border-hairline dark:bg-surface-1"
              />
            </div>
          </header>

          {error ? (
            <div className="m-4 rounded-xl border border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.08)] px-3 py-2 text-sm text-danger dark:border-[rgba(239,68,68,0.28)] dark:bg-[rgba(239,68,68,0.12)] dark:text-danger">
              {error}
            </div>
          ) : null}

          <FeedbackList
            rows={rows}
            loading={loading}
            onUpdated={handleRowUpdated}
          />

          {nextCursor && !loading ? (
            <div className="border-t border-hairline px-4 py-3 text-center dark:border-hairline">
              <button
                type="button"
                onClick={() => load(nextCursor)}
                disabled={loadingMore}
                className="inline-flex h-9 items-center justify-center rounded-xl border border-hairline bg-surface-1 px-4 text-sm font-medium text-ink transition hover:bg-canvas disabled:opacity-50 dark:border-hairline dark:bg-surface-1 dark:text-ink"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-xl border border-hairline bg-surface-1 px-3 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--accent-blue-ring)] dark:border-hairline dark:bg-surface-1"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
