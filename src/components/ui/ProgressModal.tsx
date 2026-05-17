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
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const safePercent = clampPercent(percent ?? 0);
  const showPercent = percent !== undefined;
  const isDone = showPercent && safePercent >= 100;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={id}
      style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="relative w-full max-w-sm overflow-hidden"
        style={{
          background: "var(--canvas)",
          border: "1px solid var(--hairline)",
          borderRadius: 28,
          boxShadow: "0 32px 80px rgba(0,0,0,0.6)",
        }}
      >
        {/* Top accent line */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[2px]"
          style={{
            background: isDone
              ? "linear-gradient(90deg,#22c55e,#16a34a)"
              : "linear-gradient(90deg,#FFD700,#F97316,#A855F7)",
            opacity: 0.9,
          }}
        />

        <div className="px-6 pt-7 pb-6">
          {/* Circular progress indicator */}
          <div className="flex justify-center">
            <div className="relative">
              <svg
                width="88"
                height="88"
                viewBox="0 0 88 88"
                className={!showPercent ? "animate-spin" : ""}
                style={!showPercent ? { animationDuration: "1.2s" } : undefined}
              >
                <defs>
                  <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor={isDone ? "#22c55e" : "#FFD700"} />
                    <stop offset="100%" stopColor={isDone ? "#16a34a" : "#A855F7"} />
                  </linearGradient>
                </defs>
                <circle
                  cx="44" cy="44" r="36"
                  fill="none"
                  stroke="rgba(255,255,255,0.07)"
                  strokeWidth="7"
                />
                <circle
                  cx="44" cy="44" r="36"
                  fill="none"
                  stroke={`url(#${id}-g)`}
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 36}
                  strokeDashoffset={
                    showPercent
                      ? 2 * Math.PI * 36 * (1 - safePercent / 100)
                      : 2 * Math.PI * 36 * 0.72
                  }
                  transform="rotate(-90 44 44)"
                  className={showPercent ? "transition-[stroke-dashoffset] duration-300 ease-out" : ""}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                {isDone ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : showPercent ? (
                  <span className="text-sm font-bold tabular-nums" style={{ color: "var(--ink)" }}>
                    {Math.round(safePercent)}%
                  </span>
                ) : (
                  <div className="h-2 w-2 rounded-full" style={{ background: "var(--ink-faint)" }} />
                )}
              </div>
            </div>
          </div>

          {/* Labels */}
          <div className="mt-5 text-center">
            <div
              id={id}
              className="text-base font-semibold"
              style={{ color: "var(--ink)", letterSpacing: "-0.015em" }}
            >
              {title}
              {!isDone && (
                <span className="fyb-dots ml-1.5" aria-hidden>
                  <span />
                  <span />
                  <span />
                </span>
              )}
            </div>
            {subtitle ? (
              <div className="mt-1.5 text-sm" style={{ color: "var(--ink-muted)" }}>
                {subtitle}
              </div>
            ) : null}
          </div>

          {/* Progress bar */}
          <div
            className="mt-5 overflow-hidden"
            style={{ height: 6, background: "var(--surface-2)", borderRadius: 99 }}
          >
            <div
              className="h-full origin-left transition-transform duration-300 ease-out"
              style={{
                background: isDone
                  ? "linear-gradient(90deg,#22c55e,#16a34a)"
                  : "linear-gradient(90deg,#FFD700,#F97316,#A855F7)",
                transform: `scaleX(${showPercent ? safePercent / 100 : 0.35})`,
                borderRadius: 99,
              }}
            />
          </div>

          {hint ? (
            <p className="mt-3 text-center text-xs" style={{ color: "var(--ink-faint)" }}>
              {hint}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
