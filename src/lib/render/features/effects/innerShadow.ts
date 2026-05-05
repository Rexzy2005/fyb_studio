import type { NormalizedEffect } from "@/lib/figma";

type InnerShadow = Extract<NormalizedEffect, { kind: "inner-shadow" }>;

/**
 * Paint an inner shadow inside the given path. Implementation strategy:
 *   1. Save state.
 *   2. Clip to the shape so painting is constrained inside.
 *   3. Set shadow API (offset/blur/color), set globalCompositeOperation to
 *      'source-atop' so the shadow only appears on top of the clipped fill.
 *   4. Stroke the path at large width with shadowBlur enabled — the blurred
 *      stroke that lands inside the clip area renders the inner shadow.
 *   5. Restore.
 */
export function applyInnerShadow(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  shadow: InnerShadow,
): void {
  if (!shadow.visible) return;

  ctx.save();
  ctx.clip(path);

  // Trick: clear the clipped area, then paint the inverse silhouette (a large
  // rect minus the shape) with the shadow API to cast a shadow inward.
  ctx.shadowColor = shadow.color;
  ctx.shadowOffsetX = shadow.offset.x;
  ctx.shadowOffsetY = shadow.offset.y;
  ctx.shadowBlur = shadow.radius;
  ctx.globalCompositeOperation = "source-atop";

  // Build an inverse path: huge outer rect + the shape (evenodd fills the ring).
  const inverse = new Path2D();
  inverse.rect(-1e6, -1e6, 2e6, 2e6);
  inverse.addPath(path);

  ctx.fillStyle = shadow.color;
  // evenodd ensures the rectangle fills around the shape, casting an inward shadow.
  ctx.fill(inverse, "evenodd");

  ctx.restore();
}
