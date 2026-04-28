"use client";

import { useEffect, useId } from "react";

function clampPercent(p: number) {
  if (!Number.isFinite(p)) return 0;
  if (p < 0) return 0;
  if (p > 100) return 100;
  return p;
}

export function ProgressModal({
  open,
  title,
  subtitle,
  percent,
  hint,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  percent?: number;
  hint?: string;
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    // Prevent scroll while a blocking progress modal is open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const safePercent = clampPercent(percent ?? 0);
  const showPercent = percent !== undefined;

  const r = 42;
  const c = 2 * Math.PI * r;
  const dashOffset = c * (1 - safePercent / 100);

  return (
    <div
      className={
        "fixed inset-0 z-[80] flex items-center justify-center p-4 " +
        (open ? "fyb-modal-overlay-in" : "fyb-modal-overlay-out")
      }
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" />

      <div
        className={
          "relative w-full max-w-md overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 " +
          (open ? "fyb-modal-card-in" : "fyb-modal-card-out")
        }
      >
        <div className="pointer-events-none absolute -top-24 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-gradient-to-br from-emerald-400/25 via-blue-400/20 to-fuchsia-400/20 blur-2xl" />

        <div className="relative px-6 py-6">
          <div className="flex items-center gap-4">
            <div className="relative h-22 w-22 shrink-0">
              <svg
                viewBox="0 0 120 120"
                className={"h-full w-full " + (showPercent ? "" : "animate-spin")}
                style={showPercent ? undefined : { animationDuration: "1.1s" }}
              >
                <defs>
                  <linearGradient id={`${titleId}-grad`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#10b981" />
                    <stop offset="55%" stopColor="#3b82f6" />
                    <stop offset="100%" stopColor="#a855f7" />
                  </linearGradient>
                </defs>

                <g transform="translate(60 60) rotate(-90)">
                  <circle r={r} cx={0} cy={0} fill="transparent" stroke="rgba(113, 113, 122, 0.22)" strokeWidth="10" />
                  <circle
                    r={r}
                    cx={0}
                    cy={0}
                    fill="transparent"
                    stroke={`url(#${titleId}-grad)`}
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={c}
                    strokeDashoffset={showPercent ? dashOffset : c * 0.35}
                    className={showPercent ? "transition-[stroke-dashoffset] duration-200 ease-out" : ""}
                  />
                </g>
              </svg>

              <div className="absolute inset-0 grid place-items-center">
                {showPercent ? (
                  <div className="text-sm font-semibold tabular-nums text-zinc-950 dark:text-zinc-100">
                    {Math.round(safePercent)}%
                  </div>
                ) : (
                  <div className="h-2 w-2 rounded-full bg-zinc-900 dark:bg-zinc-100" />
                )}
              </div>
            </div>

            <div className="min-w-0">
              <div id={titleId} className="text-sm font-semibold tracking-tight text-zinc-950 dark:text-zinc-100">
                {title}
                <span className="inline-flex items-center align-middle">
                  <span className="fyb-dots ml-1" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                </span>
              </div>
              {subtitle ? (
                <div className="mt-1 text-xs leading-5 text-zinc-600 dark:text-zinc-300">{subtitle}</div>
              ) : null}
              {hint ? (
                <div className="mt-2 text-[11px] leading-4 text-zinc-500 dark:text-zinc-400">{hint}</div>
              ) : null}
            </div>
          </div>

          <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className="h-full w-full origin-left bg-gradient-to-r from-emerald-500 via-blue-500 to-fuchsia-500 transition-transform duration-200 ease-out"
              style={{ transform: `scaleX(${showPercent ? safePercent / 100 : 0.35})` }}
            />
          </div>

          <div className="mt-3 text-[11px] text-zinc-500 dark:text-zinc-400">
            Please keep this tab open.
          </div>
        </div>
      </div>
    </div>
  );
}
