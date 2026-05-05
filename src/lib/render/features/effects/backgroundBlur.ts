/**
 * Background blur: capture the current canvas region under `path`, blur it,
 * paint it back inside the path. Caller must have already clipped to the path
 * if they want the blurred region constrained.
 */
export function applyBackgroundBlur(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  bbox: { x: number; y: number; width: number; height: number },
  radius: number,
): void {
  if (radius <= 0) return;

  const ratio = ctx.getTransform();
  const sx = Math.max(1, Math.floor(bbox.width * Math.abs(ratio.a)));
  const sy = Math.max(1, Math.floor(bbox.height * Math.abs(ratio.d)));
  if (typeof OffscreenCanvas === "undefined") {
    // Skip background blur if OffscreenCanvas isn't available.
    return;
  }
  const offscreen = new OffscreenCanvas(sx, sy);
  const off = offscreen.getContext("2d");
  if (!off) return;
  off.drawImage(
    ctx.canvas,
    bbox.x * ratio.a + ratio.e,
    bbox.y * ratio.d + ratio.f,
    sx,
    sy,
    0,
    0,
    sx,
    sy,
  );
  ctx.save();
  ctx.clip(path);
  const prev = ctx.filter;
  ctx.filter = `blur(${radius}px)`;
  ctx.drawImage(offscreen, bbox.x, bbox.y, bbox.width, bbox.height);
  ctx.filter = prev;
  ctx.restore();
}
