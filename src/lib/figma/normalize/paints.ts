import type { NormalizedDesignV1, NormalizedFill } from "../normalized";
import { rgbaCss } from "./shared/color";
import { asNumber, asString, isRecord, type AnyRecord } from "./shared/coerce";

export function parseFills(
  node: AnyRecord,
  warnings: NormalizedDesignV1["warnings"],
  imageHashes: Set<string>,
): NormalizedFill[] {
  const fills = Array.isArray(node.fills) ? (node.fills as unknown[]) : [];
  const backgrounds = Array.isArray(node.backgrounds) ? (node.backgrounds as unknown[]) : [];
  const source = fills.length > 0 ? fills : backgrounds;

  const normalized: NormalizedFill[] = [];

  for (const fill of source) {
    if (!isRecord(fill)) continue;
    const type = asString(fill.type);
    if (!type) continue;

    if (type === "SOLID") {
      const color = isRecord(fill.color) ? (fill.color as AnyRecord) : {};
      const opacity = asNumber(fill.opacity, 1);
      normalized.push({
        kind: "solid",
        css: rgbaCss({
          r: asNumber(color.r, 0),
          g: asNumber(color.g, 0),
          b: asNumber(color.b, 0),
          a: opacity,
        }),
      });
      continue;
    }

    if (type === "IMAGE") {
      const imageHash = asString(fill.imageHash);
      if (imageHash) {
        imageHashes.add(imageHash);
        normalized.push({
          kind: "image",
          imageHash,
          scaleMode: asString(fill.scaleMode),
          cssFallback: "rgba(0,0,0,0.06)",
        });
        warnings.push({
          code: "image_asset_missing",
          message:
            "Image fill references an imageHash, but the export JSON does not include the bitmap bytes. You must attach the image asset during import (next phase).",
        });
      }
      continue;
    }

    if (type.startsWith("GRADIENT")) {
      const gradientStops = Array.isArray(fill.gradientStops)
        ? (fill.gradientStops as unknown[])
        : [];
      const handlePositions = Array.isArray(fill.gradientHandlePositions)
        ? (fill.gradientHandlePositions as unknown[])
        : [];

      const stops = gradientStops
        .map((s) => {
          if (!isRecord(s)) return null;
          const position = asNumber(s.position, NaN);
          const color = isRecord(s.color) ? (s.color as AnyRecord) : {};
          if (!Number.isFinite(position)) return null;
          return {
            offset: Math.max(0, Math.min(1, position)),
            colorCss: rgbaCss({
              r: asNumber(color.r, 0),
              g: asNumber(color.g, 0),
              b: asNumber(color.b, 0),
              a: asNumber(color.a, 1) * asNumber(fill.opacity, 1),
            }),
          };
        })
        .filter((v): v is NonNullable<typeof v> => Boolean(v));

      const handles = handlePositions
        .map((p) => {
          if (!isRecord(p)) return null;
          const x = asNumber(p.x, NaN);
          const y = asNumber(p.y, NaN);
          if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
          return { x, y };
        })
        .filter((v): v is NonNullable<typeof v> => Boolean(v));

      const gradientType =
        type === "GRADIENT_LINEAR"
          ? "linear"
          : type === "GRADIENT_RADIAL"
            ? "radial"
            : type === "GRADIENT_ANGULAR"
              ? "angular"
              : "diamond";

      normalized.push({
        kind: "gradient",
        gradientType,
        stops,
        handlePositions: handles.length ? handles : undefined,
        opacity: asNumber(fill.opacity, 1),
        cssFallback: stops[0]?.colorCss ?? "rgba(0,0,0,0.08)",
      });
      warnings.push({
        code: "gradient_unimplemented",
        message: `Gradient fill type '${type}' detected; gradient data captured and will be rendered by the hybrid renderer/export pipeline.`,
      });
      continue;
    }
  }

  return normalized;
}

export function firstSolidPaint(
  node: AnyRecord,
): { r: number; g: number; b: number; a: number } | null {
  const fills = Array.isArray(node.fills) ? (node.fills as unknown[]) : [];
  const backgrounds = Array.isArray(node.backgrounds) ? (node.backgrounds as unknown[]) : [];
  const source = fills.length > 0 ? fills : backgrounds;
  for (const fill of source) {
    if (!isRecord(fill)) continue;
    const type = asString(fill.type);
    if (type !== "SOLID") continue;
    if ((fill as AnyRecord).visible === false) continue;
    const color = isRecord((fill as AnyRecord).color)
      ? ((fill as AnyRecord).color as AnyRecord)
      : {};
    const opacity = asNumber((fill as AnyRecord).opacity, 1);
    const a = opacity * asNumber(color.a, 1);
    if (a <= 0) continue;
    return {
      r: asNumber(color.r, 0),
      g: asNumber(color.g, 0),
      b: asNumber(color.b, 0),
      a,
    };
  }
  return null;
}
