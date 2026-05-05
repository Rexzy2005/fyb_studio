import type {
  AffineMatrix,
  ImageFilters,
  NormalizedDesignV1,
  NormalizedFill,
} from "../normalized";
import { rgbaCss } from "./shared/color";
import { asNumber, asString, isRecord, type AnyRecord } from "./shared/coerce";
import { asBlendMode, asScaleMode } from "./shared/enums";

const ZERO_FILTERS: ImageFilters = {
  exposure: 0,
  contrast: 0,
  saturation: 0,
  temperature: 0,
  tint: 0,
  highlights: 0,
  shadows: 0,
};

function parseImageFilters(raw: unknown): ImageFilters | undefined {
  if (!isRecord(raw)) return undefined;
  const f: ImageFilters = {
    exposure: asNumber(raw.exposure, 0),
    contrast: asNumber(raw.contrast, 0),
    saturation: asNumber(raw.saturation, 0),
    temperature: asNumber(raw.temperature, 0),
    tint: asNumber(raw.tint, 0),
    highlights: asNumber(raw.highlights, 0),
    shadows: asNumber(raw.shadows, 0),
  };
  // Drop the field entirely if every channel is zero, to keep the IR small.
  const isZero = (Object.keys(f) as Array<keyof ImageFilters>).every(
    (k) => f[k] === ZERO_FILTERS[k],
  );
  return isZero ? undefined : f;
}

function parseImageTransform(raw: unknown): AffineMatrix | undefined {
  if (!Array.isArray(raw) || raw.length < 2) return undefined;
  const r0 = Array.isArray(raw[0]) ? (raw[0] as unknown[]) : null;
  const r1 = Array.isArray(raw[1]) ? (raw[1] as unknown[]) : null;
  if (!r0 || !r1 || r0.length < 3 || r1.length < 3) return undefined;
  const a = asNumber(r0[0], NaN);
  const c = asNumber(r0[1], NaN);
  const tx = asNumber(r0[2], NaN);
  const b = asNumber(r1[0], NaN);
  const d = asNumber(r1[1], NaN);
  const ty = asNumber(r1[2], NaN);
  if (![a, b, c, d, tx, ty].every((v) => Number.isFinite(v))) return undefined;
  return { a, b, c, d, tx, ty };
}

export function parseFills(
  node: AnyRecord,
  warnings: NormalizedDesignV1["warnings"],
  imageHashes: Set<string>,
): NormalizedFill[] {
  const fills = Array.isArray(node.fills) ? (node.fills as unknown[]) : [];
  const backgrounds = Array.isArray(node.backgrounds)
    ? (node.backgrounds as unknown[])
    : [];
  const source = fills.length > 0 ? fills : backgrounds;

  const normalized: NormalizedFill[] = [];

  for (const fill of source) {
    if (!isRecord(fill)) continue;
    const type = asString(fill.type);
    if (!type) continue;

    const visible = fill.visible !== false;
    const opacity = asNumber(fill.opacity, 1);
    const blendMode = asBlendMode(fill.blendMode, "NORMAL");

    if (type === "SOLID") {
      const color = isRecord(fill.color) ? (fill.color as AnyRecord) : {};
      // Solid CSS bakes per-fill opacity into the alpha channel for back-compat
      // with the legacy renderer; the structured `opacity` field is also retained.
      normalized.push({
        kind: "solid",
        visible,
        opacity,
        blendMode,
        css: rgbaCss({
          r: asNumber(color.r, 0),
          g: asNumber(color.g, 0),
          b: asNumber(color.b, 0),
          a: opacity * asNumber(color.a, 1),
        }),
      });
      continue;
    }

    if (type === "IMAGE") {
      const imageHash = asString(fill.imageHash) ?? asString(fill.imageRef);
      if (imageHash) {
        imageHashes.add(imageHash);
        normalized.push({
          kind: "image",
          visible,
          opacity,
          blendMode,
          imageHash,
          scaleMode: asScaleMode(fill.scaleMode),
          imageTransform: parseImageTransform(fill.imageTransform),
          scalingFactor: typeof fill.scalingFactor === "number"
            ? fill.scalingFactor
            : undefined,
          rotation: typeof fill.rotation === "number" ? fill.rotation : undefined,
          filters: parseImageFilters(fill.filters),
          cssFallback: "rgba(0,0,0,0.06)",
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
              a: asNumber(color.a, 1) * opacity,
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
        visible,
        opacity,
        blendMode,
        gradientType,
        stops,
        handlePositions: handles.length ? handles : undefined,
        cssFallback: stops[0]?.colorCss ?? "rgba(0,0,0,0.08)",
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
  const backgrounds = Array.isArray(node.backgrounds)
    ? (node.backgrounds as unknown[])
    : [];
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

// Re-export so call sites that previously imported `warnings.code === "image_asset_missing"`
// can still detect the case if needed. Warning is now raised once per design (in nodes.ts),
// not once per fill.
export const IMAGE_ASSET_MISSING_CODE = "image_asset_missing";
