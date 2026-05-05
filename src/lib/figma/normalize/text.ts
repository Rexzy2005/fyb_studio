import type {
  BlendMode,
  NormalizedEffect,
  NormalizedFill,
  NormalizedTextNode,
  TextRun,
} from "../normalized";
import type { Bounds } from "./geometry";
import { parseFills } from "./paints";
import { parseStrokes } from "./strokes";
import { relativeLuminance } from "./shared/color";
import { asNumber, asOptionalNumber, asString, isRecord, type AnyRecord } from "./shared/coerce";
import { asAutoResize } from "./shared/enums";
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
  blendMode: BlendMode;
  effects: NormalizedEffect[];
  isMask: boolean;
  transform: AffineMatrix | undefined;
  relativeTransform?: AffineMatrix;
  size: { width: number; height: number } | undefined;
  frame: Bounds;
  fills: NormalizedFill[];
  input: AnyRecord;
  ctx: NormalizeCtx;
};

function parseRuns(
  input: AnyRecord,
  ctx: NormalizeCtx,
  characters: string,
): TextRun[] | undefined {
  const overrides = Array.isArray(input.characterStyleOverrides)
    ? (input.characterStyleOverrides as unknown[])
    : null;
  const styleTable = isRecord(input.styleOverrideTable)
    ? (input.styleOverrideTable as AnyRecord)
    : null;

  if (!overrides || overrides.length === 0 || !styleTable) return undefined;
  const table: AnyRecord = styleTable;

  // Compress per-character indices into [start,end) runs of identical style ids.
  const runs: TextRun[] = [];
  let runStart = 0;
  let currentKey = String(asNumber(overrides[0], 0));

  function flush(endExclusive: number) {
    const styleEntry = table[currentKey];
    if (currentKey !== "0" && isRecord(styleEntry)) {
      const style = styleEntry as AnyRecord;
      const fontName = isRecord(style.fontName)
        ? (style.fontName as AnyRecord)
        : null;
      const fontFamily =
        cleanFontFamily(
          (fontName && typeof fontName.family === "string"
            ? (fontName.family as string)
            : undefined) ??
            (typeof style.fontFamily === "string"
              ? (style.fontFamily as string)
              : undefined),
        ) ??
        inferFontFamilyFromPostScriptName(
          typeof style.fontPostScriptName === "string"
            ? (style.fontPostScriptName as string)
            : undefined,
        );

      if (fontFamily) ctx.fonts.add(fontFamily);

      const runFills = Array.isArray(style.fills)
        ? parseFills({ fills: style.fills } as AnyRecord, ctx.warnings, ctx.imageHashes)
        : undefined;

      runs.push({
        start: runStart,
        end: endExclusive,
        fontFamily,
        fontWeight: asOptionalNumber(style.fontWeight),
        fontStyle:
          fontName && typeof fontName.style === "string"
            ? fontName.style.toLowerCase().includes("italic")
              ? "italic"
              : "normal"
            : undefined,
        fontSize: asOptionalNumber(style.fontSize),
        letterSpacing:
          isRecord(style.letterSpacing) &&
          typeof (style.letterSpacing as AnyRecord).value === "number"
            ? {
                unit:
                  asString((style.letterSpacing as AnyRecord).unit) === "PIXELS"
                    ? "PIXELS"
                    : "PERCENT",
                value: asNumber((style.letterSpacing as AnyRecord).value, 0),
              }
            : undefined,
        fills: runFills && runFills.length ? runFills : undefined,
        textDecoration:
          typeof style.textDecoration === "string"
            ? (style.textDecoration as string).toLowerCase().includes("underline")
              ? "underline"
              : (style.textDecoration as string)
                    .toLowerCase()
                    .includes("strikethrough")
                ? "line-through"
                : "none"
            : undefined,
        textCase: asString(style.textCase),
      });
    }
  }

  for (let i = 1; i < overrides.length; i++) {
    const key = String(asNumber(overrides[i], 0));
    if (key !== currentKey) {
      flush(i);
      runStart = i;
      currentKey = key;
    }
  }
  flush(Math.max(overrides.length, characters.length));

  return runs.length ? runs : undefined;
}

export function buildTextNode(args: TextNodeBuildArgs): NormalizedTextNode {
  const {
    id,
    name,
    figmaType,
    visible,
    opacity,
    rotation,
    blendMode,
    effects,
    isMask,
    transform,
    relativeTransform,
    size,
    frame,
    input,
    ctx,
  } = args;
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
      const inferredCss = lum < 0.5 ? "rgba(255, 255, 255, 1)" : "rgba(0, 0, 0, 1)";
      fills = [
        {
          kind: "solid",
          visible: true,
          opacity: 1,
          blendMode: "NORMAL",
          css: inferredCss,
        },
      ];
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

  const runs = parseRuns(input as AnyRecord, ctx, characters);
  const strokes = parseStrokes(input as AnyRecord, ctx.warnings, ctx.imageHashes);

  return {
    id,
    name,
    figmaType,
    kind: "text",
    visible,
    opacity,
    rotation,
    blendMode,
    effects,
    isMask,
    transform,
    relativeTransform,
    size,
    frame,
    fills,
    strokes,
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
      paragraphSpacing: asOptionalNumber(input.paragraphSpacing),
      paragraphIndent: asOptionalNumber(input.paragraphIndent),
      autoResize: asAutoResize(input.textAutoResize),
      runs,
    },
  };
}
