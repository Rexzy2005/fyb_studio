"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import {
  fetchPendingGrants,
  recordDownload,
  verifyPayment,
  type PendingGrant,
} from "@/lib/api/payments";
import {
  clearPendingDownload,
  listPendingDownloads,
  recordPendingDownload,
  reconcilePendingDownloads,
  type PendingDownload,
} from "@/lib/payment/pendingDownloads";
import {
  clearPaymentAttempt,
  listPaymentAttempts,
} from "@/lib/payment/paymentAttempts";
import { downloadBlob } from "@/lib/download/browserDownload";
import { safePngFilename } from "@/lib/download/browserDownload";
import { exportUserDesignPng } from "@/lib/render/exportUserDesign";
import { getUserDesign, markDownloaded } from "@/lib/storage/userDesignRepo";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { bodySm, caption, micro } from "@/lib/ui/typography";

type Row = {
  templateId: string;
  templateName: string;
  userDesignId: string | null;
  source: "server" | "local";
  reference: string | null;
  paidAt: string;
  canDownloadHere: boolean;
};

export function PendingDownloads() {
  const [serverGrants, setServerGrants] = useState<PendingGrant[] | null>(null);
  const [localEntries, setLocalEntries] = useState<PendingDownload[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [downloadBusyKey, setDownloadBusyKey] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadableDesignIds, setDownloadableDesignIds] = useState<Set<string>>(new Set());

  const loadServerGrants = useCallback(async () => {
    const attempts = listPaymentAttempts();
    await Promise.all(
      attempts.map(async (attempt) => {
        try {
          const verified = await verifyPayment(attempt.reference);
          recordPendingDownload({
            reference: verified.grant.paystackReference,
            templateId: verified.grant.templateId,
            templateName: attempt.templateName,
            userDesignId: verified.grant.userDesignId,
            paidAt: Date.now(),
          });
          clearPaymentAttempt(verified.grant.paystackReference);
        } catch {
          // Pending bank-transfer attempts can legitimately remain unconfirmed.
        }
      }),
    );

    const grants = await fetchPendingGrants();
    setServerGrants(grants);
    const activeKeys = new Set(
      grants.map((g) => `${g.templateId}:${g.userDesignId ?? ""}`),
    );
    const pending = listPendingDownloads();
    const filtered = pending.filter((m) =>
      activeKeys.has(`${m.templateId}:${m.userDesignId ?? ""}`),
    );
    if (filtered.length !== pending.length) {
      reconcilePendingDownloads(new Set(filtered.map((m) => m.reference)));
    }
    setLocalEntries(filtered);

    const existingDesignIds = await Promise.all(
      grants.map(async (grant) => {
        if (!grant.userDesignId) return null;
        const record = await getUserDesign(grant.userDesignId);
        return record ? grant.userDesignId : null;
      }),
    );
    setDownloadableDesignIds(new Set(existingDesignIds.filter((id): id is string => Boolean(id))));
  }, []);

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
        if (cancelled) return;
        await loadServerGrants();
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
  }, [loadServerGrants]);

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
        canDownloadHere: Boolean(g.userDesignId && downloadableDesignIds.has(g.userDesignId)),
      };
    });
  }, [serverGrants, localEntries, downloadableDesignIds]);

  async function downloadFromDashboard(row: Row) {
    if (!row.userDesignId) return;
    const key = `${row.templateId}:${row.userDesignId}`;
    setDownloadBusyKey(key);
    setDownloadError(null);
    try {
      const record = await getUserDesign(row.userDesignId);
      if (!record) throw new Error("The saved edit is no longer available on this device.");

      const exported = await exportUserDesignPng({ record, scale: 2 });
      downloadBlob(exported.blob, safePngFilename(record.name));

      let thumbnail: { blob: Blob; mime: string; width: number; height: number } | null = null;
      try {
        const thumb = await exportUserDesignPng({ record, scale: 1 });
        thumbnail = {
          blob: thumb.blob,
          mime: thumb.blob.type || "image/png",
          width: thumb.width,
          height: thumb.height,
        };
      } catch {
        thumbnail = null;
      }

      await markDownloaded(record.id, {
        thumbnail,
        paidReference: row.reference,
        exportFile: {
          blob: exported.blob,
          mime: exported.blob.type || "image/png",
          width: exported.width,
          height: exported.height,
          scale: 2,
          filename: safePngFilename(record.name),
        },
      });

      await recordDownload({
        templateId: row.templateId,
        userDesignId: row.userDesignId,
        scale: 2,
      });
      if (row.reference) clearPendingDownload(row.reference);
      await loadServerGrants();
    } catch (err) {
      setDownloadError(
        err instanceof Error ? err.message : "Could not download this design from the dashboard.",
      );
    } finally {
      setDownloadBusyKey(null);
    }
  }

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

      {downloadError ? (
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
          {downloadError}
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
                {row.canDownloadHere ? (
                  <button
                    type="button"
                    disabled={downloadBusyKey === `${row.templateId}:${row.userDesignId}`}
                    onClick={() => void downloadFromDashboard(row)}
                    className="inline-flex shrink-0 items-center justify-center transition hover:scale-[0.98] disabled:opacity-60"
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
                    {downloadBusyKey === `${row.templateId}:${row.userDesignId}`
                      ? "Preparing"
                      : "Download"}
                  </button>
                ) : (
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
                )}
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
  if (row.reference) params.set("reference", row.reference);
  return `/templates/${row.templateId}/use?${params.toString()}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
