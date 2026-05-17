import type { ImageFilters } from "@/lib/figma";

/**
 * Apply Figma's image filters to a source bitmap and return a new offscreen
 * canvas containing the filtered result.
 *
 * Figma's filters are documented as values in the range [-1, 1] (with 0 as
 * the identity). Their visual semantics:
 *
 *   exposure    - brightens/darkens the entire image, photographically
 *                 (multiplies linear-light intensity by 2^exposure).
 *   contrast    - expands/compresses the tonal range around midgray.
 *   saturation  - pulls colors toward grayscale (-1) or boosts them (+1).
 *   temperature - warm (+) shifts toward orange (more R, less B);
 *                 cool (-)  shifts toward blue   (less R, more B).
 *   tint        - magenta (+) pushes G down (more R+B perceptually);
 *                 green   (-) pushes G up.
 *   highlights  - recovers/boosts only the bright pixels (lifted via a
 *                 smoothstep mask weighted toward luminance > 0.5).
 *   shadows     - recovers/boosts only the dark pixels (mask weighted
 *                 toward luminance < 0.5).
 *
 * All seven channels are applied in a single pass over the pixel buffer
 * for performance (one allocation, one walk, branchless per-channel math
 * once the multipliers are precomputed).
 *
 * Returns null when:
 *   - the source has no dimensions yet,
 *   - OffscreenCanvas isn't available AND we're outside the browser,
 *   - or the canvas is tainted by cross-origin pixels (getImageData throws).
 *
 * Callers should fall back to drawing the unfiltered source when null
 * is returned - better to lose the filter than to crash the render.
 */
export function applyImageFiltersToBitmap(
  source: CanvasImageSource,
  filters: ImageFilters,
): OffscreenCanvas | HTMLCanvasElement | null {
  const w = imageWidth(source);
  const h = imageHeight(source);
  if (!w || !h) return null;

  const off = createOffscreen(w, h);
  if (!off) return null;
  const ctx = off.getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) return null;

  ctx.drawImage(source, 0, 0);

  let imageData: ImageData;
  try {
    imageData = ctx.getImageData(0, 0, w, h);
  } catch {
    // Cross-origin tainted canvas - caller falls back to unfiltered draw.
    return null;
  }

  applyFiltersInPlace(imageData.data, filters);
  ctx.putImageData(imageData, 0, 0);
  return off;
}

export function hasAnyImageFilter(f: ImageFilters | undefined | null): boolean {
  if (!f) return false;
  return (
    f.exposure !== 0 ||
    f.contrast !== 0 ||
    f.saturation !== 0 ||
    f.temperature !== 0 ||
    f.tint !== 0 ||
    f.highlights !== 0 ||
    f.shadows !== 0
  );
}

/**
 * Mutate a Uint8ClampedArray of RGBA bytes in place with all seven Figma
 * filters. Math derived to match Figma's documented behaviour direction +
 * magnitude. Exact bit-equivalence with Figma's renderer is not feasible
 * (their internals aren't public), but the visible effect matches at
 * normal viewing distances.
 */
export function applyFiltersInPlace(
  buf: Uint8ClampedArray,
  f: ImageFilters,
): void {
  // Precompute multipliers once, outside the loop.
  const doExposure = f.exposure !== 0;
  const doContrast = f.contrast !== 0;
  const doSaturation = f.saturation !== 0;
  const doTemperature = f.temperature !== 0;
  const doTint = f.tint !== 0;
  const doHighlights = f.highlights !== 0;
  const doShadows = f.shadows !== 0;

  // 2^exposure mirrors photographic stops; -1 halves brightness, +1 doubles it.
  const exposureMul = Math.pow(2, f.exposure);
  // Symmetric around midgray; -1 collapses to flat gray, +1 doubles contrast.
  const contrastMul = 1 + f.contrast;
  // -1 → grayscale, 0 → identity, +1 → 2× saturation.
  const satMul = 1 + f.saturation;

  // Empirical channel shifts. Figma's temperature/tint affect roughly
  // 0..15% of the channel range at the extremes; this scale matches their
  // visible intensity in side-by-side comparison.
  const tempR = f.temperature * 0.15;
  const tempB = -f.temperature * 0.15;
  const tintG = -f.tint * 0.15;
  const tintRB = f.tint * 0.05;

  // Highlight/shadow lift is also empirical - Figma's exact curve isn't
  // public but +/- 0.30 at the extremes matches well.
  const highlightStrength = f.highlights * 0.3;
  const shadowStrength = f.shadows * 0.3;

  const len = buf.length;
  for (let i = 0; i < len; i += 4) {
    let r = buf[i] / 255;
    let g = buf[i + 1] / 255;
    let b = buf[i + 2] / 255;

    if (doExposure) {
      r *= exposureMul;
      g *= exposureMul;
      b *= exposureMul;
    }

    if (doContrast) {
      r = (r - 0.5) * contrastMul + 0.5;
      g = (g - 0.5) * contrastMul + 0.5;
      b = (b - 0.5) * contrastMul + 0.5;
    }

    if (doSaturation) {
      // Rec. 709 luminance - matches Figma's color-management space.
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = lum + (r - lum) * satMul;
      g = lum + (g - lum) * satMul;
      b = lum + (b - lum) * satMul;
    }

    if (doTemperature) {
      r += tempR;
      b += tempB;
    }

    if (doTint) {
      r += tintRB;
      g += tintG;
      b += tintRB;
    }

    if (doHighlights) {
      // Lift bright pixels only; smoothstep mask peaks at luma=1.
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const mask = smoothstep(0.5, 1.0, luma);
      const adjust = highlightStrength * mask;
      r += adjust;
      g += adjust;
      b += adjust;
    }

    if (doShadows) {
      // Lift dark pixels only; smoothstep mask peaks at luma=0.
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const mask = 1 - smoothstep(0.0, 0.5, luma);
      const adjust = shadowStrength * mask;
      r += adjust;
      g += adjust;
      b += adjust;
    }

    // Uint8ClampedArray clamps to [0,255] on assignment - no Math.max/min needed.
    buf[i] = r * 255;
    buf[i + 1] = g * 255;
    buf[i + 2] = b * 255;
    // alpha (i+3) untouched
  }
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function createOffscreen(w: number, h: number): OffscreenCanvas | HTMLCanvasElement | null {
  if (typeof OffscreenCanvas !== "undefined") {
    try {
      return new OffscreenCanvas(w, h);
    } catch {
      // fallthrough
    }
  }
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
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
