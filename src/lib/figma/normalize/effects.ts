import type { BlendMode, NormalizedEffect } from "../normalized";
import { rgbaCss } from "./shared/color";
import { asNumber, asString, isRecord, type AnyRecord } from "./shared/coerce";
import { asBlendMode } from "./shared/enums";

export function parseEffects(node: AnyRecord): NormalizedEffect[] {
  const raw = Array.isArray(node.effects) ? (node.effects as unknown[]) : [];
  const out: NormalizedEffect[] = [];

  for (const e of raw) {
    if (!isRecord(e)) continue;
    const type = asString(e.type);
    if (!type) continue;

    const visible = e.visible !== false;
    const blendMode: BlendMode = asBlendMode(e.blendMode, "NORMAL");

    if (type === "DROP_SHADOW" || type === "INNER_SHADOW") {
      const color = isRecord(e.color) ? (e.color as AnyRecord) : {};
      const offsetRec = isRecord(e.offset) ? (e.offset as AnyRecord) : {};
      const colorCss = rgbaCss({
        r: asNumber(color.r, 0),
        g: asNumber(color.g, 0),
        b: asNumber(color.b, 0),
        a: asNumber(color.a, 1),
      });
      const offset = {
        x: asNumber(offsetRec.x, 0),
        y: asNumber(offsetRec.y, 0),
      };
      const radius = asNumber(e.radius, 0);
      const spread = asNumber(e.spread, 0);

      if (type === "DROP_SHADOW") {
        out.push({
          kind: "drop-shadow",
          offset,
          radius,
          spread,
          color: colorCss,
          blendMode,
          visible,
          showShadowBehindNode: e.showShadowBehindNode === true,
        });
      } else {
        out.push({
          kind: "inner-shadow",
          offset,
          radius,
          spread,
          color: colorCss,
          blendMode,
          visible,
        });
      }
      continue;
    }

    if (type === "LAYER_BLUR") {
      out.push({ kind: "layer-blur", radius: asNumber(e.radius, 0), visible });
      continue;
    }

    if (type === "BACKGROUND_BLUR") {
      out.push({
        kind: "background-blur",
        radius: asNumber(e.radius, 0),
        visible,
      });
      continue;
    }
  }

  return out;
}
