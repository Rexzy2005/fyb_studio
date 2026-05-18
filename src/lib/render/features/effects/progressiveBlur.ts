/**
 * Progressive blur: paints `path`-clipped content with blur strength that
 * ramps along the node's vertical axis from `startRadius` at `startOffset`
 * to `endRadius` at `endOffset` (offsets in 0..1 of the node height).
 *
 * Approach: stack 4 horizontal bands (light/medium/heavy/full blur), each
 * masked to a gradient slice. This visually approximates the smooth ramp
 * without per-pixel filtering, which Canvas2D doesn't support cheaply.
 *
 * Called from canvasBackend's layer-blur lane when the effect carries
 * a `progressive` descriptor. Falls back to the uniform `radius` blur the
 * caller would have applied otherwise when prerequisites aren't met.
 */
export function applyProgressiveLayerBlur(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  bbox: { x: number; y: number; width: number; height: number },
  spec: {
    startRadius: number;
    endRadius: number;
    startOffset: number; // 0..1, fraction of node height where blur starts ramping
    endOffset: number;   // 0..1, where blur reaches `endRadius`
  },
): "applied" | "skip" {
  if (typeof OffscreenCanvas === "undefined") return "skip";
  if (spec.endRadius <= 0 && spec.startRadius <= 0) return "skip";

  const xform = ctx.getTransform();
  const sx = Math.max(1, Math.floor(bbox.width * Math.abs(xform.a)));
  const sy = Math.max(1, Math.floor(bbox.height * Math.abs(xform.d)));

  // Capture what we've already drawn for this node's region. Note: this
  // must run *after* the node's fills are already on canvas. Caller is
  // responsible for ordering.
  const snap = new OffscreenCanvas(sx, sy);
  const sctx = snap.getContext("2d");
  if (!sctx) return "skip";
  sctx.drawImage(
    ctx.canvas,
    bbox.x * xform.a + xform.e,
    bbox.y * xform.d + xform.f,
    sx, sy,
    0, 0, sx, sy,
  );

  // Erase the original region - we'll paint the blurred composite over.
  ctx.save();
  ctx.clip(path);
  ctx.clearRect(bbox.x, bbox.y, bbox.width, bbox.height);

  // Four bands across the blur ramp.
  const BANDS = 4;
  const start = Math.max(0, Math.min(1, spec.startOffset));
  const end = Math.max(start + 0.01, Math.min(1, spec.endOffset));

  for (let i = 0; i < BANDS; i++) {
    const t0 = i / BANDS;
    const t1 = (i + 1) / BANDS;
    // Interpolate the blur radius across the ramp.
    const radiusAt = (t: number) => {
      if (t <= start) return spec.startRadius;
      if (t >= end) return spec.endRadius;
      const u = (t - start) / (end - start);
      return spec.startRadius + (spec.endRadius - spec.startRadius) * u;
    };
    const blurR = (radiusAt(t0) + radiusAt(t1)) / 2;
    ctx.save();
    if (blurR > 0) ctx.filter = `blur(${blurR}px)`;
    // Clip to a horizontal slice of the bbox so each blur band only
    // paints its own region.
    ctx.beginPath();
    ctx.rect(
      bbox.x,
      bbox.y + bbox.height * t0,
      bbox.width,
      bbox.height * (t1 - t0) + 1, // +1 to overlap adjacent bands and avoid seams
    );
    ctx.clip();
    ctx.drawImage(snap, bbox.x, bbox.y, bbox.width, bbox.height);
    ctx.restore();
  }

  ctx.restore();
  return "applied";
}
