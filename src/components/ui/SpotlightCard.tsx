import type { CSSProperties, ReactNode } from "react";
import { caption, headline } from "@/lib/ui/typography";
import { SPOTLIGHT_GRADIENTS, type SpotlightVariant } from "@/lib/ui/tokens";

interface SpotlightCardProps {
  variant?: SpotlightVariant;
  eyebrow?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  footer?: ReactNode;
  spanCols?: number;
  className?: string;
  style?: CSSProperties;
}

export function SpotlightCard({
  variant = "violet",
  eyebrow,
  title,
  body,
  footer,
  spanCols,
  className = "",
  style,
}: SpotlightCardProps) {
  return (
    <div
      className={`relative flex flex-col justify-between overflow-hidden ${className}`}
      style={{
        background: SPOTLIGHT_GRADIENTS[variant],
        borderRadius: 20,
        padding: "26px 28px",
        minHeight: 220,
        gridColumn: spanCols ? `span ${spanCols} / span ${spanCols}` : undefined,
        boxShadow: "0 24px 50px rgba(0,0,0,0.45)",
        ...style,
      }}
    >
      <div className="flex flex-col gap-2.5">
        {eyebrow && (
          <div className="inline-flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "#fff" }} aria-hidden />
            <span style={{ ...caption, color: "rgba(255,255,255,0.85)", textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 11 }}>
              {eyebrow}
            </span>
          </div>
        )}
        <div style={{ ...headline, color: "#fff", fontSize: 22, maxWidth: 320 }}>{title}</div>
        {body && (
          <div style={{ ...caption, color: "rgba(255,255,255,0.78)", fontSize: 13, maxWidth: 320 }}>
            {body}
          </div>
        )}
      </div>
      {footer && <div className="mt-4">{footer}</div>}
    </div>
  );
}
