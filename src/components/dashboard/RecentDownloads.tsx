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
import { Skeleton } from "@/components/ui/Skeleton";
import { ButtonLink } from "@/components/ui/Button";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { bodyMd, bodySm, caption, micro } from "@/lib/ui/typography";

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

  return (
    <section className="flex flex-col gap-7">
      <SectionHeader
        eyebrow="Library"
        title="Recent downloads"
        description="Saved on this device for 24 hours, then cleared."
        count={loading ? null : items.length}
      />

      {loading ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <li
              key={i}
              className="flex items-center gap-3 p-3"
              style={{
                background: "var(--surface-1)",
                border: "1px solid var(--hairline)",
                borderRadius: 15,
              }}
            >
              <Skeleton width={56} height={72} radius={8} />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton height={12} width="75%" radius={4} />
                <Skeleton height={10} width="50%" radius={4} />
              </div>
            </li>
          ))}
        </ul>
      ) : items.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map(({ record, thumbnailUrl }) => {
            const remainingMs = msUntilExpiry(record);
            return (
              <li
                key={record.id}
                className="flex items-center gap-3 p-3 transition"
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--hairline)",
                  borderRadius: 15,
                }}
              >
                <div
                  className="h-[80px] w-[64px] shrink-0 overflow-hidden"
                  style={{
                    background: "var(--surface-2)",
                    borderRadius: 10,
                  }}
                >
                  {thumbnailUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumbnailUrl}
                      alt={record.name}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div
                      className="flex h-full w-full items-center justify-center"
                      style={{ ...micro, color: "var(--ink-faint)" }}
                    >
                      No preview
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div
                    className="truncate"
                    style={{ ...bodySm, color: "var(--ink)", fontWeight: 600 }}
                    title={record.name}
                  >
                    {record.name}
                  </div>
                  <div
                    className="mt-1 truncate"
                    style={{ ...micro, color: "var(--ink-muted)" }}
                  >
                    {record.categoryLabel}
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Link
                      href={`/templates/${record.templateId}/use?userDesignId=${record.id}`}
                      className="inline-flex items-center justify-center transition hover:scale-[0.98]"
                      style={{
                        ...caption,
                        height: 28,
                        padding: "0 12px",
                        background: "var(--ink)",
                        color: "#000",
                        borderRadius: 100,
                      }}
                    >
                      Edit
                    </Link>
                    <span style={{ ...micro, color: "var(--ink-faint)" }}>
                      {formatExpiresIn(remainingMs)}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onDelete(record.id)}
                  aria-label={`Delete ${record.name}`}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full transition"
                  style={{
                    color: "var(--ink-faint)",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.color = "var(--semantic-danger)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.color = "var(--ink-faint)")
                  }
                >
                  <TrashIcon />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ── empty state ───────────────────────────────────────── */
function EmptyState() {
  return (
    <div
      className="flex flex-col items-start gap-4 px-7 py-9 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--hairline)",
        borderRadius: 20,
      }}
    >
      <div className="flex flex-col gap-1.5 max-w-[420px]">
        <span
          style={{ ...bodyMd, color: "var(--ink)", fontWeight: 500 }}
        >
          Nothing here yet
        </span>
        <span style={{ ...bodySm, color: "var(--ink-muted)", fontWeight: 400 }}>
          Pick a template, drop in your details, and your exports will appear here for 24 hours.
        </span>
      </div>
      <ButtonLink href="/templates" variant="primary" size="md">
        Browse templates
      </ButtonLink>
    </div>
  );
}

function TrashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}
