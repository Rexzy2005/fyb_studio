import type { NormalizedImageFill } from "@/lib/figma";
import { applyImageFiltersToBitmap, hasAnyImageFilter } from "./filters";

/**
 * Apply a NormalizedImageFill paint to a clipped region. The caller has
 * already clipped to the shape; we draw within the supplied frame using
 * the paint's scaleMode + filters + optional rotation/transform.
 */
export function applyImageFill(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  fill: NormalizedImageFill,
  frame: {
    x: number;
    y: number;
    width: number;
    height: number;
    /** Editor-only override: when present, takes precedence over fill.scaleMode. */
    objectFit?: "cover" | "contain";
  },
): void {
  // Pre-process: bake the design's image filters into a working bitmap
  // before any scale-mode placement runs. This keeps the filter math in
  // one place (filters.ts) and uses pixel-accurate adjustments rather
  // than the much rougher CSS filter chain.
  let workingSource: CanvasImageSource = source;
  if (hasAnyImageFilter(fill.filters)) {
    const filtered = applyImageFiltersToBitmap(source, fill.filters!);
    if (filtered) workingSource = filtered;
  }

  const sw = imageWidth(workingSource);
  const sh = imageHeight(workingSource);

  ctx.save();

  // Apply rotation (image-paint-level rotation, around frame center, in degrees).
  if (fill.rotation && fill.rotation !== 0) {
    const cx = frame.x + frame.width / 2;
    const cy = frame.y + frame.height / 2;
    ctx.translate(cx, cy);
    ctx.rotate((fill.rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }

  // Resolve scale mode. User/admin replacement images may override the JSON
  // paint with cover/contain, but original design images must follow the
  // declared `scaleMode` exactly. Some plugin exports include imageTransform on
  // non-CROP fills; treating that as crop shrinks otherwise-normal FILL images.
  const mode: NormalizedImageFill["scaleMode"] = frame.objectFit
    ? frame.objectFit === "contain"
      ? "FIT"
      : "FILL"
    : fill.scaleMode;

  switch (mode) {
    case "FILL":
      drawCoverContain(ctx, workingSource, sw, sh, frame, "cover");
      break;
    case "FIT":
      drawCoverContain(ctx, workingSource, sw, sh, frame, "contain");
      break;
    case "STRETCH":
      ctx.drawImage(workingSource, frame.x, frame.y, frame.width, frame.height);
      break;
    case "CROP":
      drawCrop(ctx, workingSource, sw, sh, frame, fill.imageTransform);
      break;
    case "TILE":
      drawTile(ctx, workingSource, sw, sh, frame, fill.scalingFactor ?? 0.5);
      break;
    default:
      drawCoverContain(ctx, workingSource, sw, sh, frame, "cover");
  }

  ctx.restore();
}

function drawCoverContain(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sw: number,
  sh: number,
  frame: { x: number; y: number; width: number; height: number },
  fit: "cover" | "contain",
): void {
  if (!sw || !sh) return;
  const scale =
    fit === "cover"
      ? Math.max(frame.width / sw, frame.height / sh)
      : Math.min(frame.width / sw, frame.height / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  const dx = frame.x + (frame.width - dw) / 2;
  const dy = frame.y + (frame.height - dh) / 2;
  ctx.drawImage(source, dx, dy, dw, dh);
}

function drawCrop(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sw: number,
  sh: number,
  frame: { x: number; y: number; width: number; height: number },
  imageTransform: NormalizedImageFill["imageTransform"],
): void {
  // imageTransform is a 2x3 matrix mapping unit-square to crop region.
  // Without one, fall back to FILL behaviour.
  if (!imageTransform || !sw || !sh) {
    drawCoverContain(ctx, source, sw, sh, frame, "cover");
    return;
  }

  // Figma stores CROP as an affine transform from destination unit-square
  // coordinates to source image unit-square coordinates. Instead of reducing
  // that matrix to an axis-aligned source rect, invert the full matrix and
  // draw the complete image through it while clipping to the destination
  // frame. This preserves rotated and skewed crop transforms.
  const m = imageTransform;
  const det = m.a * m.d - m.b * m.c;
  if (Math.abs(det) < 1e-8) {
    drawCoverContain(ctx, source, sw, sh, frame, "cover");
    return;
  }

  const inv = {
    a: m.d / det,
    b: -m.b / det,
    c: -m.c / det,
    d: m.a / det,
    tx: (m.c * m.ty - m.d * m.tx) / det,
    ty: (m.b * m.tx - m.a * m.ty) / det,
  };

  ctx.save();
  ctx.beginPath();
  ctx.rect(frame.x, frame.y, frame.width, frame.height);
  ctx.clip();
  ctx.transform(
    (frame.width * inv.a) / sw,
    (frame.height * inv.b) / sw,
    (frame.width * inv.c) / sh,
    (frame.height * inv.d) / sh,
    frame.x + frame.width * inv.tx,
    frame.y + frame.height * inv.ty,
  );
  ctx.drawImage(source, 0, 0, sw, sh);
  ctx.restore();
}

function drawTile(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sw: number,
  sh: number,
  frame: { x: number; y: number; width: number; height: number },
  scalingFactor: number,
): void {
  if (!sw || !sh) return;
  const tileW = sw * scalingFactor;
  const tileH = sh * scalingFactor;
  ctx.save();
  ctx.beginPath();
  ctx.rect(frame.x, frame.y, frame.width, frame.height);
  ctx.clip();
  for (let y = frame.y; y < frame.y + frame.height; y += tileH) {
    for (let x = frame.x; x < frame.x + frame.width; x += tileW) {
      ctx.drawImage(source, x, y, tileW, tileH);
    }
  }
  ctx.restore();
}

function imageWidth(source: CanvasImageSource): number {
  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) return source.width;
  if (typeof HTMLImageElement !== "undefined" && source instanceof HTMLImageElement)
    return source.naturalWidth || source.width;
  if (typeof HTMLCanvasElement !== "undefined" && source instanceof HTMLCanvasElement)
    return source.width;
  if (typeof OffscreenCanvas !== "undefined" && source instanceof OffscreenCanvas)
    return source.width;
  if (typeof HTMLVideoElement !== "undefined" && source instanceof HTMLVideoElement)
    return source.videoWidth;
  return Number((source as { width?: number }).width ?? 0);
}

function imageHeight(source: CanvasImageSource): number {
  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) return source.height;
  if (typeof HTMLImageElement !== "undefined" && source instanceof HTMLImageElement)
    return source.naturalHeight || source.height;
  if (typeof HTMLCanvasElement !== "undefined" && source instanceof HTMLCanvasElement)
    return source.height;
  if (typeof OffscreenCanvas !== "undefined" && source instanceof OffscreenCanvas)
    return source.height;
  if (typeof HTMLVideoElement !== "undefined" && source instanceof HTMLVideoElement)
    return source.videoHeight;
  return Number((source as { height?: number }).height ?? 0);
}
