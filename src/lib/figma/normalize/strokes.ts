import type { NormalizedDesignV1, NormalizedFill, NormalizedStroke } from "../normalized";
import { parseFills } from "./paints";
import { asNumber, isRecord, type AnyRecord } from "./shared/coerce";
import {
  asStrokeAlign,
  asStrokeCap,
  asStrokeJoin,
} from "./shared/enums";

function paintCss(fill: NormalizedFill): string {
  if (fill.kind === "solid") return fill.css;
  if (fill.kind === "gradient") return fill.cssFallback;
  return fill.cssFallback;
}

export function parseStrokes(
  node: AnyRecord,
  warnings: NormalizedDesignV1["warnings"],
  imageHashes: Set<string>,
): NormalizedStroke[] {
  const rawStrokes = Array.isArray(node.strokes) ? (node.strokes as unknown[]) : [];
  if (rawStrokes.length === 0) return [];

  // Each entry of `strokes` is a paint description; we delegate paint parsing
  // to parseFills by wrapping it in a synthetic node-like shape.
  const paints = parseFills(
    { fills: rawStrokes } as AnyRecord,
    warnings,
    imageHashes,
  );

  const weight = asNumber(node.strokeWeight, 0);
  const align = asStrokeAlign(node.strokeAlign);
  const cap = asStrokeCap(node.strokeCap);
  const join = asStrokeJoin(node.strokeJoin);
  const miterLimit = asNumber(node.strokeMiterAngle, 4);
  const dashPatternRaw = Array.isArray(node.dashPattern)
    ? (node.dashPattern as unknown[])
    : [];
  const dashPattern = dashPatternRaw
    .map((v) => asNumber(v, NaN))
    .filter((v) => Number.isFinite(v) && v >= 0);

  const indv = isRecord(node.individualStrokeWeights)
    ? (node.individualStrokeWeights as AnyRecord)
    : null;
  const individualWeights = indv
    ? {
        top: asNumber(indv.top, weight),
        right: asNumber(indv.right, weight),
        bottom: asNumber(indv.bottom, weight),
        left: asNumber(indv.left, weight),
      }
    : undefined;

  const out: NormalizedStroke[] = [];
  for (const paint of paints) {
    out.push({
      paint,
      weight,
      align,
      cap,
      join,
      miterLimit,
      dashPattern,
      individualWeights,
      css: paintCss(paint),
    });
  }
  return out;
}
