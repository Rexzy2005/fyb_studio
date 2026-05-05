import type { NormalizedNode } from "@/lib/figma";

type NonTextNode = Exclude<NormalizedNode, { kind: "text" }>;
type GradientFill = Extract<NonTextNode["fills"][number], { kind: "gradient" }>;

type Frame = { x: number; y: number; width: number; height: number };

/**
 * Paint a gradient fill into a path on the supplied canvas context.
 *
 * For linear and radial we use the native CanvasGradient API (hardware-
 * accelerated, perfectly smooth). For angular (conic) we use the native
 * `createConicGradient` API where supported, otherwise we render the sweep
 * into an offscreen canvas at the destination's exact pixel resolution and
 * blit it through a path clip — no CanvasPattern transform tricks, no
 * subpixel drift. Diamond is always rendered the same offscreen way (no
 * native equivalent exists in canvas APIs).
 *
 * Per-pixel renderers use:
 *   - 1024-entry color LUT with linear interpolation between adjacent entries
 *     for smooth color blending across stops.
 *   - 4×4 ordered (Bayer) dithering on the output to break up the visible
 *     banding common to long, low-contrast gradients on 8-bit displays.
 *
 * Returns true when the fill was painted; false if it couldn't (the caller
 * should then fall back to drawing `fill.cssFallback`).
 */
export function paintGradientFill(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  fill: GradientFill,
  frame: Frame,
): boolean {
  if (frame.width <= 0 || frame.height <= 0) return false;
  if (fill.stops.length === 0) return false;

  if (fill.gradientType === "linear") {
    ctx.fillStyle = buildLinearGradient(ctx, frame, fill);
    ctx.fill(path);
    return true;
  }
  if (fill.gradientType === "radial") {
    ctx.fillStyle = buildRadialGradient(ctx, frame, fill);
    ctx.fill(path);
    return true;
  }
  if (fill.gradientType === "angular") {
    if (tryNativeConicGradient(ctx, path, frame, fill)) return true;
    return blitProceduralGradient(ctx, path, frame, fill, "angular");
  }
  if (fill.gradientType === "diamond") {
    return blitProceduralGradient(ctx, path, frame, fill, "diamond");
  }
  return false;
}

/* ============================================================
 * Native gradient builders (linear + radial)
 * ============================================================ */

function buildLinearGradient(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  fill: GradientFill,
): CanvasGradient {
  const h0 = fill.handlePositions?.[0] ?? { x: 0, y: 0.5 };
  const h1 = fill.handlePositions?.[1] ?? { x: 1, y: 0.5 };
  const g = ctx.createLinearGradient(
    frame.x + h0.x * frame.width,
    frame.y + h0.y * frame.height,
    frame.x + h1.x * frame.width,
    frame.y + h1.y * frame.height,
  );
  for (const s of fill.stops) g.addColorStop(s.offset, s.colorCss);
  return g;
}

function buildRadialGradient(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  fill: GradientFill,
): CanvasGradient {
  // Figma's three handles: [0]=center, [1]=edge along X axis, [2]=edge along Y axis.
  // Without handles, default to a centered radial covering the bounds.
  const h0 = fill.handlePositions?.[0] ?? { x: 0.5, y: 0.5 };
  const h1 = fill.handlePositions?.[1] ?? { x: 1.0, y: 0.5 };
  const cx = frame.x + h0.x * frame.width;
  const cy = frame.y + h0.y * frame.height;
  const ex = frame.x + h1.x * frame.width;
  const ey = frame.y + h1.y * frame.height;
  const r = Math.max(1, Math.hypot(ex - cx, ey - cy));
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  for (const s of fill.stops) g.addColorStop(s.offset, s.colorCss);
  return g;
}

/* ============================================================
 * Native angular (conic) gradient — fast path
 * ============================================================ */

function tryNativeConicGradient(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  frame: Frame,
  fill: GradientFill,
): boolean {
  const factory = (
    ctx as unknown as { createConicGradient?: (a: number, x: number, y: number) => CanvasGradient }
  ).createConicGradient;
  if (typeof factory !== "function") return false;

  const h0 = fill.handlePositions?.[0] ?? { x: 0.5, y: 0.5 };
  const h1 = fill.handlePositions?.[1] ?? { x: 0.5, y: 0 };
  const cx = frame.x + h0.x * frame.width;
  const cy = frame.y + h0.y * frame.height;
  const dx = (h1.x - h0.x) * frame.width;
  const dy = (h1.y - h0.y) * frame.height;
  // Convert from "vector pointing to the start of the sweep" to a CSS-style
  // start angle measured from the positive X axis (3 o'clock), increasing CW.
  const startAngle = Math.atan2(dy, dx);

  try {
    const g = factory.call(ctx, startAngle, cx, cy);
    for (const s of fill.stops) g.addColorStop(s.offset, s.colorCss);
    ctx.fillStyle = g;
    ctx.fill(path);
    return true;
  } catch {
    return false;
  }
}

/* ============================================================
 * Procedural gradients (angular fallback + diamond)
 *
 * Strategy: render the gradient into an offscreen canvas at the destination's
 * exact canvas-pixel resolution, then save → clip(path) → drawImage at the
 * frame's design-unit position. The active ctx transform handles the design→
 * pixel scaling, so source pixels and destination pixels are 1:1 — no
 * CanvasPattern transform interactions, no bilinear softness.
 * ============================================================ */

const MAX_RASTER_DIM = 2048;

function blitProceduralGradient(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  frame: Frame,
  fill: GradientFill,
  kind: "angular" | "diamond",
): boolean {
  const t = ctx.getTransform();
  // Use the linear scale from each axis; for rotated nodes this is the
  // dominant axis scale (good enough — gradients are rotation-invariant
  // patterns, only their bounding rect matters).
  const scaleX = Math.hypot(t.a, t.b);
  const scaleY = Math.hypot(t.c, t.d);
  const targetW = Math.min(MAX_RASTER_DIM, Math.max(8, Math.round(frame.width * scaleX)));
  const targetH = Math.min(MAX_RASTER_DIM, Math.max(8, Math.round(frame.height * scaleY)));

  const off = makeOffscreen(targetW, targetH);
  if (!off) return false;

  const lut = buildStopLut(fill.stops, 1024);

  if (kind === "angular") {
    const h0 = fill.handlePositions?.[0] ?? { x: 0.5, y: 0.5 };
    const h1 = fill.handlePositions?.[1] ?? { x: 0.5, y: 0 };
    const dx = (h1.x - h0.x) * frame.width;
    const dy = (h1.y - h0.y) * frame.height;
    const startAngle = Math.atan2(dy, dx);
    rasterAngularInto(off.ctx, targetW, targetH, lut, startAngle);
  } else {
    const h1 = fill.handlePositions?.[1];
    const h2 = fill.handlePositions?.[2];
    const halfX =
      (h1 ? Math.abs(h1.x - 0.5) * 2 : 1) * targetW * 0.5 || targetW * 0.5;
    const halfY =
      (h2 ? Math.abs(h2.y - 0.5) * 2 : 1) * targetH * 0.5 || targetH * 0.5;
    rasterDiamondInto(off.ctx, targetW, targetH, lut, halfX, halfY);
  }

  // Direct blit through path clip — pixel-exact, no pattern transform.
  ctx.save();
  ctx.clip(path);
  // Toggle off image smoothing for this single drawImage so the source pixels
  // map 1:1 to canvas pixels without browser-specific bilinear softening.
  // (We rendered the offscreen at the EXACT destination pixel resolution.)
  const prevSmoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(off.canvas, frame.x, frame.y, frame.width, frame.height);
  ctx.imageSmoothingEnabled = prevSmoothing;
  ctx.restore();
  return true;
}

/* ============================================================
 * Per-pixel raster + Bayer dithering
 * ============================================================ */

// 4×4 Bayer matrix. Returns a SUB-BYTE perturbation in [-0.5, +0.46875] which
// biases the float→byte rounding done by Uint8ClampedArray. The amplitude is
// small enough to be imperceptible per-pixel (less than one quantization step)
// but consistent enough to break up the perceptual banding that 8-bit gradients
// produce on long, low-contrast transitions.
//
// Bigger offsets (e.g. ±5) DESTROY a smooth gradient by adding visible noise
// that looks like sharp stops — that's the bug we had before.
const BAYER_4X4 = new Int8Array([
  0,  8,  2, 10,
  12, 4, 14, 6,
  3, 11,  1, 9,
  15, 7, 13, 5,
]);

function ditherOffset(x: number, y: number): number {
  // bayer ∈ [0,15], minus 7.5 centers around 0, divided by 16 → ±0.5 of a byte.
  return (BAYER_4X4[(y & 3) * 4 + (x & 3)] - 7.5) / 16;
}

function rasterAngularInto(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  w: number,
  h: number,
  lut: Uint8ClampedArray,
  startAngle: number,
): void {
  const img = ctx.createImageData(w, h);
  const buf = img.data;
  const cx = w / 2;
  const cy = h / 2;
  const TWO_PI = Math.PI * 2;
  const INV_TWO_PI = 1 / TWO_PI;
  const last = lut.length / 4 - 1;

  for (let y = 0; y < h; y++) {
    const dy = y - cy;
    const rowOffset = y * w * 4;
    for (let x = 0; x < w; x++) {
      const dx = x - cx;
      let theta = Math.atan2(dy, dx) - startAngle;
      theta = ((theta % TWO_PI) + TWO_PI) % TWO_PI;
      const t = theta * INV_TWO_PI;
      sampleLutDithered(lut, last, t, buf, rowOffset + x * 4, x, y);
    }
  }
  ctx.putImageData(img, 0, 0);
}

function rasterDiamondInto(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  w: number,
  h: number,
  lut: Uint8ClampedArray,
  halfX: number,
  halfY: number,
): void {
  const img = ctx.createImageData(w, h);
  const buf = img.data;
  const cx = w / 2;
  const cy = h / 2;
  const invHalfX = 1 / halfX;
  const invHalfY = 1 / halfY;
  const last = lut.length / 4 - 1;

  for (let y = 0; y < h; y++) {
    const ay = Math.abs(y - cy) * invHalfY;
    const rowOffset = y * w * 4;
    for (let x = 0; x < w; x++) {
      const ax = Math.abs(x - cx) * invHalfX;
      // L1 (Manhattan) distance produces diamond iso-contours.
      const t = Math.min(1, ax + ay);
      sampleLutDithered(lut, last, t, buf, rowOffset + x * 4, x, y);
    }
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Sample the LUT with linear interpolation between adjacent entries, then
 * apply a tiny ordered-dither perturbation. The LUT lerp gives smoothness
 * across stops; the dither adds sub-pixel noise that breaks up the visible
 * banding inherent to 8-bit gradients.
 */
function sampleLutDithered(
  lut: Uint8ClampedArray,
  last: number,
  t: number,
  buf: Uint8ClampedArray,
  outOffset: number,
  px: number,
  py: number,
): void {
  const exact = Math.max(0, Math.min(last, t * last));
  const lo = Math.floor(exact);
  const hi = Math.min(lo + 1, last);
  const k = exact - lo;
  const li = lo * 4;
  const hi4 = hi * 4;
  const d = ditherOffset(px, py);
  // Uint8ClampedArray clamps to [0,255] on assignment.
  buf[outOffset]     = lut[li]     * (1 - k) + lut[hi4]     * k + d;
  buf[outOffset + 1] = lut[li + 1] * (1 - k) + lut[hi4 + 1] * k + d;
  buf[outOffset + 2] = lut[li + 2] * (1 - k) + lut[hi4 + 2] * k + d;
  buf[outOffset + 3] = lut[li + 3] * (1 - k) + lut[hi4 + 3] * k;
}

/* ============================================================
 * Stop LUT + offscreen helpers + color parsing
 * ============================================================ */

function buildStopLut(
  stops: GradientFill["stops"],
  size = 1024,
): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(size * 4);
  const parsed = stops
    .map((s) => ({ offset: s.offset, rgba: parseRgba(s.colorCss) }))
    .sort((a, b) => a.offset - b.offset);

  for (let i = 0; i < size; i++) {
    const t = i / (size - 1);
    let lo = parsed[0];
    let hi = parsed[parsed.length - 1];
    if (t <= lo.offset) {
      writeLut(lut, i, lo.rgba);
      continue;
    }
    if (t >= hi.offset) {
      writeLut(lut, i, hi.rgba);
      continue;
    }
    for (let j = 0; j < parsed.length - 1; j++) {
      if (t >= parsed[j].offset && t <= parsed[j + 1].offset) {
        lo = parsed[j];
        hi = parsed[j + 1];
        break;
      }
    }
    const span = hi.offset - lo.offset;
    const k = span > 0 ? (t - lo.offset) / span : 0;
    writeLut(lut, i, [
      lo.rgba[0] + (hi.rgba[0] - lo.rgba[0]) * k,
      lo.rgba[1] + (hi.rgba[1] - lo.rgba[1]) * k,
      lo.rgba[2] + (hi.rgba[2] - lo.rgba[2]) * k,
      lo.rgba[3] + (hi.rgba[3] - lo.rgba[3]) * k,
    ]);
  }
  return lut;
}

function writeLut(lut: Uint8ClampedArray, i: number, rgba: number[]): void {
  lut[i * 4] = rgba[0];
  lut[i * 4 + 1] = rgba[1];
  lut[i * 4 + 2] = rgba[2];
  lut[i * 4 + 3] = rgba[3];
}

function makeOffscreen(w: number, h: number): {
  canvas: OffscreenCanvas | HTMLCanvasElement;
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
} | null {
  let canvas: OffscreenCanvas | HTMLCanvasElement | null = null;
  if (typeof OffscreenCanvas !== "undefined") {
    try {
      canvas = new OffscreenCanvas(w, h);
    } catch {
      canvas = null;
    }
  }
  if (!canvas && typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    canvas = c;
  }
  if (!canvas) return null;
  const ctx = canvas.getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) return null;
  return { canvas, ctx };
}

function parseRgba(css: string): [number, number, number, number] {
  const m = /rgba?\(([^)]+)\)/i.exec(css);
  if (m) {
    const parts = m[1].split(",").map((s) => Number(s.trim()));
    const r = clamp255(parts[0] ?? 0);
    const g = clamp255(parts[1] ?? 0);
    const b = clamp255(parts[2] ?? 0);
    const a = parts.length >= 4 ? clamp01(parts[3]) * 255 : 255;
    return [r, g, b, a];
  }
  const hex = /^#([0-9a-f]{6}|[0-9a-f]{8})$/i.exec(css);
  if (hex) {
    const h = hex[1];
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
      h.length === 8 ? parseInt(h.slice(6, 8), 16) : 255,
    ];
  }
  return [0, 0, 0, 255];
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
}
function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Number.isFinite(v) ? v : 0));
}

/* ============================================================
 * Legacy export kept for back-compat with the existing canvasBackend call.
 * Returns a CanvasGradient for native paths or null for procedural — the
 * backend should prefer paintGradientFill when possible.
 * ============================================================ */

export function createGradient(
  ctx: CanvasRenderingContext2D,
  node: NonTextNode,
  fill: GradientFill,
  frameOverride?: Frame,
): CanvasGradient | null {
  const frame = frameOverride ?? node.frame;
  if (frame.width <= 0 || frame.height <= 0) return null;
  if (fill.stops.length === 0) return null;
  if (fill.gradientType === "linear") return buildLinearGradient(ctx, frame, fill);
  if (fill.gradientType === "radial") return buildRadialGradient(ctx, frame, fill);
  return null; // procedural — caller should use paintGradientFill instead.
}
