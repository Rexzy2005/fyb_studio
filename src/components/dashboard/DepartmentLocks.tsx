"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import {
  deleteTemplateLock,
  fetchDepartmentLocks,
  rotateTemplateLockPasscode,
  type DepartmentLockListItemClient,
} from "@/lib/api/templateLocks";

export function DepartmentLocks({ departmentName }: { departmentName: string }) {
  const [locks, setLocks] = useState<DepartmentLockListItemClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const next = await fetchDepartmentLocks();
      setLocks(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load locks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (loading) {
    return (
      <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <Header departmentName={departmentName} />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <Header departmentName={departmentName} />

      {error ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-300">
          {error}
        </div>
      ) : null}

      {locks.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-zinc-200 p-6 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
          You haven&apos;t locked any designs yet. Open a template, choose
          &ldquo;Preview & lock&rdquo;, and reserve it for your department.
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {locks.map((l) => (
            <LockCard key={l.id} lock={l} onChanged={refresh} />
          ))}
        </div>
      )}
    </section>
  );
}

function Header({ departmentName }: { departmentName: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300">
          Department head
        </div>
        <h2 className="mt-2 text-lg font-semibold tracking-tight text-zinc-950 dark:text-zinc-100">
          Locked designs
        </h2>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          Designs you have reserved for {departmentName}.
        </p>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="h-44 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-800/60" />
  );
}

function LockCard({
  lock,
  onChanged,
}: {
  lock: DepartmentLockListItemClient;
  onChanged: () => Promise<void> | void;
}) {
  const [reveal, setReveal] = useState(false);
  const [working, setWorking] = useState<"rotate" | "delete" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localPasscode, setLocalPasscode] = useState<string | null>(lock.passcode);

  async function onRotate() {
    if (working) return;
    setError(null);
    setWorking("rotate");
    try {
      const next = await rotateTemplateLockPasscode(lock.templateId);
      setLocalPasscode(next.passcode);
      setReveal(true);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rotate passcode");
    } finally {
      setWorking(null);
    }
  }

  async function onDelete() {
    if (working) return;
    setError(null);
    setWorking("delete");
    try {
      await deleteTemplateLock(lock.templateId);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not free the design");
      setWorking(null);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start gap-3 p-4">
        <div className="grid h-14 w-14 flex-none place-items-center overflow-hidden rounded-xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/60">
          {lock.templateCoverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={lock.templateCoverUrl}
              alt=""
              className="h-full w-full object-contain p-1"
            />
          ) : (
            <span className="text-[10px] text-zinc-500">No cover</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-100">
            {lock.templateName}
          </div>
          <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
            Locked {new Date(lock.createdAt).toLocaleDateString()}
          </div>
        </div>
      </div>

      <div className="px-4 pb-4">
        <div className="flex items-center gap-2">
          <div className="flex-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 font-mono text-sm tracking-[0.18em] text-zinc-950 dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-100">
            {reveal && localPasscode ? localPasscode : "••••••"}
          </div>
          {localPasscode ? (
            <button
              type="button"
              onClick={() => setReveal((v) => !v)}
              aria-label={reveal ? "Hide passcode" : "Show passcode"}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              {reveal ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          ) : null}
        </div>

        {error ? (
          <div className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-[11px] text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-300">
            {error}
          </div>
        ) : null}

        <div className="mt-3 grid grid-cols-3 gap-1.5">
          <Link
            href={`/templates/${lock.templateId}/preview`}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-200 bg-white px-2 text-[11px] font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Open
          </Link>
          <button
            type="button"
            onClick={onRotate}
            disabled={working !== null}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-200 bg-white px-2 text-[11px] font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {working === "rotate" ? "…" : "Rotate"}
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={working !== null}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-rose-200 bg-white px-2 text-[11px] font-medium text-rose-700 shadow-sm transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-900/40 dark:bg-zinc-900 dark:text-rose-300 dark:hover:bg-rose-900/10"
          >
            Free
          </button>
        </div>

        {confirmDelete ? (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 dark:border-rose-900/40 dark:bg-rose-900/15">
            <p className="text-[12px] text-rose-800 dark:text-rose-200">
              Free this design for everyone? Your passcode stops working.
            </p>
            <div className="mt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="inline-flex h-8 items-center justify-center rounded-lg border border-zinc-200 bg-white px-2 text-[11px] font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={working === "delete"}
                className="inline-flex h-8 items-center justify-center rounded-lg bg-rose-600 px-2 text-[11px] font-medium text-white"
              >
                {working === "delete" ? "Freeing…" : "Free"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function EyeIcon() {
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
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
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
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19c-7 0-10-7-10-7a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 10 7 10 7a18.5 18.5 0 0 1-3.18 4.24" />
      <path d="M14.12 14.12A3 3 0 1 1 9.88 9.88" />
      <line x1="2" y1="2" x2="22" y2="22" />
    </svg>
  );
}
