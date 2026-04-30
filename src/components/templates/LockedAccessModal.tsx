"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { verifyTemplateLockPasscode } from "@/lib/api/templateLocks";

export type LockedAccessModalProps = {
  open: boolean;
  variant: "blocked" | "passcode-required";
  templateId: string;
  departmentName: string;
  onClose: () => void;
  onUnlocked?: () => void;
};

export function LockedAccessModal({
  open,
  variant,
  templateId,
  departmentName,
  onClose,
  onUnlocked,
}: LockedAccessModalProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [passcode, setPasscode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPasscode("");
    setError(null);
    setSubmitting(false);
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 50);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(focusTimer);
    };
  }, [open, onClose]);

  if (!open) return null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await verifyTemplateLockPasscode(templateId, passcode);
      if (result.ok) {
        onUnlocked?.();
        return;
      }
      if (result.status === 403) {
        setError("This design is locked for another department.");
      } else if (result.status === 401) {
        setError("Incorrect passcode. Try again.");
      } else if (result.status === 404) {
        setError("This design is not locked.");
      } else {
        setError(result.message || "Could not verify the passcode.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="locked-access-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-zinc-950/45 backdrop-blur-sm fyb-modal-overlay-in"
      />
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-2xl ring-1 ring-black/5 fyb-modal-card-in dark:border-zinc-800 dark:bg-zinc-900 dark:ring-white/5">
        {variant === "blocked" ? (
          <div className="p-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] font-semibold text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-300">
              Design locked
            </div>
            <h2
              id="locked-access-title"
              className="mt-3 text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-100"
            >
              This design is reserved for {departmentName}.
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              The department head of{" "}
              <span className="font-medium text-zinc-900 dark:text-zinc-100">
                {departmentName}
              </span>{" "}
              has locked this design for their department&apos;s exclusive use.
              You can&apos;t access it from your department.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <Link
                href="/templates"
                onClick={onClose}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-900 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                Browse other templates
              </Link>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                Got it
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="p-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
              Passcode required
            </div>
            <h2
              id="locked-access-title"
              className="mt-3 text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-100"
            >
              Enter your department passcode.
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              Your department head locked this design for {departmentName}. Enter
              the passcode they shared to use it.
            </p>

            <label className="mt-5 block">
              <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                Passcode
              </span>
              <input
                ref={inputRef}
                type="text"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value.toUpperCase())}
                placeholder="e.g. SWE3467"
                autoComplete="off"
                spellCheck={false}
                inputMode="text"
                className="mt-1 block h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-mono tracking-wide text-zinc-900 shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </label>

            {error ? (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-300">
                {error}
              </div>
            ) : null}

            <p className="mt-3 text-[11px] text-zinc-500 dark:text-zinc-400">
              Access stays open for 60 minutes after a successful entry.
            </p>

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-900 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || passcode.trim().length === 0}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                {submitting ? "Verifying…" : "Unlock"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
