"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Sparkles } from "lucide-react";

import {
  fetchPendingGrants,
  type PendingGrant,
} from "@/lib/api/payments";
import {
  listPendingDownloads,
  reconcilePendingDownloads,
  type PendingDownload,
} from "@/lib/payment/pendingDownloads";

type Row = {
  templateId: string;
  templateName: string;
  userDesignId: string | null;
  // Either we have a server grant (authoritative) or only a local marker
  // (still pending verify, or the API call hasn't returned yet).
  source: "server" | "local";
  reference: string | null;
  paidAt: string;
};

/**
 * Surfaces designs the user paid for but hasn't finished downloading yet.
 *
 * Two data sources:
 *   1. localStorage marker (instant, written right after Paystack verify).
 *   2. Server grant (authoritative — survives device wipe, multi-device).
 *
 * Render union of both so the UI is fast on revisit AND correct after a
 * device switch. Reconcile localStorage against the server response so
 * stale entries (consumed/expired) get cleaned up.
 */
export function PendingDownloads() {
  const [serverGrants, setServerGrants] = useState<PendingGrant[] | null>(null);
  const [localEntries, setLocalEntries] = useState<PendingDownload[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Hydrate localStorage on mount + listen for cross-tab + same-tab updates.
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

  // Fetch server grants on mount; refresh on focus so a tab left open
  // catches grants paid for elsewhere.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const grants = await fetchPendingGrants();
        if (cancelled) return;
        setServerGrants(grants);
        // Drop any local hint that the server says is no longer active.
        // We can't match references because grants don't carry them — so
        // we simply preserve markers whose templateId matches an active
        // grant; everything else gets pruned.
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
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
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
    // Server grants are the source of truth — render those, enriching with
    // any local marker for the same (templateId, userDesignId) pair (extra
    // metadata like the paystack reference, used to clear local storage on
    // resume).
    if (!serverGrants) return [];
    const localByKey = new Map<string, PendingDownload>();
    for (const m of localEntries) {
      localByKey.set(`${m.templateId}:${m.userDesignId ?? ""}`, m);
    }
    return serverGrants.map((g) => {
      const local = localByKey.get(`${g.templateId}:${g.userDesignId ?? ""}`);
      return {
        templateId: g.templateId,
        templateName: g.templateName ?? local?.templateName ?? "Your design",
        userDesignId: g.userDesignId,
        source: "server" as const,
        reference: local?.reference ?? null,
        paidAt: local
          ? new Date(local.paidAt).toISOString()
          : g.issuedAt,
      };
    });
  }, [serverGrants, localEntries]);

  const isLoading = serverGrants === null && error === null;

  if (!isLoading && rows.length === 0 && error === null) {
    // Nothing pending — render nothing so the dashboard isn't cluttered.
    return null;
  }

  return (
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/15">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300">
            <Sparkles className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">
              Finish your download
            </div>
            <div className="mt-1 text-xs text-zinc-700 dark:text-zinc-300">
              You&apos;ve paid for {rows.length === 1 ? "a design" : `${rows.length} designs`}{" "}
              but haven&apos;t finished the download. Pick up right where you left off.
            </div>
          </div>
        </div>
      </div>

      {error ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {isLoading
          ? Array.from({ length: 1 }).map((_, i) => (
              <li
                key={i}
                className="flex items-center gap-3 rounded-2xl border border-emerald-200/70 bg-white/70 p-3 dark:border-emerald-900/30 dark:bg-zinc-900/40"
              >
                <Loader2 className="h-4 w-4 animate-spin text-emerald-500" />
                <span className="text-xs text-zinc-600 dark:text-zinc-300">
                  Loading your pending downloads…
                </span>
              </li>
            ))
          : rows.map((row) => (
              <li
                key={`${row.templateId}:${row.userDesignId ?? ""}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200/70 bg-white/80 p-3 dark:border-emerald-900/30 dark:bg-zinc-900/60"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-zinc-950 dark:text-zinc-100">
                    {row.templateName}
                  </div>
                  <div className="mt-0.5 text-[11px] text-zinc-600 dark:text-zinc-400">
                    Paid · {formatDate(row.paidAt)}
                  </div>
                </div>
                <Link
                  href={resumeHref(row)}
                  className="inline-flex h-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 px-3 text-xs font-semibold text-white transition hover:bg-emerald-500"
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
  // The query param is purely a hint; the design page detects the active
  // grant on its own and skips the payment modal automatically.
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
