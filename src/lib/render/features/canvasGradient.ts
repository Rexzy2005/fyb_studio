import type { NormalizedNode } from "@/lib/figma";

type NonTextNode = Exclude<NormalizedNode, { kind: "text" }>;
type GradientFill = Extract<NonTextNode["fills"][number], { kind: "gradient" }>;

type Frame = { x: number; y: number; width: number; height: number };

/**
 * Paint a gradient fill into a path on the supplied canvas context.
 *
 * Routing per gradient kind:
 *   - linear    → native createLinearGradient (handles arbitrary direction).
 *   - radial    → native createRadialGradient when the gradient is a true
 *                 circle aligned with bbox axes; otherwise procedural raster
 *                 with elliptical, rotated axes (the common Figma case).
 *   - angular   → native createConicGradient when supported, else procedural.
 *   - diamond   → procedural raster (no native equivalent), respecting the
 *                 handle vectors so a rotated diamond renders rotated.
 *
 * Procedural rasters use:
 *   - 1024-entry color LUT with linear interpolation between adjacent entries.
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
    // Native createRadialGradient is always circular. Use it only when the
    // ellipse degenerates into a circle (radii equal AND axes orthogonal).
    // Otherwise paint procedurally so an oval / rotated radial renders right.
    if (tryNativeRadial(ctx, path, frame, fill)) return true;
    return blitProceduralGradient(ctx, path, frame, fill, "radial");
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

/**
 * Try to paint a Figma radial gradient using native createRadialGradient.
 *
 * Native canvas radials are always perfectly circular. Figma radials are
 * elliptical: handle[1] defines the X-axis endpoint, handle[2] the Y-axis
 * endpoint, and the two axes can have different lengths and arbitrary rotation.
 * We only take the native path when the ellipse degenerates to a circle -
 * i.e. the two semi-axis vectors are perpendicular AND equal length. Anything
 * else is routed through the procedural raster, which paints the true ellipse.
 */
function tryNativeRadial(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  frame: Frame,
  fill: GradientFill,
): boolean {
  const h0 = fill.handlePositions?.[0] ?? { x: 0.5, y: 0.5 };
  const h1 = fill.handlePositions?.[1] ?? { x: 1.0, y: 0.5 };
  const h2 = fill.handlePositions?.[2] ?? { x: 0.5, y: 1.0 };

  const cx = frame.x + h0.x * frame.width;
  const cy = frame.y + h0.y * frame.height;
  const v1x = (h1.x - h0.x) * frame.width;
  const v1y = (h1.y - h0.y) * frame.height;
  const v2x = (h2.x - h0.x) * frame.width;
  const v2y = (h2.y - h0.y) * frame.height;
  const r1 = Math.hypot(v1x, v1y);
  const r2 = Math.hypot(v2x, v2y);
  if (r1 < 1 || r2 < 1) return false;

  // Orthogonality check (cross product near zero relative to magnitudes) and
  // equal-radius check (within 0.5% - sub-pixel difference for any sane size).
  const cross = Math.abs(v1x * v2y - v1y * v2x);
  const dotMagnitude = r1 * r2;
  const orthogonal = dotMagnitude > 0 && cross / dotMagnitude > 0.999;
  const equalRadii = Math.abs(r1 - r2) / Math.max(r1, r2) < 0.005;
  if (!orthogonal || !equalRadii) return false;

  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r1);
  for (const s of fill.stops) g.addColorStop(s.offset, s.colorCss);
  ctx.fillStyle = g;
  ctx.fill(path);
  return true;
}

/* ============================================================
 * Native angular (conic) gradient - fast path
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
 * pixel scaling, so source pixels and destination pixels are 1:1 - no
 * CanvasPattern transform interactions, no bilinear softness.
 * ============================================================ */

const MAX_RASTER_DIM = 2048;

function blitProceduralGradient(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  frame: Frame,
  fill: GradientFill,
  kind: "angular" | "diamond" | "radial",
): boolean {
  const t = ctx.getTransform();
  // Use the linear scale from each axis; for rotated nodes this is the
  // dominant axis scale (good enough - gradients are rotation-invariant
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
    // Center the angular sweep at the actual handle position (not just the
    // bbox center) - rotates correctly whether or not h0 is at (0.5, 0.5).
    const cxOff = h0.x * targetW;
    const cyOff = h0.y * targetH;
    const dx = (h1.x - h0.x) * frame.width;
    const dy = (h1.y - h0.y) * frame.height;
    const startAngle = Math.atan2(dy, dx);
    rasterAngularInto(off.ctx, targetW, targetH, lut, cxOff, cyOff, startAngle);
  } else {
    // Radial + diamond share the same axis-aware setup. The two semi-axis
    // vectors come straight from Figma's handlePositions in offscreen-pixel
    // coords, so a rotated/elliptical/skewed gradient stays faithful to the
    // source. The L2-vs-L1 distinction is what makes one a circle and the
    // other a square rotated 45°.
    const axes = computeAxisVectors(fill, targetW, targetH);
    if (!axes) return false;
    if (kind === "radial") {
      rasterRadialInto(off.ctx, targetW, targetH, lut, axes);
    } else {
      rasterDiamondInto(off.ctx, targetW, targetH, lut, axes);
    }
  }

  // Direct blit through path clip - pixel-exact, no pattern transform.
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

/**
 * Build the inverse of the basis matrix [vx | vy] in offscreen-pixel coords,
 * where vx = handle1 - handle0 and vy = handle2 - handle0.
 *
 * For each pixel P the rasterizer computes (u, v) = invBasis * (P - center).
 * (u, v) is the gradient-space coordinate where u=1 lands on handle1 and v=1
 * lands on handle2. From there:
 *   - radial:  t = sqrt(u² + v²)   (1 on the ellipse boundary)
 *   - diamond: t = |u| + |v|       (1 on the diamond boundary)
 *
 * Returns null when the two axes are colinear (degenerate basis - the source
 * gradient has zero area, so we can't paint anything meaningful).
 */
function computeAxisVectors(
  fill: GradientFill,
  targetW: number,
  targetH: number,
): {
  cx: number;
  cy: number;
  invA: number;
  invB: number;
  invC: number;
  invD: number;
} | null {
  const h0 = fill.handlePositions?.[0] ?? { x: 0.5, y: 0.5 };
  const h1 = fill.handlePositions?.[1] ?? { x: 1.0, y: 0.5 };
  const h2 = fill.handlePositions?.[2] ?? { x: 0.5, y: 1.0 };

  const cx = h0.x * targetW;
  const cy = h0.y * targetH;
  const ax = (h1.x - h0.x) * targetW;
  const ay = (h1.y - h0.y) * targetH;
  const bx = (h2.x - h0.x) * targetW;
  const by = (h2.y - h0.y) * targetH;

  // 2×2 inverse of [[ax, bx], [ay, by]] (column-major: vx and vy as columns).
  const det = ax * by - bx * ay;
  if (Math.abs(det) < 1e-6) return null;
  const invDet = 1 / det;
  return {
    cx,
    cy,
    invA: by * invDet,   // u from dx
    invB: -bx * invDet,  // u from dy
    invC: -ay * invDet,  // v from dx
    invD: ax * invDet,   // v from dy
  };
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
// that looks like sharp stops - that's the bug we had before.
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
  cx: number,
  cy: number,
  startAngle: number,
): void {
  const img = ctx.createImageData(w, h);
  const buf = img.data;
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

type GradientAxes = {
  cx: number;
  cy: number;
  invA: number;
  invB: number;
  invC: number;
  invD: number;
};

function rasterRadialInto(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  w: number,
  h: number,
  lut: Uint8ClampedArray,
  axes: GradientAxes,
): void {
  const img = ctx.createImageData(w, h);
  const buf = img.data;
  const last = lut.length / 4 - 1;
  const { cx, cy, invA, invB, invC, invD } = axes;

  for (let y = 0; y < h; y++) {
    const dy = y - cy;
    const rowOffset = y * w * 4;
    for (let x = 0; x < w; x++) {
      const dx = x - cx;
      // (u, v) is the gradient-space coordinate. u=v=0 at center; u²+v²=1 on
      // the ellipse boundary. L2 (Euclidean) distance gives a true ellipse
      // even when the two semi-axis vectors have different lengths or
      // arbitrary orientation.
      const u = invA * dx + invB * dy;
      const v = invC * dx + invD * dy;
      const t = Math.sqrt(u * u + v * v);
      sampleLutDithered(lut, last, t > 1 ? 1 : t, buf, rowOffset + x * 4, x, y);
    }
  }
  ctx.putImageData(img, 0, 0);
}

function rasterDiamondInto(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  w: number,
  h: number,
  lut: Uint8ClampedArray,
  axes: GradientAxes,
): void {
  const img = ctx.createImageData(w, h);
  const buf = img.data;
  const last = lut.length / 4 - 1;
  const { cx, cy, invA, invB, invC, invD } = axes;

  for (let y = 0; y < h; y++) {
    const dy = y - cy;
    const rowOffset = y * w * 4;
    for (let x = 0; x < w; x++) {
      const dx = x - cx;
      const u = invA * dx + invB * dy;
      const v = invC * dx + invD * dy;
      // L1 (Manhattan) distance in gradient-space → diamond iso-contours that
      // rotate with the handle axes. With axis-aligned handles this matches
      // the previous |x|+|y| formulation; with rotated handles it actually
      // rotates instead of staying stuck axis-aligned.
      const t = Math.abs(u) + Math.abs(v);
      sampleLutDithered(lut, last, t > 1 ? 1 : t, buf, rowOffset + x * 4, x, y);
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

