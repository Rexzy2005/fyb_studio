import type { CSSProperties, ReactNode } from "react";
import { caption } from "@/lib/ui/typography";

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "muted";

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  size?: "sm" | "md";
  leftSlot?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

function toneStyle(tone: BadgeTone): CSSProperties {
  switch (tone) {
    case "accent":
      return {
        background: "var(--accent-blue-soft)",
        color: "var(--accent-blue)",
        border: "1px solid rgba(0, 153, 255, 0.28)",
      };
    case "success":
      return {
        background: "rgba(34, 197, 94, 0.12)",
        color: "var(--semantic-success)",
        border: "1px solid rgba(34, 197, 94, 0.28)",
      };
    case "warning":
      return {
        background: "rgba(245, 158, 11, 0.12)",
        color: "var(--semantic-warning)",
        border: "1px solid rgba(245, 158, 11, 0.28)",
      };
    case "danger":
      return {
        background: "rgba(239, 68, 68, 0.12)",
        color: "var(--semantic-danger)",
        border: "1px solid rgba(239, 68, 68, 0.28)",
      };
    case "muted":
      return {
        background: "transparent",
        color: "var(--ink-faint)",
        border: "1px solid var(--hairline)",
      };
    case "neutral":
    default:
      return {
        background: "var(--surface-2)",
        color: "var(--ink-muted)",
        border: "1px solid var(--hairline)",
      };
  }
}

export function Badge({ children, tone = "neutral", size = "sm", leftSlot, className = "", style }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 ${className}`}
      style={{
        ...caption,
        fontSize: size === "sm" ? 11 : 12,
        padding: size === "sm" ? "3px 8px" : "4px 10px",
        borderRadius: 999,
        ...toneStyle(tone),
        ...style,
      }}
    >
      {leftSlot}
      {children}
    </span>
  );
}
