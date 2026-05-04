import type { NormalizedNode } from "@/lib/figma";

export type CornerRadius = { tl: number; tr: number; bl: number; br: number };

export function clampRadius(r: number, w: number, h: number): number {
  return Math.max(0, Math.min(r, Math.min(w, h) / 2));
}

/**
 * Build a Path2D for a node's frame, honoring per-corner radii.
 * Coordinates are in the same space as `node.frame`.
 */
export function boundsPath(node: Exclude<NormalizedNode, { kind: "text" }>): Path2D {
  const { x, y, width, height } = node.frame;
  return boundsPathAt(x, y, width, height, node.cornerRadius);
}

/**
 * Same as boundsPath but with explicit position/size — used when drawing into
 * a translated/transformed local space (size from node.size, origin at 0,0).
 */
export function boundsPathAt(
  x: number,
  y: number,
  width: number,
  height: number,
  cornerRadius: CornerRadius | undefined,
): Path2D {
  const p = new Path2D();
  const r = cornerRadius;
  if (r && (r.tl || r.tr || r.br || r.bl)) {
    const tl = clampRadius(r.tl, width, height);
    const tr = clampRadius(r.tr, width, height);
    const br = clampRadius(r.br, width, height);
    const bl = clampRadius(r.bl, width, height);

    p.moveTo(x + tl, y);
    p.lineTo(x + width - tr, y);
    p.quadraticCurveTo(x + width, y, x + width, y + tr);
    p.lineTo(x + width, y + height - br);
    p.quadraticCurveTo(x + width, y + height, x + width - br, y + height);
    p.lineTo(x + bl, y + height);
    p.quadraticCurveTo(x, y + height, x, y + height - bl);
    p.lineTo(x, y + tl);
    p.quadraticCurveTo(x, y, x + tl, y);
    p.closePath();
  } else {
    p.rect(x, y, width, height);
  }
  return p;
}

/**
 * Heuristic: many Figma exports provide fillGeometry paths in node-local coordinates.
 * If numbers look mostly within [0..maxDim], treat as local and translate by frame.x/y.
 */
export function isLikelyLocalSvgPath(
  pathData: string,
  frame: { x: number; y: number; width: number; height: number },
): boolean {
  const nums = pathData.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
  if (!nums || nums.length === 0) return false;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const n of nums) {
    const v = Number(n);
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return false;

  const maxDim = Math.max(1, Math.max(frame.width, frame.height));
  const withinLocalBand = max <= maxDim * 1.25 && min >= -maxDim * 0.25;
  const looksAbsolute = max >= maxDim * 2 || min <= -maxDim * 2;
  if (looksAbsolute) return false;
  return withinLocalBand;
}

export function areLikelyLocalSvgPaths(
  paths: string[],
  frame: { x: number; y: number; width: number; height: number },
): boolean {
  // Treat a vector as local only if all sub-paths appear local.
  return paths.every((p) => isLikelyLocalSvgPath(p, frame));
}

export function buildCompoundVectorPath(paths: string[]): Path2D | null {
  const compound = new Path2D();
  let added = 0;
  for (const data of paths) {
    try {
      compound.addPath(new Path2D(data));
      added++;
    } catch {
      // ignore invalid sub-paths
    }
  }
  return added > 0 ? compound : null;
}
