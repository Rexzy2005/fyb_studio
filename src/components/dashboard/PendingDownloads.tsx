"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { fetchPendingGrants, type PendingGrant } from "@/lib/api/payments";
import {
  listPendingDownloads,
  reconcilePendingDownloads,
  type PendingDownload,
} from "@/lib/payment/pendingDownloads";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { bodySm, caption, micro } from "@/lib/ui/typography";

type Row = {
  templateId: string;
  templateName: string;
  userDesignId: string | null;
  source: "server" | "local";
  reference: string | null;
  paidAt: string;
};

export function PendingDownloads() {
  const [serverGrants, setServerGrants] = useState<PendingGrant[] | null>(null);
  const [localEntries, setLocalEntries] = useState<PendingDownload[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => setLocalEntries(listPendingDownloads());
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("fyb:pending-downloads:changed", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("fyb:pending-downloads:changed", refresh);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const grants = await fetchPendingGrants();
        if (cancelled) return;
        setServerGrants(grants);
        const activeKeys = new Set(
          grants.map((g) => `${g.templateId}:${g.userDesignId ?? ""}`),
        );
        const filtered = listPendingDownloads().filter((m) =>
          activeKeys.has(`${m.templateId}:${m.userDesignId ?? ""}`),
        );
        if (filtered.length !== listPendingDownloads().length) {
          reconcilePendingDownloads(new Set(filtered.map((m) => m.reference)));
          setLocalEntries(filtered);
        }
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load");
      }
    };
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const rows = useMemo<Row[]>(() => {
    if (!serverGrants) return [];
    const localByKey = new Map<string, PendingDownload>();
    for (const m of localEntries)
      localByKey.set(`${m.templateId}:${m.userDesignId ?? ""}`, m);
    return serverGrants.map((g) => {
      const local = localByKey.get(`${g.templateId}:${g.userDesignId ?? ""}`);
      return {
        templateId: g.templateId,
        templateName: g.templateName ?? local?.templateName ?? "Your design",
        userDesignId: g.userDesignId,
        source: "server" as const,
        reference: local?.reference ?? null,
        paidAt: local ? new Date(local.paidAt).toISOString() : g.issuedAt,
      };
    });
  }, [serverGrants, localEntries]);

  const isLoading = serverGrants === null && error === null;

  if (!isLoading && rows.length === 0 && error === null) return null;

  return (
    <section className="flex flex-col gap-7">
      <SectionHeader
        eyebrow="Action needed"
        title="Finish your download"
        description={`You've paid for ${
          rows.length === 1 ? "a design" : `${rows.length} designs`
        } but haven't finished the download. Pick up right where you left off.`}
        count={isLoading ? null : rows.length}
      />

      {error ? (
        <div
          className="px-4 py-3"
          style={{
            background: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.28)",
            color: "var(--semantic-danger)",
            borderRadius: 10,
            ...bodySm,
          }}
        >
          {error}
        </div>
      ) : null}

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {isLoading
          ? Array.from({ length: 1 }).map((_, i) => (
              <li
                key={i}
                className="flex items-center gap-3 p-4"
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid var(--hairline)",
                  borderRadius: 15,
                }}
              >
                <Loader2
                  className="h-4 w-4 animate-spin"
                  style={{ color: "#FFD700" }}
                />
                <span style={{ ...caption, color: "var(--ink-muted)" }}>
                  Loading your pending downloads…
                </span>
              </li>
            ))
          : rows.map((row) => (
              <li
                key={`${row.templateId}:${row.userDesignId ?? ""}`}
                className="flex items-center justify-between gap-3 p-4 transition"
                style={{
                  background: "var(--surface-1)",
                  border: "1px solid rgba(0, 153, 255, 0.32)",
                  borderRadius: 15,
                }}
              >
                <div className="min-w-0 flex flex-col gap-1">
                  <div
                    className="truncate"
                    style={{ ...bodySm, color: "var(--ink)", fontWeight: 600 }}
                  >
                    {row.templateName}
                  </div>
                  <div
                    style={{ ...micro, color: "var(--ink-muted)" }}
                  >
                    Paid · {formatDate(row.paidAt)}
                  </div>
                </div>
                <Link
                  href={resumeHref(row)}
                  className="inline-flex shrink-0 items-center justify-center transition hover:scale-[0.98]"
                  style={{
                    ...caption,
                    height: 34,
                    padding: "0 16px",
                    background: "var(--ink)",
                    color: "#000",
                    borderRadius: 100,
                    fontWeight: 500,
                  }}
                >
                  Resume
                </Link>
              </li>
            ))}
      </ul>
    </section>
  );
}

function resumeHref(row: Row): string {
  const params = new URLSearchParams();
  if (row.userDesignId) params.set("userDesignId", row.userDesignId);
  params.set("resume", "1");
  return `/templates/${row.templateId}/use?${params.toString()}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
