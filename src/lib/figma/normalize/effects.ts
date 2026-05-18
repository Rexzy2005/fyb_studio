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
      out.push({
        kind: "layer-blur",
        radius: asNumber(e.radius, 0),
        visible,
        progressive: extractProgressive(e),
      });
      continue;
    }

    if (type === "BACKGROUND_BLUR") {
      out.push({
        kind: "background-blur",
        radius: asNumber(e.radius, 0),
        visible,
        progressive: extractProgressive(e),
      });
      continue;
    }

    if (type === "NOISE") {
      const color = isRecord(e.color) ? (e.color as AnyRecord) : {};
      const secondary = isRecord(e.secondaryColor) ? (e.secondaryColor as AnyRecord) : null;
      const noiseTypeRaw = asString(e.noiseType)?.toLowerCase() ?? "monotone";
      const noiseType: "monotone" | "duotone" | "multitone" =
        noiseTypeRaw === "duotone"
          ? "duotone"
          : noiseTypeRaw === "multitone"
            ? "multitone"
            : "monotone";
      out.push({
        kind: "noise",
        noiseType,
        color: rgbaCss({
          r: asNumber(color.r, 0),
          g: asNumber(color.g, 0),
          b: asNumber(color.b, 0),
          a: asNumber(color.a, 1),
        }),
        secondaryColor: secondary
          ? rgbaCss({
              r: asNumber(secondary.r, 0),
              g: asNumber(secondary.g, 0),
              b: asNumber(secondary.b, 0),
              a: asNumber(secondary.a, 1),
            })
          : undefined,
        noiseSize: asNumber(e.noiseSize, 1),
        density: asNumber(e.density, 0.5),
        opacity: asNumber(e.opacity, 1),
        blendMode,
        visible,
      });
      continue;
    }

    if (type === "TEXTURE") {
      out.push({
        kind: "texture",
        noiseSize: asNumber(e.noiseSize, 1),
        radius: asNumber(e.radius, 0),
        clipToShape: e.clipToShape !== false,
        visible,
      });
      continue;
    }

    if (type === "GLASS") {
      out.push({
        kind: "glass",
        lightIntensity: asNumber(e.lightIntensity, 0.5),
        lightAngle: asNumber(e.lightAngle, 45),
        refraction: asNumber(e.refraction, 0.5),
        depth: asNumber(e.depth, 4),
        dispersion: asNumber(e.dispersion, 0),
        radius: asNumber(e.radius, 0),
        visible,
      });
      continue;
    }
  }

  return out;
}

/**
 * Pull a PROGRESSIVE blur descriptor off a LAYER_BLUR/BACKGROUND_BLUR effect.
 * Returns undefined for NORMAL blurs (the plugin omits the offset fields).
 */
function extractProgressive(e: AnyRecord):
  | { startRadius: number; startOffset: number; endOffset: number }
  | undefined {
  const blurType = asString(e.blurType);
  if (blurType !== "PROGRESSIVE") return undefined;
  // We rely on either explicit start/end offsets OR fall back to a sensible
  // top-to-bottom ramp (0 → 1) when only the start radius is provided.
  return {
    startRadius: asNumber(e.startRadius, 0),
    startOffset: asNumber(e.startOffset, 0),
    endOffset: asNumber(e.endOffset, 1),
  };
}
