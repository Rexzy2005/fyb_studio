/**
 * Apply a layer blur by re-drawing the supplied source canvas through the
 * canvas filter API. Caller is responsible for clipping/transforming.
 */
export function applyLayerBlur(
  destCtx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  radius: number,
  destX: number,
  destY: number,
): void {
  if (radius <= 0) {
    destCtx.drawImage(source, destX, destY);
    return;
  }
  const prevFilter = destCtx.filter;
  destCtx.filter = `blur(${radius}px)`;
  destCtx.drawImage(source, destX, destY);
  destCtx.filter = prevFilter;
}
