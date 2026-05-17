/**
 * Section header - DESIGN.md framer system.
 *
 * Eyebrow ({typography.caption} uppercase, +letter-spacing) → display-md title
 * → body-md description. Renders directly on canvas with no card wrapper.
 *
 * Used by every dashboard panel so every section reads with identical rhythm.
 */
import type { ReactNode } from "react";
import { displayMd, bodyMd, caption } from "@/lib/ui/typography";

interface Props {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  count?: number | null;
  /** Optional accent on the eyebrow dot (default accent-blue). */
  tone?: "accent" | "muted";
  /** Right-aligned slot for action buttons / counts. */
  rightSlot?: ReactNode;
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  count,
  tone = "accent",
  rightSlot,
}: Props) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="inline-flex items-center gap-2.5">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{
              background:
                tone === "accent" ? "var(--accent-blue)" : "var(--ink-muted)",
            }}
            aria-hidden
          />
          <span
            style={{
              ...caption,
              color: "var(--ink-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.16em",
              fontSize: 11,
            }}
          >
            {eyebrow}
          </span>
          {typeof count === "number" ? (
            <span
              style={{
                ...caption,
                color: "var(--ink-faint)",
                fontFamily: "var(--font-geist-mono)",
                fontSize: 12,
              }}
            >
              ({count})
            </span>
          ) : null}
        </div>
        <h2
          style={{
            ...displayMd,
            fontSize: "clamp(24px, 3vw, 32px)",
            lineHeight: 1.08,
          }}
        >
          {title}
        </h2>
        {description ? (
          <p
            style={{ ...bodyMd, color: "var(--ink-muted)", fontWeight: 400 }}
            className="max-w-[560px]"
          >
            {description}
          </p>
        ) : null}
      </div>
      {rightSlot ? <div className="shrink-0">{rightSlot}</div> : null}
    </div>
  );
}
