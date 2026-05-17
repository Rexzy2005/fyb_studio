/**
 * Framer design tokens - single source of truth for inline styles
 * where Tailwind arbitrary values would be awkward (animations,
 * dynamic gradients, runtime-computed surfaces). For static class-
 * based usage prefer the Tailwind theme: `bg-canvas`, `text-ink`, etc.
 *
 * Mirrors DESIGN.md and globals.css :root.
 */

export const COLORS = {
  canvas: "#090909",
  surface1: "#141414",
  surface2: "#1c1c1c",
  surface3: "#242424",
  hairline: "#262626",
  hairlineSoft: "#1a1a1a",

  ink: "#ffffff",
  inkMuted: "#999999",
  inkFaint: "#666666",

  accentBlue: "#0099ff",
  accentBlueSoft: "rgba(0, 153, 255, 0.14)",
  accentBlueRing: "rgba(0, 153, 255, 0.45)",

  gradientMagenta: "#d44df0",
  gradientViolet: "#6a4cf5",
  gradientOrange: "#ff7a3d",
  gradientCoral: "#ff5577",

  semanticSuccess: "#22c55e",
  semanticWarning: "#f59e0b",
  semanticDanger: "#ef4444",
} as const;

export const RADII = {
  xs: 4,
  sm: 6,
  md: 10,
  lg: 15,
  xl: 20,
  xxl: 30,
  pill: 100,
  full: 9999,
} as const;

export const SPACING = {
  hair: 1,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 40,
  hero: 80,
} as const;

/** Spotlight gradient palettes - used by SpotlightCard. */
export const SPOTLIGHT_GRADIENTS = {
  violet: "radial-gradient(120% 120% at 0% 0%, #7d4cff 0%, #4a1ed1 45%, #18062f 100%)",
  magenta: "radial-gradient(120% 120% at 100% 0%, #f06bff 0%, #b32de1 45%, #2c0738 100%)",
  orange: "radial-gradient(120% 120% at 0% 100%, #ff9555 0%, #ff5d2a 45%, #3a0f00 100%)",
  coral: "radial-gradient(120% 120% at 100% 100%, #ff7392 0%, #e8395f 45%, #38030f 100%)",
} as const;

export type SpotlightVariant = keyof typeof SPOTLIGHT_GRADIENTS;
