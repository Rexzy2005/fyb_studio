import type { NormalizedEffect } from "@/lib/figma";
import { createDeterministicRandom } from "@/lib/render/features/deterministicRandom";

type TextureEffect = Extract<NormalizedEffect, { kind: "texture" }>;

/**
 * Figma's TEXTURE effect simulates surface roughness with embossed grain.
 *
 * Best-effort canvas approximation:
 *   - Generate a value-noise tile sized by `noiseSize`.
 *   - Overlay it with `overlay` blend mode so it lights/darkens the
 *     underlying pixels rather than tinting them.
 *   - Soften by `radius` via ctx.filter blur on the overlay draw.
 *   - When `clipToShape` is false, draw to the full bbox (default true).
 *
 * Caches the noise tile module-side so repeated textures share work.
 */
export function applyTextureOverlay(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  bbox: { x: number; y: number; width: number; height: number },
  effect: TextureEffect,
): void {
  if (!effect.visible) return;
  const tile = buildTextureTile();
  if (!tile) return;

  ctx.save();
  if (effect.clipToShape) ctx.clip(path);
  ctx.globalCompositeOperation = "overlay";
  // Slight softening so the grain feels like surface texture rather than dot noise.
  if (effect.radius > 0) ctx.filter = `blur(${effect.radius}px)`;

  const pattern = ctx.createPattern(tile, "repeat");
  if (pattern) {
    applyPatternScale(pattern, effect.noiseSize);
    ctx.fillStyle = pattern;
    ctx.fillRect(bbox.x, bbox.y, bbox.width, bbox.height);
  }
  ctx.restore();
}

const TEXTURE_CACHE = new Map<number, HTMLCanvasElement | OffscreenCanvas>();
const TEXTURE_CELL_COUNT = 96;

function buildTextureTile(): HTMLCanvasElement | OffscreenCanvas | null {
  const size = TEXTURE_CELL_COUNT;
  const hit = TEXTURE_CACHE.get(size);
  if (hit) return hit;

  const tile = createOffscreen(size, size);
  if (!tile) return null;
  const tctx = tile.getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!tctx) return null;

  const random = createDeterministicRandom(`texture|${size}`);
  const img = tctx.createImageData(size, size);
  const buf = img.data;
  for (let i = 0; i < buf.length; i += 4) {
    // Soft value-noise: centred around 128 so overlay blend leaves
    // midtones untouched and pushes highlights/shadows symmetrically.
    const v = 96 + Math.floor(random() * 64);
    buf[i] = v;
    buf[i + 1] = v;
    buf[i + 2] = v;
    buf[i + 3] = 255;
  }
  tctx.putImageData(img, 0, 0);
  TEXTURE_CACHE.set(size, tile);
  return tile;
}

function createOffscreen(w: number, h: number): HTMLCanvasElement | OffscreenCanvas | null {
  if (typeof OffscreenCanvas !== "undefined") {
    try { return new OffscreenCanvas(w, h); } catch { /* fall through */ }
  }
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function applyPatternScale(pattern: CanvasPattern, noiseSize: number): void {
  if (typeof DOMMatrix === "undefined") return;
  if (typeof pattern.setTransform !== "function") return;
  const scale = Number.isFinite(noiseSize) && noiseSize > 0 ? noiseSize : 1;
  pattern.setTransform(new DOMMatrix([scale, 0, 0, scale, 0, 0]));
}
