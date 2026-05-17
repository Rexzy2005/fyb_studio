"use client";

import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

export type CardVariant = "surface-1" | "surface-2" | "outline";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: number | string;
  radius?: number | string;
  hover?: boolean;
  asChild?: boolean;
  children: ReactNode;
}

const VARIANT: Record<CardVariant, CSSProperties> = {
  "surface-1": { background: "var(--surface-1)", border: "1px solid var(--hairline)" },
  "surface-2": { background: "var(--surface-2)", border: "1px solid var(--hairline)" },
  outline: { background: "transparent", border: "1px solid var(--hairline)" },
};

export function Card({
  variant = "surface-1",
  padding = 20,
  radius = 15,
  hover,
  className = "",
  style,
  children,
  ...rest
}: CardProps) {
  const merged: CSSProperties = {
    ...VARIANT[variant],
    padding,
    borderRadius: radius,
    transition: hover ? "border-color 160ms ease, transform 160ms ease" : undefined,
    ...style,
  };
  return (
    <div
      className={className}
      style={merged}
      onMouseEnter={(e) => {
        if (hover) e.currentTarget.style.borderColor = "var(--accent-blue)";
        rest.onMouseEnter?.(e);
      }}
      onMouseLeave={(e) => {
        if (hover) e.currentTarget.style.borderColor = "var(--hairline)";
        rest.onMouseLeave?.(e);
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
