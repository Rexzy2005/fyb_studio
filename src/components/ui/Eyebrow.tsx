import type { ReactNode } from "react";
import { caption } from "@/lib/ui/typography";

interface EyebrowProps {
  children: ReactNode;
  tone?: "accent" | "muted";
  className?: string;
}

export function Eyebrow({ children, tone = "accent", className = "" }: EyebrowProps) {
  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: tone === "accent" ? "var(--accent-blue)" : "var(--ink-muted)" }}
        aria-hidden
      />
      <span style={{ ...caption, color: "var(--ink-muted)", textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 11 }}>
        {children}
      </span>
    </div>
  );
}
