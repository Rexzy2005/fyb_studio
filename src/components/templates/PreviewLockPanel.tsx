"use client";

import { useState } from "react";

import {
  deleteTemplateLock,
  lockTemplate,
  rotateTemplateLockPasscode,
  type TemplateLockClient,
} from "@/lib/api/templateLocks";

type Props = {
  templateId: string;
  templateName: string;
  initialLock: TemplateLockClient | null;
  lockedByOtherDept: boolean;
};

export function PreviewLockPanel({
  templateId,
  templateName,
  initialLock,
  lockedByOtherDept,
}: Props) {
  const [lock, setLock] = useState<TemplateLockClient | null>(initialLock);
  const [working, setWorking] = useState<"lock" | "rotate" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function onLock() {
    if (working) return;
    setError(null);
    setWorking("lock");
    try {
      const next = await lockTemplate(templateId);
      setLock(next);
      setReveal(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not lock the design");
    } finally {
      setWorking(null);
    }
  }

  async function onRotate() {
    if (working) return;
    setError(null);
    setWorking("rotate");
    try {
      const next = await rotateTemplateLockPasscode(templateId);
      setLock(next);
      setReveal(true);
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
      await deleteTemplateLock(templateId);
      setLock(null);
      setConfirmDelete(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not free the design");
    } finally {
      setWorking(null);
    }
  }

  if (lockedByOtherDept && lock) {
    return (
      <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-semibold text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-300">
          Locked by another department
        </div>
        <h2 className="mt-3 text-lg font-semibold tracking-tight text-zinc-950 dark:text-zinc-100">
          {lock.departmentName} has reserved this design.
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          Once a department locks a design for their members, no other
          department can lock or use it. You can preview the cover but the
          design itself is unavailable to your department.
        </p>
      </div>
    );
  }

  if (!lock) {
    return (
      <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300">
          Available to lock
        </div>
        <h2 className="mt-3 text-lg font-semibold tracking-tight text-zinc-950 dark:text-zinc-100">
          Lock {templateName} for your department.
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          Locking reserves this design exclusively for your department.
          Members will need a passcode to use it. The system generates a
          shareable code for you (e.g. <span className="font-mono">SWE3467</span>).
        </p>

        {error ? (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-300">
            {error}
          </div>
        ) : null}

        <button
          type="button"
          onClick={onLock}
          disabled={working !== null}
          className="mt-5 inline-flex h-11 items-center justify-center rounded-2xl bg-zinc-900 px-5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {working === "lock" ? "Locking…" : "Lock for my department"}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300">
        Locked for {lock.departmentName}
      </div>
      <h2 className="mt-3 text-lg font-semibold tracking-tight text-zinc-950 dark:text-zinc-100">
        Department passcode
      </h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
        Share this code with your department. Members enter it to unlock the
        design for 60 minutes per session.
      </p>

      <div className="mt-4 flex items-center gap-2">
        <div className="flex-1 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 font-mono text-lg tracking-[0.18em] text-zinc-950 dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-100">
          {reveal && lock.passcode ? lock.passcode : "••••••••"}
        </div>
        {lock.passcode ? (
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            aria-label={reveal ? "Hide passcode" : "Show passcode"}
            className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {reveal ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-300">
          {error}
        </div>
      ) : null}

      <div className="mt-5 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onRotate}
          disabled={working !== null}
          className="inline-flex h-11 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-900 shadow-sm transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          {working === "rotate" ? "Rotating…" : "Rotate passcode"}
        </button>
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          disabled={working !== null}
          className="inline-flex h-11 items-center justify-center rounded-2xl border border-rose-200 bg-white px-4 text-sm font-medium text-rose-700 shadow-sm transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-900/40 dark:bg-zinc-900 dark:text-rose-300 dark:hover:bg-rose-900/10"
        >
          Free design
        </button>
      </div>

      {confirmDelete ? (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900/40 dark:bg-rose-900/15">
          <p className="text-sm text-rose-800 dark:text-rose-200">
            Free this design? The lock will be removed and any department will
            be able to use it again. Your current passcode will stop working.
          </p>
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={working === "delete"}
              className="inline-flex h-9 items-center justify-center rounded-xl bg-rose-600 px-3 text-xs font-medium text-white shadow-sm transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {working === "delete" ? "Freeing…" : "Yes, free design"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EyeIcon() {
  return (
    <svg
      width="18"
      height="18"
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
      width="18"
      height="18"
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
