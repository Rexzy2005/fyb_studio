/**
 * Stroke a path with INSIDE / OUTSIDE / CENTER alignment semantics matching Figma.
 *
 * Implementation:
 *   INSIDE  → stroke at 2× weight, then clip to the fill path so only the inner
 *             half of the stroke remains.
 *   OUTSIDE → stroke at 2× weight, then clip to the inverse of the fill path
 *             (a giant rect minus the path, evenodd) so only the outer half remains.
 *   CENTER  → stroke at the literal weight (default canvas behaviour).
 *
 * The caller is responsible for setting strokeStyle, lineWidth, lineCap, lineJoin,
 * miterLimit and any dash pattern BEFORE calling this — we adjust lineWidth here
 * for INSIDE/OUTSIDE.
 */
export function applyAlignedStroke(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  align: "INSIDE" | "OUTSIDE" | "CENTER",
  weight: number,
  bbox: { x: number; y: number; width: number; height: number },
): void {
  if (align === "CENTER") {
    ctx.stroke(path);
    return;
  }

  ctx.save();
  if (align === "INSIDE") {
    ctx.clip(path);
    ctx.lineWidth = weight * 2;
    ctx.stroke(path);
  } else {
    // OUTSIDE — clip to the inverse via evenodd.
    const inverse = new Path2D();
    const margin = Math.max(weight * 4, 1);
    inverse.rect(
      bbox.x - margin,
      bbox.y - margin,
      bbox.width + margin * 2,
      bbox.height + margin * 2,
    );
    inverse.addPath(path);
    ctx.clip(inverse, "evenodd");
    ctx.lineWidth = weight * 2;
    ctx.stroke(path);
  }
  ctx.restore();
}
