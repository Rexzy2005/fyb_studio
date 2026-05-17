import { asNumber, isRecord, type AnyRecord } from "./shared/coerce";

export type Bounds = { x: number; y: number; width: number; height: number };
export type CornerRadius = { tl: number; tr: number; bl: number; br: number };

export function getChildNodes(node: unknown): unknown[] {
  if (!isRecord(node)) return [];
  const children = node.children;
  return Array.isArray(children) ? children : [];
}

export function getBounds(node: AnyRecord): Bounds | null {
  function boundsFromAbsoluteTransform(): Bounds | null {
    const t = Array.isArray(node.absoluteTransform) ? (node.absoluteTransform as unknown[]) : null;
    if (!t || t.length < 2) return null;

    const r0 = Array.isArray(t[0]) ? (t[0] as unknown[]) : null;
    const r1 = Array.isArray(t[1]) ? (t[1] as unknown[]) : null;
    if (!r0 || !r1 || r0.length < 3 || r1.length < 3) return null;

    const a = asNumber(r0[0], NaN);
    const c = asNumber(r0[1], NaN);
    const tx = asNumber(r0[2], NaN);
    const b = asNumber(r1[0], NaN);
    const d = asNumber(r1[1], NaN);
    const ty = asNumber(r1[2], NaN);
    if (![a, b, c, d, tx, ty].every((v) => Number.isFinite(v))) return null;

    const w = asNumber(node.width, NaN);
    const h = asNumber(node.height, NaN);
    if (!Number.isFinite(w) || !Number.isFinite(h)) return null;

    const corners = [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: 0, y: h },
      { x: w, y: h },
    ].map((p) => ({
      x: a * p.x + c * p.y + tx,
      y: b * p.x + d * p.y + ty,
    }));

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const p of corners) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }

    return {
      x: minX,
      y: minY,
      width: Math.max(0, maxX - minX),
      height: Math.max(0, maxY - minY),
    };
  }

  const bb = isRecord(node.absoluteBoundingBox) ? (node.absoluteBoundingBox as AnyRecord) : null;
  if (bb) {
    const bounds = {
      x: asNumber(bb.x, 0),
      y: asNumber(bb.y, 0),
      width: asNumber(bb.width, asNumber(node.width, 0)),
      height: asNumber(bb.height, asNumber(node.height, 0)),
    };

    // Some exports produce nearly-zero width/height for rotated LINE nodes (and similar).
    // If bounds are degenerate, prefer computing from absoluteTransform + (width,height).
    const minDim = Math.min(bounds.width, bounds.height);
    const maxDim = Math.max(bounds.width, bounds.height);
    const degenerate = minDim < 0.5 && maxDim > 10;
    if (degenerate) {
      return boundsFromAbsoluteTransform() ?? bounds;
    }

    return bounds;
  }

  // Fallbacks for exports that omit absoluteBoundingBox.
  const width = asNumber(node.width, NaN);
  const height = asNumber(node.height, NaN);
  if (Number.isFinite(width) && Number.isFinite(height)) {
    return boundsFromAbsoluteTransform() ?? { x: 0, y: 0, width, height };
  }

  return null;
}

export function getCornerRadius(node: AnyRecord): CornerRadius | undefined {
  const tl = asNumber(node.topLeftRadius, NaN);
  const tr = asNumber(node.topRightRadius, NaN);
  const bl = asNumber(node.bottomLeftRadius, NaN);
  const br = asNumber(node.bottomRightRadius, NaN);

  if ([tl, tr, bl, br].every((v) => Number.isFinite(v))) {
    return { tl, tr, bl, br };
  }

  const cornerRadius = asNumber(node.cornerRadius, NaN);
  if (Number.isFinite(cornerRadius)) {
    return { tl: cornerRadius, tr: cornerRadius, bl: cornerRadius, br: cornerRadius };
  }

  return undefined;
}

export function collectBounds(
  node: unknown,
  acc: { minX: number; minY: number; maxX: number; maxY: number },
): void {
  if (!isRecord(node)) return;
  // Invisible nodes don't render, so they don't grow the canvas.
  if (node.visible === false) return;

  let contributed = false;
  const bb = isRecord(node.absoluteBoundingBox) ? (node.absoluteBoundingBox as AnyRecord) : null;
  if (bb) {
    const x = asNumber(bb.x, NaN);
    const y = asNumber(bb.y, NaN);
    const w = asNumber(bb.width, NaN);
    const h = asNumber(bb.height, NaN);
    if ([x, y, w, h].every((v) => Number.isFinite(v))) {
      acc.minX = Math.min(acc.minX, x);
      acc.minY = Math.min(acc.minY, y);
      acc.maxX = Math.max(acc.maxX, x + w);
      acc.maxY = Math.max(acc.maxY, y + h);
      contributed = true;
    }
  }

  // If this node clips its content, anything sticking out of its AABB is
  // cropped at render time - so descendants must not be allowed to grow the
  // canvas beyond what we already contributed for this node. (We only honor
  // the clip when we actually captured this node's own bounds; otherwise the
  // entire subtree would silently disappear from the canvas calculation.)
  if (contributed && node.clipsContent === true) return;

  for (const child of getChildNodes(node)) collectBounds(child, acc);
}
