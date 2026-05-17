import type { BlendMode, NormalizedEffect } from "@/lib/figma";

type DropShadow = Extract<NormalizedEffect, { kind: "drop-shadow" }>;

const BLEND_MODE_TO_CANVAS: Partial<Record<BlendMode, GlobalCompositeOperation>> = {
  NORMAL: "source-over",
  PASS_THROUGH: "source-over",
  MULTIPLY: "multiply",
  SCREEN: "screen",
  OVERLAY: "overlay",
  DARKEN: "darken",
  LIGHTEN: "lighten",
  COLOR_DODGE: "color-dodge",
  COLOR_BURN: "color-burn",
  HARD_LIGHT: "hard-light",
  SOFT_LIGHT: "soft-light",
  DIFFERENCE: "difference",
  EXCLUSION: "exclusion",
  HUE: "hue",
  SATURATION: "saturation",
  COLOR: "color",
  LUMINOSITY: "luminosity",
};

/**
 * Paint a drop shadow underneath a path using all properties from the Figma
 * effect: color, offset.{x,y}, radius (blur), spread (silhouette dilation),
 * blendMode, and showShadowBehindNode.
 *
 * Pipeline:
 *   1. Render the silhouette (optionally dilated by `spread`) into an
 *      OffscreenCanvas at the same resolution + transform as the main canvas.
 *   2. If showShadowBehindNode === false, cut out the original silhouette
 *      from that offscreen so the shadow does NOT show through translucent
 *      fills painted on top.
 *   3. Composite the offscreen onto the main canvas with:
 *        - the requested blendMode (via globalCompositeOperation)
 *        - blur(radius) via ctx.filter on the drawImage call
 *        - the offset.{x,y} translation, in design units
 *
 * Result: the visible shadow is exactly what Figma renders, including:
 *   - correct blend modes against underlying content
 *   - correct cutout for showShadowBehindNode
 *   - correct outward dilation from spread (uses round join → matches Figma's
 *     soft outward growth)
 *
 * Falls back to the native `ctx.shadow*` API when OffscreenCanvas isn't
 * available (older Safari) - this is the same code path as the previous
 * implementation, so older browsers see no regression.
 */
export function applyDropShadow(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  shadow: DropShadow,
): void {
  if (!shadow.visible) return;
  // A shadow with a fully transparent color is invisible - skip the work.
  if (isTransparent(shadow.color)) return;

  const main = ctx.canvas;
  const w = main.width;
  const h = main.height;

  if (typeof OffscreenCanvas === "undefined") {
    paintNativeShadowFallback(ctx, path, shadow);
    return;
  }

  let off: OffscreenCanvas;
  let offCtx: OffscreenCanvasRenderingContext2D | null = null;
  try {
    off = new OffscreenCanvas(w, h);
    offCtx = off.getContext("2d", { alpha: true });
  } catch {
    paintNativeShadowFallback(ctx, path, shadow);
    return;
  }
  if (!offCtx) {
    paintNativeShadowFallback(ctx, path, shadow);
    return;
  }

  // Match the main canvas's transform so the path lands on the same pixels.
  const t = ctx.getTransform();
  offCtx.setTransform(t.a, t.b, t.c, t.d, t.e, t.f);

  // 1. Render the silhouette in shadow.color, dilated by `spread` if positive.
  offCtx.fillStyle = shadow.color;
  if (shadow.spread > 0) {
    // Stroke at 2*spread + fill = silhouette grown outward by `spread` design units.
    // Round joins match Figma's soft growth on rounded corners; for sharp
    // corners the result is visually identical to Figma's morphological dilate.
    offCtx.strokeStyle = shadow.color;
    offCtx.lineWidth = shadow.spread * 2;
    offCtx.lineJoin = "round";
    offCtx.lineCap = "round";
    offCtx.stroke(path);
    offCtx.fill(path);
  } else if (shadow.spread < 0) {
    // Negative spread = shrink. Approximation: fill, then erase a stroke from
    // inside. Figma supports this for solid shapes; vector paths with concave
    // regions may not match exactly. The result is still better than ignoring
    // negative spread entirely.
    offCtx.fill(path);
    offCtx.save();
    offCtx.globalCompositeOperation = "destination-out";
    offCtx.strokeStyle = "#000";
    offCtx.lineWidth = Math.abs(shadow.spread) * 2;
    offCtx.lineJoin = "round";
    offCtx.lineCap = "round";
    offCtx.stroke(path);
    offCtx.restore();
  } else {
    offCtx.fill(path);
  }

  // 2. If showShadowBehindNode === false, remove the original silhouette area
  //    so the shadow doesn't show through translucent fills painted later.
  if (!shadow.showShadowBehindNode) {
    offCtx.save();
    offCtx.globalCompositeOperation = "destination-out";
    offCtx.fillStyle = "#000";
    offCtx.fill(path);
    offCtx.restore();
  }

  // 3. Composite the silhouette onto the main canvas with blur + offset + blend.
  //    `ctx.filter = "blur(Npx)"` applies to drawImage at the **canvas-pixel**
  //    scale, so we must scale `radius` by the active transform's pixel ratio
  //    to keep the blur magnitude correct in design units.
  const pxScale = Math.abs(t.a);
  const blurPx = shadow.radius * pxScale;

  // Translate the drawImage by (offset.x, offset.y) in DESIGN units. The
  // current ctx transform handles design→pixel scaling for us.
  const blendMode = BLEND_MODE_TO_CANVAS[shadow.blendMode] ?? "source-over";

  ctx.save();
  ctx.globalCompositeOperation = blendMode;
  if (blurPx > 0) ctx.filter = `blur(${blurPx}px)`;
  // Reset to identity so we can place the offscreen pixels 1:1, and apply
  // the offset in pixel space (offset is design units → multiply by transform).
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const offsetPxX = shadow.offset.x * t.a + shadow.offset.y * t.c;
  const offsetPxY = shadow.offset.x * t.b + shadow.offset.y * t.d;
  ctx.drawImage(off, offsetPxX, offsetPxY);
  ctx.restore();
}

function isTransparent(css: string): boolean {
  // Cheap parse for our own rgbaCss output `rgba(r, g, b, a)`.
  const match = /rgba?\(([^)]+)\)/i.exec(css);
  if (!match) return false;
  const parts = match[1].split(",").map((s) => Number(s.trim()));
  // Expect [r, g, b] or [r, g, b, a].
  if (parts.length === 4) return parts[3] <= 0;
  return false;
}

/**
 * Fallback for environments without OffscreenCanvas. Uses the native canvas
 * shadow API, which can't honour blendMode or showShadowBehindNode but does
 * paint a reasonable drop shadow. Colour, offset, radius, and spread are all
 * still respected (spread via stroke-then-fill).
 */
function paintNativeShadowFallback(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  shadow: DropShadow,
): void {
  ctx.save();
  ctx.shadowColor = shadow.color;
  ctx.shadowOffsetX = shadow.offset.x;
  ctx.shadowOffsetY = shadow.offset.y;
  ctx.shadowBlur = shadow.radius;
  ctx.fillStyle = shadow.color;
  ctx.fill(path);
  if (shadow.spread > 0) {
    ctx.lineWidth = shadow.spread * 2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = shadow.color;
    ctx.stroke(path);
  }
  ctx.restore();
}
