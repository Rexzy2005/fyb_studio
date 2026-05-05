import type { NormalizedNode } from "@/lib/figma";

type NonTextNode = Exclude<NormalizedNode, { kind: "text" }>;
type GradientFill = Extract<NonTextNode["fills"][number], { kind: "gradient" }>;

type Frame = { x: number; y: number; width: number; height: number };

/**
 * Build a paint suitable for `ctx.fillStyle` from a gradient paint.
 *
 * Linear and radial use the native CanvasGradient API. Angular (conic) uses
 * the native `createConicGradient` API where supported (Chrome 88+, Safari 16.4+,
 * Firefox 109+) and falls back to a procedural offscreen-canvas raster for
 * older engines. Diamond is always procedural (no native equivalent).
 *
 * Missing `handlePositions` are replaced with Figma's documented defaults so
 * exports authored in older plugins (which omit handles when they're at the
 * default positions) still render correctly.
 */
export function createGradient(
  ctx: CanvasRenderingContext2D,
  node: NonTextNode,
  fill: GradientFill,
  frameOverride?: Frame,
): CanvasGradient | CanvasPattern | string | null {
  const frame = frameOverride ?? node.frame;
  if (frame.width <= 0 || frame.height <= 0) return null;
  if (fill.stops.length === 0) return fill.cssFallback;

  if (fill.gradientType === "linear") return linearGradient(ctx, frame, fill);
  if (fill.gradientType === "radial") return radialGradient(ctx, frame, fill);
  if (fill.gradientType === "angular") return angularGradient(ctx, frame, fill);
  if (fill.gradientType === "diamond") return diamondGradient(ctx, frame, fill);
  return fill.cssFallback;
}

function linearGradient(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  fill: GradientFill,
): CanvasGradient {
  const h0 = fill.handlePositions?.[0] ?? { x: 0, y: 0.5 };
  const h1 = fill.handlePositions?.[1] ?? { x: 1, y: 0.5 };
  const x0 = frame.x + h0.x * frame.width;
  const y0 = frame.y + h0.y * frame.height;
  const x1 = frame.x + h1.x * frame.width;
  const y1 = frame.y + h1.y * frame.height;
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const s of fill.stops) g.addColorStop(s.offset, s.colorCss);
  return g;
}

function radialGradient(
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

function angularGradient(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  fill: GradientFill,
): CanvasGradient | CanvasPattern | string {
  // Default: centered, sweeping clockwise from 12 o'clock (Figma convention).
  const h0 = fill.handlePositions?.[0] ?? { x: 0.5, y: 0.5 };
  const h1 = fill.handlePositions?.[1] ?? { x: 0.5, y: 0 };
  const cx = frame.x + h0.x * frame.width;
  const cy = frame.y + h0.y * frame.height;
  const dx = (h1.x - h0.x) * frame.width;
  const dy = (h1.y - h0.y) * frame.height;
  // Convert from "vector pointing to the start of the sweep" to a CSS-style
  // start angle measured from the positive X axis (3 o'clock), increasing CW.
  const startAngle = Math.atan2(dy, dx);

  const factory = (
    ctx as unknown as { createConicGradient?: (a: number, x: number, y: number) => CanvasGradient }
  ).createConicGradient;
  if (typeof factory === "function") {
    const g = factory.call(ctx, startAngle, cx, cy);
    for (const s of fill.stops) g.addColorStop(s.offset, s.colorCss);
    return g;
  }

  // Fallback: rasterize an angular sweep into an offscreen canvas, then turn
  // it into a repeating pattern at frame coordinates.
  return rasterAngularPattern(ctx, frame, fill, startAngle) ?? fill.cssFallback;
}

function diamondGradient(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  fill: GradientFill,
): CanvasPattern | string {
  // Figma diamond gradient: each pixel's `t` is its L∞ distance from the
  // center, normalized to the half-diagonal. Renders a rotated-square contour.
  return rasterDiamondPattern(ctx, frame, fill) ?? fill.cssFallback;
}

/* ============================================================
 * Offscreen rasterization for angular + diamond gradients
 * ============================================================ */

const MAX_RASTER_DIM = 1024; // cap raster size for performance

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

/**
 * Build a precomputed lookup table mapping `t` ∈ [0,1] to RGBA bytes.
 * Stops are interpolated linearly between adjacent positions; t<min uses
 * the first stop, t>max uses the last (matches Figma's clamp behaviour).
 */
function buildStopLut(
  stops: GradientFill["stops"],
  size = 256,
): Uint8ClampedArray {
  const lut = new Uint8ClampedArray(size * 4);
  // Pre-parse stop colors once.
  const parsed = stops.map((s) => ({ offset: s.offset, rgba: parseRgba(s.colorCss) }));
  parsed.sort((a, b) => a.offset - b.offset);

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

function writeLut(lut: Uint8ClampedArray, i: number, rgba: number[] | Uint8ClampedArray): void {
  lut[i * 4] = rgba[0];
  lut[i * 4 + 1] = rgba[1];
  lut[i * 4 + 2] = rgba[2];
  lut[i * 4 + 3] = rgba[3];
}

function parseRgba(css: string): [number, number, number, number] {
  // Matches our own rgbaCss output: "rgba(r, g, b, a)" or "rgb(r, g, b)".
  const m = /rgba?\(([^)]+)\)/i.exec(css);
  if (m) {
    const parts = m[1].split(",").map((s) => Number(s.trim()));
    const r = clamp255(parts[0] ?? 0);
    const g = clamp255(parts[1] ?? 0);
    const b = clamp255(parts[2] ?? 0);
    const a = parts.length >= 4 ? clamp01(parts[3]) * 255 : 255;
    return [r, g, b, a];
  }
  // Hex fallback `#rrggbb[aa]`.
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

function rasterAngularPattern(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  fill: GradientFill,
  startAngle: number,
): CanvasPattern | null {
  const w = Math.min(MAX_RASTER_DIM, Math.max(8, Math.round(frame.width)));
  const h = Math.min(MAX_RASTER_DIM, Math.max(8, Math.round(frame.height)));
  const off = makeOffscreen(w, h);
  if (!off) return null;
  const lut = buildStopLut(fill.stops);
  const img = off.ctx.createImageData(w, h);
  const buf = img.data;
  const cx = w / 2;
  const cy = h / 2;
  const TWO_PI = Math.PI * 2;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = x - cx;
      const dy = y - cy;
      let theta = Math.atan2(dy, dx) - startAngle;
      // Normalize to [0, 2π).
      theta = ((theta % TWO_PI) + TWO_PI) % TWO_PI;
      const t = theta / TWO_PI;
      const lutIdx = Math.min(lut.length / 4 - 1, Math.floor(t * (lut.length / 4 - 1)));
      const i = (y * w + x) * 4;
      const li = lutIdx * 4;
      buf[i] = lut[li];
      buf[i + 1] = lut[li + 1];
      buf[i + 2] = lut[li + 2];
      buf[i + 3] = lut[li + 3];
    }
  }
  off.ctx.putImageData(img, 0, 0);
  return patternFromOffscreen(ctx, off.canvas, frame, w, h);
}

function rasterDiamondPattern(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  fill: GradientFill,
): CanvasPattern | null {
  const w = Math.min(MAX_RASTER_DIM, Math.max(8, Math.round(frame.width)));
  const h = Math.min(MAX_RASTER_DIM, Math.max(8, Math.round(frame.height)));
  const off = makeOffscreen(w, h);
  if (!off) return null;
  const lut = buildStopLut(fill.stops);
  const img = off.ctx.createImageData(w, h);
  const buf = img.data;
  const cx = w / 2;
  const cy = h / 2;

  // Honor handles when present: handle[0]=center, handle[1]=edge in one axis,
  // handle[2]=edge in the other axis. Default to centered, fitting the frame.
  const h1 = fill.handlePositions?.[1];
  const h2 = fill.handlePositions?.[2];
  const halfW = h1 ? Math.abs(h1.x - 0.5) * w * 2 : w;
  const halfH = h2 ? Math.abs(h2.y - 0.5) * h * 2 : h;
  const halfX = halfW > 0 ? halfW / 2 : w / 2;
  const halfY = halfH > 0 ? halfH / 2 : h / 2;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = Math.abs(x - cx) / halfX;
      const dy = Math.abs(y - cy) / halfY;
      // L∞ distance produces square contours; rotated 45° gives the diamond.
      // Figma's diamond uses L1 distance which IS the diamond shape.
      const t = Math.min(1, dx + dy);
      const lutIdx = Math.min(lut.length / 4 - 1, Math.floor(t * (lut.length / 4 - 1)));
      const i = (y * w + x) * 4;
      const li = lutIdx * 4;
      buf[i] = lut[li];
      buf[i + 1] = lut[li + 1];
      buf[i + 2] = lut[li + 2];
      buf[i + 3] = lut[li + 3];
    }
  }
  off.ctx.putImageData(img, 0, 0);
  return patternFromOffscreen(ctx, off.canvas, frame, w, h);
}

function patternFromOffscreen(
  ctx: CanvasRenderingContext2D,
  source: OffscreenCanvas | HTMLCanvasElement,
  frame: Frame,
  rasterW: number,
  rasterH: number,
): CanvasPattern | null {
  // We rendered into a `rasterW × rasterH` canvas representing the frame at
  // a possibly reduced resolution. To stretch this to fit the frame exactly,
  // build a CanvasPattern with a transform that:
  //   (1) scales from raster pixels to frame design units, then
  //   (2) translates by frame.x / frame.y so the pattern aligns with the shape.
  let pattern: CanvasPattern | null;
  try {
    pattern = ctx.createPattern(source as CanvasImageSource, "no-repeat");
  } catch {
    return null;
  }
  if (!pattern) return null;
  const m = new DOMMatrix();
  m.a = frame.width / rasterW;
  m.d = frame.height / rasterH;
  m.e = frame.x;
  m.f = frame.y;
  // setTransform exists on CanvasPattern in evergreen browsers; fall back to
  // null translation if unsupported (gradient will still appear, just at the
  // wrong position).
  try {
    (pattern as { setTransform?: (m: DOMMatrix) => void }).setTransform?.(m);
  } catch {
    // ignore
  }
  return pattern;
}
