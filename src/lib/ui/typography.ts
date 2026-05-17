import type { CSSProperties } from "react";

/**
 * Framer type scale - DESIGN.md typography tokens.
 *
 * Single family across the whole site: Geist Sans (open-source GT Walsheim
 * Medium substitute). Mono uses Geist Mono. Body and display share the same
 * family so the rendered tone is identical across pages.
 */

const geist: CSSProperties = {
  fontFamily: "var(--font-geist-sans)",
};

const mono: CSSProperties = {
  fontFamily: "var(--font-geist-mono)",
};

export const displayXxl: CSSProperties = {
  ...geist,
  fontWeight: 500,
  fontSize: "clamp(56px, 9vw, 110px)",
  lineHeight: 0.85,
  letterSpacing: "-0.05em",
};

export const displayXl: CSSProperties = {
  ...geist,
  fontWeight: 500,
  fontSize: "clamp(48px, 7.2vw, 85px)",
  lineHeight: 0.95,
  letterSpacing: "-0.05em",
};

export const displayLg: CSSProperties = {
  ...geist,
  fontWeight: 500,
  fontSize: "clamp(38px, 5.4vw, 62px)",
  lineHeight: 1,
  letterSpacing: "-0.045em",
};

export const displayMd: CSSProperties = {
  ...geist,
  fontWeight: 500,
  fontSize: "clamp(24px, 3vw, 32px)",
  lineHeight: 1.13,
  letterSpacing: "-0.03em",
};

export const headline: CSSProperties = {
  ...geist,
  fontWeight: 700,
  fontSize: 22,
  lineHeight: 1.2,
  letterSpacing: "-0.036em",
};

export const subhead: CSSProperties = {
  ...geist,
  fontWeight: 400,
  fontSize: 24,
  lineHeight: 1.3,
  letterSpacing: "-0.001em",
};

export const bodyLg: CSSProperties = {
  ...geist,
  fontWeight: 400,
  fontSize: 18,
  lineHeight: 1.3,
  letterSpacing: "-0.01em",
};

export const bodyMd: CSSProperties = {
  ...geist,
  fontWeight: 400,
  fontSize: 15,
  lineHeight: 1.3,
  letterSpacing: "-0.01em",
};

export const bodySm: CSSProperties = {
  ...geist,
  fontWeight: 500,
  fontSize: 14,
  lineHeight: 1.4,
  letterSpacing: "-0.01em",
};

export const caption: CSSProperties = {
  ...geist,
  fontWeight: 500,
  fontSize: 13,
  lineHeight: 1.2,
  letterSpacing: "-0.01em",
};

export const micro: CSSProperties = {
  ...geist,
  fontWeight: 400,
  fontSize: 12,
  lineHeight: 1.2,
  letterSpacing: "-0.01em",
};

export const button: CSSProperties = {
  ...geist,
  fontWeight: 500,
  fontSize: 14,
  lineHeight: 1,
  letterSpacing: "-0.01em",
};

export const monoBase: CSSProperties = {
  ...mono,
  fontWeight: 500,
  fontSize: 13,
  lineHeight: 1.2,
  letterSpacing: "-0.01em",
};

export const monoLg: CSSProperties = {
  ...mono,
  fontWeight: 500,
  fontSize: 16,
  lineHeight: 1.2,
  letterSpacing: "-0.01em",
};
