import type { NormalizedNode } from "@/lib/figma";

type NonTextNode = Exclude<NormalizedNode, { kind: "text" }>;
type GradientFill = Extract<NonTextNode["fills"][number], { kind: "gradient" }>;

/**
 * Build a CanvasGradient for a node's gradient fill.
 *
 * Currently supports `linear` and `radial`. `angular` and `diamond` are
 * captured by the normalizer but not yet drawable here — they fall back
 * to the gradient's first stop colour upstream (cssFallback).
 */
export function createGradient(
  ctx: CanvasRenderingContext2D,
  node: NonTextNode,
  fill: GradientFill,
  frameOverride?: { x: number; y: number; width: number; height: number },
): CanvasGradient | null {
  const { x, y, width, height } = frameOverride ?? node.frame;

  if (fill.gradientType === "linear") {
    const h0 = fill.handlePositions?.[0];
    const h1 = fill.handlePositions?.[1];
    const x0 = x + (h0 ? h0.x * width : 0);
    const y0 = y + (h0 ? h0.y * height : 0);
    const x1 = x + (h1 ? h1.x * width : width);
    const y1 = y + (h1 ? h1.y * height : 0);

    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (const s of fill.stops) g.addColorStop(s.offset, s.colorCss);
    return g;
  }

  if (fill.gradientType === "radial") {
    const cx = x + width / 2;
    const cy = y + height / 2;
    const r = Math.max(width, height) / 2;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    for (const s of fill.stops) g.addColorStop(s.offset, s.colorCss);
    return g;
  }

  return null;
}
