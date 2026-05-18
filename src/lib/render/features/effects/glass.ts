import type { NormalizedEffect } from "@/lib/figma";

type GlassEffect = Extract<NormalizedEffect, { kind: "glass" }>;

/**
 * Figma's GLASS effect simulates a refracting plate over the layer behind
 * the node. The visible result has three components:
 *   1. A blurred + slightly displaced view of the backdrop (refraction).
 *   2. A radial light sweep from `lightAngle` for `lightIntensity`.
 *   3. A subtle chromatic fringe from `dispersion`.
 *
 * This implementation captures the canvas backdrop within the node's bbox,
 * blurs it by `refraction * 8 + depth * 0.5`, paints it back clipped to the
 * shape with a soft alpha, then layers a gradient sheen on top. It's a
 * faithful visual approximation rather than a physically-accurate model.
 */
export function applyGlassOverlay(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  bbox: { x: number; y: number; width: number; height: number },
  effect: GlassEffect,
): void {
  if (!effect.visible) return;
  if (typeof OffscreenCanvas === "undefined") return; // best-effort only

  const xform = ctx.getTransform();
  const sourceW = Math.max(1, bbox.width * Math.abs(xform.a));
  const sourceH = Math.max(1, bbox.height * Math.abs(xform.d));
  const sx = Math.max(1, Math.ceil(sourceW));
  const sy = Math.max(1, Math.ceil(sourceH));

  const back = new OffscreenCanvas(sx, sy);
  const bctx = back.getContext("2d");
  if (!bctx) return;

  // Snapshot what's already painted under the node.
  bctx.drawImage(
    ctx.canvas,
    bbox.x * xform.a + xform.e,
    bbox.y * xform.d + xform.f,
    sourceW, sourceH,
    0, 0, sx, sy,
  );

  ctx.save();
  ctx.clip(path);

  // Refracted backdrop with blur driven by refraction + depth.
  const blurPx = Math.max(0, effect.refraction * 8 + effect.depth * 0.5);
  const prevFilter = ctx.filter;
  if (blurPx > 0) ctx.filter = `blur(${blurPx}px)`;
  ctx.drawImage(back, bbox.x, bbox.y, bbox.width, bbox.height);
  ctx.filter = prevFilter;

  // Chromatic fringe - translate-redraw with R/B channels offset.
  if (effect.dispersion > 0) {
    const off = effect.dispersion * 4;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = effect.dispersion * 0.35;
    ctx.drawImage(back, bbox.x + off, bbox.y, bbox.width, bbox.height);
    ctx.drawImage(back, bbox.x - off, bbox.y, bbox.width, bbox.height);
    ctx.restore();
  }

  // Light sweep - linear gradient from lightAngle.
  if (effect.lightIntensity > 0) {
    const angleRad = (effect.lightAngle * Math.PI) / 180;
    const dx = Math.cos(angleRad);
    const dy = Math.sin(angleRad);
    const cx = bbox.x + bbox.width / 2;
    const cy = bbox.y + bbox.height / 2;
    const half = Math.hypot(bbox.width, bbox.height) / 2;
    const x1 = cx - dx * half;
    const y1 = cy - dy * half;
    const x2 = cx + dx * half;
    const y2 = cy + dy * half;
    const grad = ctx.createLinearGradient(x1, y1, x2, y2);
    grad.addColorStop(0, `rgba(255,255,255,${effect.lightIntensity * 0.35})`);
    grad.addColorStop(0.5, `rgba(255,255,255,${effect.lightIntensity * 0.08})`);
    grad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = grad;
    ctx.fillRect(bbox.x, bbox.y, bbox.width, bbox.height);
  }

  // Edge feather - soft inner ring at `radius`.
  if (effect.radius > 0) {
    ctx.save();
    ctx.globalCompositeOperation = "destination-in";
    const grad2 = ctx.createRadialGradient(
      bbox.x + bbox.width / 2,
      bbox.y + bbox.height / 2,
      Math.max(0, Math.min(bbox.width, bbox.height) / 2 - effect.radius),
      bbox.x + bbox.width / 2,
      bbox.y + bbox.height / 2,
      Math.max(bbox.width, bbox.height) / 2,
    );
    grad2.addColorStop(0, "rgba(0,0,0,1)");
    grad2.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad2;
    ctx.fillRect(bbox.x, bbox.y, bbox.width, bbox.height);
    ctx.restore();
  }

  ctx.restore();
}
