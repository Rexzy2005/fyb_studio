import type { NormalizedStroke } from "../normalized";
import { rgbaCss } from "./shared/color";
import { asNumber, asString, isRecord, type AnyRecord } from "./shared/coerce";

export function parseStrokes(node: AnyRecord): NormalizedStroke[] {
  const strokes = Array.isArray(node.strokes) ? (node.strokes as unknown[]) : [];
  const weight = asNumber(node.strokeWeight, 0);
  const normalized: NormalizedStroke[] = [];

  for (const stroke of strokes) {
    if (!isRecord(stroke)) continue;
    const type = asString(stroke.type);
    if (type !== "SOLID") continue;
    const color = isRecord(stroke.color) ? (stroke.color as AnyRecord) : {};
    const opacity = asNumber(stroke.opacity, 1);
    normalized.push({
      css: rgbaCss({
        r: asNumber(color.r, 0),
        g: asNumber(color.g, 0),
        b: asNumber(color.b, 0),
        a: opacity,
      }),
      weight,
    });
  }

  return normalized;
}
