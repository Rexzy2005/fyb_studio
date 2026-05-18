import type { BlendMode, NormalizedEffect } from "@/lib/figma";
import { createDeterministicRandom } from "@/lib/render/features/deterministicRandom";

type NoiseEffect = Extract<NormalizedEffect, { kind: "noise" }>;

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
 * Paint a grain overlay clipped to the node's silhouette.
 *
 * Approach:
 *   1. Build a noise tile (sized by `noiseSize`) once into a cached
 *      OffscreenCanvas keyed by colour + size - reused across nodes that
 *      share the same noise spec.
 *   2. Save ctx, clip to the path, tile-fill the bbox with the tile.
 *   3. Restore.
 *
 * Performance: an 8x8 noise tile generates 256 random bytes - cheap enough
 * to recompute per (node + noise spec). We don't try to dither across nodes
 * so the grain appears stable when an admin re-renders the same design.
 */
export function applyNoiseOverlay(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  bbox: { x: number; y: number; width: number; height: number },
  effect: NoiseEffect,
): void {
  if (!effect.visible) return;
  const tile = buildNoiseTile(effect);
  if (!tile) return;

  ctx.save();
  ctx.clip(path);

  const op = BLEND_MODE_TO_CANVAS[effect.blendMode] ?? "source-over";
  ctx.globalCompositeOperation = op;
  if (effect.noiseType === "multitone" && effect.opacity < 1) {
    ctx.globalAlpha *= effect.opacity;
  }

  const pattern = ctx.createPattern(tile, "repeat");
  if (pattern) {
    applyPatternScale(pattern, effect.noiseSize);
    ctx.fillStyle = pattern;
    ctx.fillRect(bbox.x, bbox.y, bbox.width, bbox.height);
  }

  ctx.restore();
}

/* ─── Tile cache ──────────────────────────────────────────── */
// Module-level so multiple nodes with the same noise spec share a tile.
const TILE_CACHE = new Map<string, HTMLCanvasElement | OffscreenCanvas>();
const TILE_CELL_COUNT = 64;

function buildNoiseTile(effect: NoiseEffect): HTMLCanvasElement | OffscreenCanvas | null {
  // The tile's cell count is fixed; the JSON `noiseSize` is applied exactly
  // as a pattern transform when the tile is painted.
  const size = TILE_CELL_COUNT;
  const cacheKey = [
    effect.noiseType,
    effect.color,
    effect.secondaryColor ?? "",
    String(effect.density),
  ].join("|");

  const hit = TILE_CACHE.get(cacheKey);
  if (hit) return hit;

  const tile = createOffscreen(size, size);
  if (!tile) return null;
  const tctx = tile.getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!tctx) return null;

  const random = createDeterministicRandom(cacheKey);
  const img = tctx.createImageData(size, size);
  const buf = img.data;
  const [r, g, b] = parseRgba(effect.color);
  const [r2, g2, b2] = effect.secondaryColor
    ? parseRgba(effect.secondaryColor)
    : [r, g, b, 1];

  for (let i = 0; i < buf.length; i += 4) {
    // Density gate: random <= density places a grain pixel.
    const hit = random() <= effect.density;
    if (!hit) {
      buf[i] = 0;
      buf[i + 1] = 0;
      buf[i + 2] = 0;
      buf[i + 3] = 0;
      continue;
    }
    if (effect.noiseType === "duotone") {
      // Half the grains use the secondary colour.
      const useSecondary = random() < 0.5;
      buf[i] = useSecondary ? r2 : r;
      buf[i + 1] = useSecondary ? g2 : g;
      buf[i + 2] = useSecondary ? b2 : b;
      buf[i + 3] = 255;
    } else {
      // Monotone/multitone - solid colour with random alpha for tonal jitter.
      const alpha = effect.noiseType === "multitone"
        ? 180 + Math.floor(random() * 75)
        : 255;
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
      buf[i + 3] = alpha;
    }
  }
  tctx.putImageData(img, 0, 0);
  TILE_CACHE.set(cacheKey, tile);
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

function parseRgba(css: string): [number, number, number, number] {
  const m = /rgba?\(([^)]+)\)/i.exec(css);
  if (!m) return [0, 0, 0, 1];
  const parts = m[1].split(",").map((s) => Number(s.trim()));
  return [parts[0] | 0, parts[1] | 0, parts[2] | 0, parts[3] ?? 1];
}
