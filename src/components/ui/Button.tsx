"use client";

import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from "react";
import { button as buttonType, caption, bodySm } from "@/lib/ui/typography";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "link";
export type ButtonSize = "sm" | "md" | "lg";

interface BaseProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  leftSlot?: ReactNode;
  rightSlot?: ReactNode;
  loading?: boolean;
}

interface ButtonProps extends BaseProps, ButtonHTMLAttributes<HTMLButtonElement> {}

interface ButtonLinkProps extends BaseProps {
  href: string;
  external?: boolean;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  onClick?: () => void;
  "aria-label"?: string;
}

const SIZE_STYLE: Record<ButtonSize, CSSProperties> = {
  sm: { height: 32, padding: "0 14px", borderRadius: 100, ...caption },
  md: { height: 38, padding: "0 18px", borderRadius: 100, ...buttonType },
  lg: { height: 46, padding: "0 22px", borderRadius: 100, ...bodySm, fontWeight: 500 },
};

function variantStyle(variant: ButtonVariant): CSSProperties {
  switch (variant) {
    case "primary":
      return {
        background: "#FFD700",
        color: "#000",
        border: "1px solid #FFD700",
        fontWeight: 700,
        boxShadow: "0 6px 18px rgba(255,180,0,0.25)",
      };
    case "secondary":
      return {
        background: "rgba(255,215,0,0.06)",
        color: "var(--ink)",
        border: "1px solid rgba(255,215,0,0.28)",
      };
    case "ghost":
      return {
        background: "transparent",
        color: "var(--ink)",
        border: "1px solid rgba(255,215,0,0.22)",
      };
    case "danger":
      return {
        background: "transparent",
        color: "var(--semantic-danger)",
        border: "1px solid rgba(239, 68, 68, 0.35)",
      };
    case "link":
      return {
        background: "transparent",
        color: "#FFD700",
        border: "none",
        padding: 0,
        height: "auto",
        borderRadius: 0,
      };
  }
}

function combine(
  size: ButtonSize,
  variant: ButtonVariant,
  fullWidth: boolean | undefined,
  loading: boolean | undefined,
  disabled: boolean | undefined,
  extra: CSSProperties | undefined,
): CSSProperties {
  return {
    display: fullWidth ? "flex" : "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    width: fullWidth ? "100%" : undefined,
    whiteSpace: "nowrap",
    cursor: disabled || loading ? "not-allowed" : "pointer",
    opacity: disabled || loading ? 0.5 : 1,
    transition: "transform 140ms ease, background 140ms ease, opacity 140ms ease",
    ...SIZE_STYLE[size],
    ...variantStyle(variant),
    ...extra,
  };
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    fullWidth,
    leftSlot,
    rightSlot,
    loading,
    disabled,
    className = "",
    style,
    children,
    type = "button",
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={`fyb-btn ${className}`}
      style={combine(size, variant, fullWidth, loading, disabled, style)}
      {...rest}
    >
      {leftSlot}
      <span>{children}</span>
      {loading ? (
        <span className="fyb-dots" aria-hidden>
          <span /> <span /> <span />
        </span>
      ) : (
        rightSlot
      )}
    </button>
  );
});

export function ButtonLink({
  variant = "primary",
  size = "md",
  fullWidth,
  leftSlot,
  rightSlot,
  loading,
  href,
  external,
  children,
  className = "",
  style,
  onClick,
  "aria-label": ariaLabel,
}: ButtonLinkProps) {
  const merged = combine(size, variant, fullWidth, loading, false, style);
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        className={`fyb-btn ${className}`}
        style={merged}
        onClick={onClick}
        aria-label={ariaLabel}
      >
        {leftSlot}
        <span>{children}</span>
        {rightSlot}
      </a>
    );
  }
  return (
    <Link
      href={href}
      className={`fyb-btn ${className}`}
      style={merged}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      {leftSlot}
      <span>{children}</span>
      {rightSlot}
    </Link>
  );
}
