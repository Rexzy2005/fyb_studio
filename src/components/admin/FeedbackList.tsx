"use client";

import { useState } from "react";

import {
  FEEDBACK_CATEGORY_LABELS,
  type FeedbackCategoryKey,
} from "@/lib/api/feedback";
import type { FeedbackRow } from "@/backend/services/feedback.service";

type Status = "new" | "reviewed" | "actioned" | "archived";

const STATUS_ORDER: Status[] = ["new", "reviewed", "actioned", "archived"];

const STATUS_CLASSES: Record<Status, string> = {
  new:
    "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200",
  reviewed:
    "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-200",
  actioned:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200",
  archived:
    "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900/30 dark:text-zinc-400",
};

type Props = {
  rows: FeedbackRow[];
  loading: boolean;
  onUpdated: (row: FeedbackRow) => void;
};

export function FeedbackList({ rows, loading, onUpdated }: Props) {
  if (loading) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="fyb-skeleton h-20 rounded-2xl" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
        No feedback yet. Once users start submitting, their responses will land here.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {rows.map((row) => (
        <FeedbackItem key={row.id} row={row} onUpdated={onUpdated} />
      ))}
    </ul>
  );
}

function FeedbackItem({
  row,
  onUpdated,
}: {
  row: FeedbackRow;
  onUpdated: (row: FeedbackRow) => void;
}) {
  const [notes, setNotes] = useState(row.adminNotes);
  const [editingNotes, setEditingNotes] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const [savingStatus, setSavingStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function update(body: { status?: Status; adminNotes?: string }) {
    setError(null);
    if (body.status) setSavingStatus(body.status);
    if (typeof body.adminNotes === "string") setSavingNotes(true);
    try {
      const res = await fetch(`/api/admin/feedback/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(data.error?.message ?? "Update failed");
      }
      const payload = (await res.json()) as { feedback: FeedbackRow };
      onUpdated(payload.feedback);
      if (typeof body.adminNotes === "string") setEditingNotes(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSavingStatus(null);
      setSavingNotes(false);
    }
  }

  return (
    <li className="px-4 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        <div className="flex shrink-0 flex-col items-center gap-1 sm:w-24">
          <div className="text-3xl leading-none" aria-hidden>
            {emojiForRating(row.rating)}
          </div>
          <div className="text-[11px] font-semibold tracking-wide text-zinc-500 dark:text-zinc-400">
            {row.rating}/5
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {row.user.name ?? row.user.email ?? "Unknown user"}
              </div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {row.user.email ?? ""}
                {row.user.email && row.context.page ? " · " : ""}
                {row.context.page ?? ""}
                {" · "}
                {formatDate(row.createdAt)}
              </div>
            </div>
            <span
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wide ${STATUS_CLASSES[row.status]}`}
            >
              {row.status}
            </span>
          </div>

          {row.message ? (
            <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
              {row.message}
            </p>
          ) : (
            <p className="text-sm italic text-zinc-400 dark:text-zinc-500">
              No written comment.
            </p>
          )}

          {row.categories.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {row.categories.map((c) => (
                <span
                  key={c}
                  className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-200"
                >
                  {FEEDBACK_CATEGORY_LABELS[c as FeedbackCategoryKey] ?? c}
                </span>
              ))}
            </div>
          ) : null}

          {/* Triage controls */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {STATUS_ORDER.map((s) => {
              const isCurrent = row.status === s;
              const isSaving = savingStatus === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => !isCurrent && void update({ status: s })}
                  disabled={isCurrent || savingStatus !== null}
                  className={
                    "inline-flex h-7 items-center justify-center rounded-lg border px-2 text-[11px] font-medium transition disabled:cursor-not-allowed " +
                    (isCurrent
                      ? STATUS_CLASSES[s]
                      : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-300 dark:hover:bg-zinc-800")
                  }
                >
                  {isSaving ? "…" : s}
                </button>
              );
            })}
          </div>

          {/* Admin notes */}
          {editingNotes ? (
            <div className="space-y-2">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, 4000))}
                rows={3}
                placeholder="Internal notes…"
                className="w-full resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:border-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-100"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setNotes(row.adminNotes);
                    setEditingNotes(false);
                  }}
                  disabled={savingNotes}
                  className="inline-flex h-8 items-center rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => update({ adminNotes: notes })}
                  disabled={savingNotes}
                  className="inline-flex h-8 items-center rounded-lg bg-zinc-900 px-3 text-xs font-medium text-white transition hover:bg-zinc-800 disabled:opacity-60 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                >
                  {savingNotes ? "Saving…" : "Save notes"}
                </button>
              </div>
            </div>
          ) : row.adminNotes ? (
            <button
              type="button"
              onClick={() => setEditingNotes(true)}
              className="block w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2 text-left text-xs italic text-zinc-700 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-300"
            >
              <span className="not-italic font-semibold">Notes:</span> {row.adminNotes}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setEditingNotes(true)}
              className="text-[11px] font-medium text-zinc-500 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              + Add internal note
            </button>
          )}

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
              {error}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function emojiForRating(rating: number): string {
  switch (rating) {
    case 5:
      return "🤩";
    case 4:
      return "🙂";
    case 3:
      return "😐";
    case 2:
      return "😕";
    default:
      return "😞";
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}
