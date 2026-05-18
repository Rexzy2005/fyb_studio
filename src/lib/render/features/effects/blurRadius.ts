const FIGMA_RADIUS_TO_GAUSSIAN_SIGMA = 0.5;

/**
 * Figma exposes blur as a visual radius. Canvas/SVG filter blur uses Gaussian
 * standard deviation, so feeding the raw Figma value into `blur(px)` makes the
 * result look much softer than the source design.
 */
export function figmaBlurRadiusToSigma(radius: number): number {
  if (!Number.isFinite(radius) || radius <= 0) return 0;
  return radius * FIGMA_RADIUS_TO_GAUSSIAN_SIGMA;
}

export function figmaBlurRadiusToCanvasPx(
  radius: number,
  transform?: Pick<DOMMatrix, "a" | "b" | "c" | "d">,
): number {
  const sigma = figmaBlurRadiusToSigma(radius);
  if (sigma <= 0) return 0;
  if (!transform) return sigma;
  return sigma * getCanvasScale(transform);
}

function getCanvasScale(transform: Pick<DOMMatrix, "a" | "b" | "c" | "d">): number {
  const xScale = Math.hypot(transform.a, transform.b);
  const yScale = Math.hypot(transform.c, transform.d);
  const scale = Math.max(xScale, yScale);
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}
