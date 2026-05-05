/**
 * Composite an offscreen "content" canvas with a mask via destination-in
 * (ALPHA mask) or via a luminance pass (LUMINANCE mask).
 *
 * Returns a new OffscreenCanvas containing the masked result, sized to match
 * `content`. The caller draws the result back onto the main canvas at the
 * appropriate location.
 *
 * If OffscreenCanvas is not available (older Safari), returns null and the
 * caller should fall back to direct path-clip rendering.
 */
export function applyMask(
  content: OffscreenCanvas | HTMLCanvasElement,
  mask: OffscreenCanvas | HTMLCanvasElement,
  mode: "ALPHA" | "LUMINANCE",
): OffscreenCanvas | null {
  if (typeof OffscreenCanvas === "undefined") return null;

  const w = content.width;
  const h = content.height;
  const out = new OffscreenCanvas(w, h);
  const ctx = out.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(content, 0, 0);

  if (mode === "ALPHA") {
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(mask, 0, 0);
    return out;
  }

  // LUMINANCE: convert mask to grayscale, then use its brightness as alpha.
  const maskCanvas = new OffscreenCanvas(w, h);
  const mctx = maskCanvas.getContext("2d");
  if (!mctx) return null;
  mctx.drawImage(mask, 0, 0);
  const md = mctx.getImageData(0, 0, w, h);
  const buf = md.data;
  for (let i = 0; i < buf.length; i += 4) {
    const lum = 0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2];
    buf[i] = 255;
    buf[i + 1] = 255;
    buf[i + 2] = 255;
    buf[i + 3] = lum;
  }
  mctx.putImageData(md, 0, 0);

  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(maskCanvas, 0, 0);
  return out;
}
