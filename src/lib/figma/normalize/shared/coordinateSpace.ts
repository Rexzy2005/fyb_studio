import type { NormalizedVectorPath } from "../../normalized";
import { asNumber, isRecord, type AnyRecord } from "./coerce";

/**
 * Classify whether the path data in a Figma vector is in node-local
 * coordinates (i.e. relative to the node's top-left at 0,0) or absolute
 * canvas coordinates.
 *
 * Heuristic order:
 *   1. If the exporter included a `coordinateSpace` hint, trust it.
 *   2. If the node has both `relativeTransform` and `width/height`, compare
 *      the path's bounding box against `[0..width] × [0..height]` (local) vs
 *      against the absolute frame (absolute).
 *   3. Otherwise fall back to the magnitude band heuristic.
 */
export function classifyCoordinateSpace(
  pathData: string,
  node: AnyRecord,
  frame: { x: number; y: number; width: number; height: number },
): "local" | "absolute" | "unknown" {
  // 1. Explicit hint
  const hint = isRecord(node) ? (node as AnyRecord).coordinateSpace : undefined;
  if (hint === "local" || hint === "absolute") return hint;

  const bbox = pathBBox(pathData);
  if (!bbox) return "unknown";

  const w = asNumber((node as AnyRecord).width, frame.width);
  const h = asNumber((node as AnyRecord).height, frame.height);

  const localBand = boxFitsWithin(bbox, { x: 0, y: 0, width: w, height: h });
  const absoluteBand = boxFitsWithin(bbox, frame);

  if (localBand && !absoluteBand) return "local";
  if (absoluteBand && !localBand) return "absolute";

  // Both or neither → magnitude-band heuristic.
  const maxDim = Math.max(1, Math.max(frame.width, frame.height));
  const withinLocal = bbox.maxX <= maxDim * 1.25 && bbox.minX >= -maxDim * 0.25;
  const looksAbsolute = bbox.maxX >= maxDim * 2 || bbox.minX <= -maxDim * 2;
  if (looksAbsolute) return "absolute";
  if (withinLocal) return "local";
  return "unknown";
}

export function asWindingRule(value: unknown): "NONZERO" | "EVENODD" {
  return value === "EVENODD" ? "EVENODD" : "NONZERO";
}

export function buildVectorPath(
  pathData: string,
  windingRule: unknown,
  node: AnyRecord,
  frame: { x: number; y: number; width: number; height: number },
): NormalizedVectorPath {
  return {
    data: pathData,
    windingRule: asWindingRule(windingRule),
    coordinateSpace: classifyCoordinateSpace(pathData, node, frame),
  };
}

function pathBBox(pathData: string): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} | null {
  const nums = pathData.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
  if (!nums || nums.length < 2) return null;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = Number(nums[i]);
    const y = Number(nums[i + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return null;
  return { minX, minY, maxX, maxY };
}

function boxFitsWithin(
  box: { minX: number; minY: number; maxX: number; maxY: number },
  frame: { x: number; y: number; width: number; height: number },
): boolean {
  const slack = Math.max(1, Math.max(frame.width, frame.height) * 0.05);
  return (
    box.minX >= frame.x - slack &&
    box.minY >= frame.y - slack &&
    box.maxX <= frame.x + frame.width + slack &&
    box.maxY <= frame.y + frame.height + slack
  );
}
