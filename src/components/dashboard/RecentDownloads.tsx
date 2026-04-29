"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import {
  deleteUserDesign,
  listDownloadedDesigns,
  msUntilExpiry,
  sweepExpiredDesigns,
} from "@/lib/storage/userDesignRepo";
import type { UserDesignRecord } from "@/lib/storage/types";

type CardItem = {
  record: UserDesignRecord;
  thumbnailUrl: string | null;
};

function formatExpiresIn(ms: number): string {
  if (ms <= 0) return "expired";
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}

export function RecentDownloads() {
  const [items, setItems] = useState<CardItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    await sweepExpiredDesigns();
    const records = await listDownloadedDesigns();
    setItems((prev) => {
      // Revoke prior thumbnail URLs.
      for (const it of prev) {
        if (it.thumbnailUrl) URL.revokeObjectURL(it.thumbnailUrl);
      }
      return records.map((r) => ({
        record: r,
        thumbnailUrl: r.thumbnail ? URL.createObjectURL(r.thumbnail.blob) : null,
      }));
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    return () => {
      // Cleanup: revoke any remaining object URLs.
      setItems((prev) => {
        for (const it of prev) {
          if (it.thumbnailUrl) URL.revokeObjectURL(it.thumbnailUrl);
        }
        return [];
      });
    };
  }, [refresh]);

  async function onDelete(id: string) {
    await deleteUserDesign(id);
    await refresh();
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-4 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
        <div className="text-xs font-semibold tracking-wide">Recent downloads</div>
        <div className="mt-1 text-[11px]">Loading…</div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-4 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
        <div className="text-xs font-semibold tracking-wide">Recent downloads</div>
        <div className="mt-1 text-[11px]">
          You haven&apos;t downloaded any designs yet. Pick a template, customize it,
          and your downloads will appear here.
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="text-xs font-semibold tracking-wide text-zinc-900 dark:text-zinc-100">
            Recent downloads
          </div>
          <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
            Kept on this device for 24 hours, then cleared.
          </div>
        </div>
      </div>

      <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {items.map(({ record, thumbnailUrl }) => {
          const remainingMs = msUntilExpiry(record);
          return (
            <li
              key={record.id}
              className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950/30"
            >
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900">
                {thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumbnailUrl}
                    alt={record.name}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[10px] text-zinc-400">
                    No preview
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-zinc-950 dark:text-zinc-100">
                  {record.name}
                </div>
                <div className="mt-0.5 truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                  {record.categoryLabel} • {formatExpiresIn(remainingMs)}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <Link
                  href={`/templates/${record.templateId}/use?userDesignId=${record.id}`}
                  className="inline-flex h-8 items-center justify-center rounded-xl border border-zinc-200 bg-white px-2.5 text-[11px] font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                >
                  Edit
                </Link>
                <button
                  type="button"
                  onClick={() => onDelete(record.id)}
                  className="inline-flex h-8 items-center justify-center rounded-xl border border-red-200 bg-red-50 px-2.5 text-[11px] font-medium text-red-700 hover:bg-red-100 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200 dark:hover:bg-red-950/50"
                  aria-label={`Delete ${record.name}`}
                >
                  Delete
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
