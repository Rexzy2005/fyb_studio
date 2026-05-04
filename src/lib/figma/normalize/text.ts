import type { NormalizedFill, NormalizedTextNode } from "../normalized";
import type { Bounds } from "./geometry";
import { parseFills } from "./paints";
import { relativeLuminance } from "./shared/color";
import { asNumber, asOptionalNumber, asString, isRecord, type AnyRecord } from "./shared/coerce";
import {
  cleanFontFamily,
  inferFontFamilyFromPostScriptName,
  pickMostCommonFontFamilyFromOverrides,
} from "./shared/font";
import type { AffineMatrix } from "./shared/transform";
import type { NormalizeCtx } from "./shared/ctx";

export type TextNodeBuildArgs = {
  id: string;
  name: string | undefined;
  figmaType: string;
  visible: boolean;
  opacity: number;
  rotation: number;
  transform: AffineMatrix | undefined;
  size: { width: number; height: number } | undefined;
  frame: Bounds;
  fills: NormalizedFill[];
  input: AnyRecord;
  ctx: NormalizeCtx;
};

export function buildTextNode(args: TextNodeBuildArgs): NormalizedTextNode {
  const { id, name, figmaType, visible, opacity, rotation, transform, size, frame, input, ctx } =
    args;
  let { fills } = args;

  const characters = asString(input.characters) ?? "";
  const style = isRecord(input.style) ? (input.style as AnyRecord) : null;

  // Some exports omit node-level `fills` on TEXT, but may include them under `style.fills`.
  if (fills.length === 0 && style) {
    fills = parseFills(
      { fills: (style as AnyRecord).fills, backgrounds: (style as AnyRecord).backgrounds },
      ctx.warnings,
      ctx.imageHashes,
    );
  }

  const fontName = isRecord((input as AnyRecord).fontName)
    ? ((input as AnyRecord).fontName as AnyRecord)
    : null;
  const fontFamilyFromFontName =
    fontName && typeof fontName.family === "string" ? (fontName.family as string) : undefined;

  // Different Figma-export JSONs place font info in slightly different fields.
  // Capture it as robustly as possible so edited SVG text keeps the intended font.
  const styleFontName = style && isRecord(style.fontName) ? (style.fontName as AnyRecord) : null;
  const fontFamilyFromStyleFontName =
    styleFontName && typeof styleFontName.family === "string"
      ? (styleFontName.family as string)
      : undefined;

  // Prefer `fontName.family` when present. Some exports populate `style.fontFamily`
  // with a composite display name (e.g. "Poppins SemiBold"), which won't match
  // Google Fonts or our custom-font store keys, causing edited text to fall back.
  const overrideFontFamily = pickMostCommonFontFamilyFromOverrides(input as AnyRecord);
  const fontFamily =
    cleanFontFamily(
      fontFamilyFromStyleFontName ??
        fontFamilyFromFontName ??
        (style && typeof style.fontFamily === "string" ? (style.fontFamily as string) : undefined) ??
        asString((input as AnyRecord).fontFamily),
    ) ??
    overrideFontFamily ??
    inferFontFamilyFromPostScriptName(
      style && typeof style.fontPostScriptName === "string"
        ? (style.fontPostScriptName as string)
        : undefined,
    );

  const fontStyle: "normal" | "italic" | undefined =
    (style && typeof style.fontStyle === "string"
      ? (style.fontStyle as string).toLowerCase() === "italic"
        ? "italic"
        : "normal"
      : undefined) ??
    (style && typeof style.italic === "boolean" ? (style.italic ? "italic" : "normal") : undefined);

  const textDecoration: "none" | "underline" | "line-through" | undefined =
    style && typeof style.textDecoration === "string"
      ? (style.textDecoration as string).toLowerCase().includes("underline")
        ? "underline"
        : (style.textDecoration as string).toLowerCase().includes("line-through")
          ? "line-through"
          : "none"
      : undefined;

  if (fontFamily) ctx.fonts.add(fontFamily);

  // If TEXT paints are missing (common in some exports), infer a readable color
  // from the nearest ancestor with a solid background. Avoids invisible text on dark bg.
  if (fills.length === 0) {
    const bg = ctx.inheritedBg;
    if (bg) {
      const lum = relativeLuminance(bg);
      const inferred =
        lum < 0.5
          ? { kind: "solid" as const, css: "rgba(255, 255, 255, 1)" }
          : { kind: "solid" as const, css: "rgba(0, 0, 0, 1)" };
      fills = [inferred];
      ctx.warnings.push({
        code: "text_fill_missing_inferred",
        message: "TEXT node has no fills; inferred a contrasting text color from ancestor background.",
        nodeId: id,
      });
    }
  }

  const fillGeometry = Array.isArray((input as AnyRecord).fillGeometry)
    ? ((input as AnyRecord).fillGeometry as unknown[])
    : [];
  const outlinePaths: string[] = [];
  for (const g of fillGeometry) {
    if (!isRecord(g)) continue;
    const data = asString(g.data);
    if (data) outlinePaths.push(data);
  }

  return {
    id,
    name,
    figmaType,
    kind: "text",
    visible,
    opacity,
    rotation,
    transform,
    size,
    frame,
    fills,
    text: {
      characters,
      outlinePaths: outlinePaths.length ? outlinePaths : undefined,
      fontSize:
        asOptionalNumber((input as AnyRecord).fontSize) ??
        (style ? asOptionalNumber(style.fontSize) : undefined),
      fontWeight:
        asOptionalNumber((input as AnyRecord).fontWeight) ??
        (style ? asOptionalNumber(style.fontWeight) : undefined),
      fontFamily,
      fontStyle,
      lineHeight: isRecord(input.lineHeight)
        ? {
            unit: asString(input.lineHeight.unit) ?? "AUTO",
            value: asOptionalNumber((input.lineHeight as AnyRecord).value),
          }
        : undefined,
      letterSpacing:
        isRecord(input.letterSpacing) && typeof input.letterSpacing.value === "number"
          ? {
              unit: asString(input.letterSpacing.unit) ?? "PERCENT",
              value: asNumber(input.letterSpacing.value, 0),
            }
          : undefined,
      textAlignHorizontal: asString(input.textAlignHorizontal),
      textAlignVertical: asString(input.textAlignVertical),
      textCase: asString(input.textCase),
      textDecoration,
    },
  };
}
