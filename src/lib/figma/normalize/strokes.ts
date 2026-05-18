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
  // Two supported input shapes:
  //   1. Legacy / third-party plugin: node.strokes = [paint, paint, ...]
  //      and node.strokeWeight / strokeAlign / strokeCap / strokeJoin /
  //      strokeMiterAngle / dashPattern / individualStrokeWeights sit at
  //      the node level.
  //   2. New FYB plugin: node.strokes = { paints: [...], weight, align,
  //      cap, join, miterLimit, dashPattern, includedInLayout, ... } -
  //      one descriptor that covers all stroke paints for the node, and
  //      `weight` can be either a number OR { mixed: true, perSide }.
  let paintsRaw: unknown[];
  let weightVal: unknown;
  let alignVal: unknown;
  let capVal: unknown;
  let joinVal: unknown;
  let miterVal: unknown;
  let dashVal: unknown;
  let perSideOverride: AnyRecord | null = null;

  if (Array.isArray(node.strokes)) {
    paintsRaw = node.strokes;
    weightVal = node.strokeWeight;
    alignVal = node.strokeAlign;
    capVal = node.strokeCap;
    joinVal = node.strokeJoin;
    miterVal = node.strokeMiterAngle;
    dashVal = node.dashPattern;
    if (isRecord(node.individualStrokeWeights)) {
      perSideOverride = node.individualStrokeWeights as AnyRecord;
    }
  } else if (isRecord(node.strokes)) {
    const s = node.strokes as AnyRecord;
    paintsRaw = Array.isArray(s.paints) ? (s.paints as unknown[]) : [];
    if (isRecord(s.weight) && (s.weight as AnyRecord).mixed === true) {
      const ps = (s.weight as AnyRecord).perSide;
      if (isRecord(ps)) perSideOverride = ps as AnyRecord;
      // For the flat `weight` field we use the AVERAGE so legacy renderers
      // that only know about a single weight still get something sensible.
      weightVal = perSideOverride
        ? (asNumber(perSideOverride.top, 0) +
            asNumber(perSideOverride.right, 0) +
            asNumber(perSideOverride.bottom, 0) +
            asNumber(perSideOverride.left, 0)) /
          4
        : 0;
    } else {
      weightVal = s.weight;
    }
    alignVal = s.align;
    capVal = s.cap;
    joinVal = s.join;
    miterVal = s.miterLimit;
    dashVal = s.dashPattern;
  } else {
    return [];
  }

  if (paintsRaw.length === 0) return [];

  // Each entry is a paint description; we delegate paint parsing to
  // parseFills by wrapping it in a synthetic node-like shape.
  const paints = parseFills(
    { fills: paintsRaw } as AnyRecord,
    warnings,
    imageHashes,
  );

  const weight = asNumber(weightVal, 0);
  const align = asStrokeAlign(alignVal);
  const cap = asStrokeCap(capVal);
  const join = asStrokeJoin(joinVal);
  const miterLimit = asNumber(miterVal, 4);
  const dashPatternRaw = Array.isArray(dashVal) ? (dashVal as unknown[]) : [];
  const dashPattern = dashPatternRaw
    .map((v) => asNumber(v, NaN))
    .filter((v) => Number.isFinite(v) && v >= 0);

  const individualWeights = perSideOverride
    ? {
        top: asNumber(perSideOverride.top, weight),
        right: asNumber(perSideOverride.right, weight),
        bottom: asNumber(perSideOverride.bottom, weight),
        left: asNumber(perSideOverride.left, weight),
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
