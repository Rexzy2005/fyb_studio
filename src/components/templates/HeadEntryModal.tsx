"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

export type HeadEntryModalProps = {
  open: boolean;
  templateId: string;
  templateName: string;
  onClose: () => void;
};

export function HeadEntryModal({
  open,
  templateId,
  templateName,
  onClose,
}: HeadEntryModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="head-entry-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-zinc-950/40 backdrop-blur-sm fyb-modal-overlay-in"
      />
      <div
        ref={dialogRef}
        className="relative w-full max-w-md overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-2xl ring-1 ring-black/5 fyb-modal-card-in dark:border-zinc-800 dark:bg-zinc-900 dark:ring-white/5"
      >
        <div className="px-6 pt-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300">
            Department head
          </div>
          <h2
            id="head-entry-title"
            className="mt-3 text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-100"
          >
            What would you like to do with this design?
          </h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            <span className="font-medium text-zinc-900 dark:text-zinc-100">
              {templateName}
            </span>
          </p>
        </div>

        <div className="grid gap-3 p-6">
          <Link
            href={`/templates/${templateId}/preview`}
            onClick={onClose}
            className="group flex items-start gap-3 rounded-2xl border border-zinc-200 bg-white p-4 text-left transition hover:border-zinc-300 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/60"
          >
            <div className="mt-0.5 grid h-9 w-9 flex-none place-items-center rounded-xl bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
              <PreviewIcon />
            </div>
            <div>
              <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">
                Preview & lock
              </div>
              <div className="mt-0.5 text-[12px] text-zinc-600 dark:text-zinc-300">
                See the cover and lock this design for your department.
              </div>
            </div>
          </Link>

          <Link
            href={`/templates/${templateId}/use`}
            onClick={onClose}
            className="group flex items-start gap-3 rounded-2xl border border-zinc-200 bg-white p-4 text-left transition hover:border-zinc-300 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/60"
          >
            <div className="mt-0.5 grid h-9 w-9 flex-none place-items-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
              <UseIcon />
            </div>
            <div>
              <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">
                Use design
              </div>
              <div className="mt-0.5 text-[12px] text-zinc-600 dark:text-zinc-300">
                Personalize this template and export your version.
              </div>
            </div>
          </Link>
        </div>

        <div className="flex items-center justify-end border-t border-zinc-100 px-6 py-3 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function PreviewIcon() {
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

function UseIcon() {
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
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
    </svg>
  );
}
