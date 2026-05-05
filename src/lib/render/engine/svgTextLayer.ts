import type { NormalizedDesignV1, NormalizedNode, NormalizedTextNode, TextRun } from "@/lib/figma";
import { escapeAttr, escapeText } from "@/lib/render/features/svgEscape";
import { isLikelyLocalSvgPath } from "@/lib/render/features/path2d";
import { applyTextCase, resolveEffectiveTextCase } from "@/lib/render/textCase";
import type { FieldConfig } from "@/lib/storage/types";

export type BuildTextSvgInput = {
  design: NormalizedDesignV1;
  fieldConfig: FieldConfig;
  previewTextByNodeId: Record<string, string>;
  includeGuides: boolean;
};

/**
 * Build the SVG markup for the text + outline layer of a normalized design.
 *
 * The canvas backend handles fills/strokes/effects on shape and container
 * nodes; this builder emits TEXT nodes (and pre-baked text outline geometry)
 * as SVG <text>/<g> elements. Both the editor preview and the PNG exporter
 * call into this — see `engine/renderTree.ts` for the unified flow.
 */
export function buildTextSvg(input: BuildTextSvgInput): string {
  const { design, fieldConfig, previewTextByNodeId, includeGuides } = input;
  const configured = new Map(fieldConfig.fields.map((f) => [f.nodeId, f] as const));

  const measureCtx = (() => {
    if (typeof document === "undefined") return null;
    const canvas = document.createElement("canvas");
    return canvas.getContext("2d");
  })();

  const defs: string[] = [];
  const clipIdByNodeId = new Map<string, string>();
  const textClipIdByNodeId = new Map<string, string>();
  const textLocalClipIdByNodeId = new Map<string, string>();

  function clampNumber(value: unknown, min: number, max: number): number {
    const n = typeof value === "number" && Number.isFinite(value) ? value : NaN;
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  function computeLineHeightPx(
    lineHeight: { unit: string; value?: number } | undefined,
    fontSize: number,
    baseFontSize: number,
  ) {
    const lh = lineHeight;
    // Default (and AUTO without a value) → preserve sub-pixel font sizes.
    if (!lh) return fontSize * 1.2;
    if (lh.unit === "PIXELS" && typeof lh.value === "number") {
      const ratio = baseFontSize > 0 ? fontSize / baseFontSize : 1;
      return lh.value * ratio;
    }
    if (lh.unit === "PERCENT" && typeof lh.value === "number") return (lh.value / 100) * fontSize;
    return fontSize * 1.2;
  }

  function letterSpacingPx(
    letterSpacing: { unit: string; value: number } | undefined,
    fontSize: number,
  ) {
    const ls = letterSpacing;
    if (!ls) return 0;
    if (ls.unit === "PERCENT") return (ls.value / 100) * fontSize;
    return ls.value;
  }

  function measureTextWidth(text: string, font: string, extraLetterSpacingPx: number) {
    if (!measureCtx) return text.length * 8;
    measureCtx.font = font;
    const w = measureCtx.measureText(text).width;
    const ls = text.length > 1 ? (text.length - 1) * extraLetterSpacingPx : 0;
    return w + ls;
  }

  function wrapToWidth(input: string, maxWidth: number, font: string, extraLetterSpacingPx: number) {
    const tokens = input.split(/(\s+)/);
    const out: string[] = [];
    let line = "";
    function pushLine() {
      out.push(line.trimEnd());
      line = "";
    }
    for (const t of tokens) {
      if (!line) {
        line = t;
        continue;
      }
      const candidate = line + t;
      if (measureTextWidth(candidate, font, extraLetterSpacingPx) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (measureTextWidth(t, font, extraLetterSpacingPx) > maxWidth) {
        pushLine();
        let chunk = "";
        for (const ch of t) {
          const next = chunk + ch;
          if (measureTextWidth(next, font, extraLetterSpacingPx) <= maxWidth || !chunk) {
            chunk = next;
          } else {
            out.push(chunk);
            chunk = ch;
          }
        }
        line = chunk;
      } else {
        pushLine();
        line = t;
      }
    }
    if (line.trim().length) pushLine();
    return out.length ? out : [""];
  }

  function ensureClipPath(node: Extract<NormalizedNode, { kind: "container" }>) {
    const existing = clipIdByNodeId.get(node.id);
    if (existing) return existing;
    const clipId = `clip-${node.id}`;
    clipIdByNodeId.set(node.id, clipId);
    const r = node.cornerRadius;
    const rx = r ? Math.max(r.tl, r.tr, r.bl, r.br) : 0;
    defs.push(
      `<clipPath id="${escapeAttr(clipId)}"><rect x="${node.frame.x}" y="${node.frame.y}" width="${node.frame.width}" height="${node.frame.height}" rx="${rx}" ry="${rx}" /></clipPath>`,
    );
    return clipId;
  }

  function ensureTextClipPath(node: Extract<NormalizedNode, { kind: "text" }>) {
    const existing = textClipIdByNodeId.get(node.id);
    if (existing) return existing;
    const clipId = `clip-text-${node.id}`;
    textClipIdByNodeId.set(node.id, clipId);
    defs.push(
      `<clipPath id="${escapeAttr(clipId)}" clipPathUnits="userSpaceOnUse"><rect x="${node.frame.x}" y="${node.frame.y}" width="${node.frame.width}" height="${node.frame.height}" /></clipPath>`,
    );
    return clipId;
  }

  function ensureTextLocalClipPath(
    node: Extract<NormalizedNode, { kind: "text" }>,
    localW: number,
    localH: number,
  ) {
    const existing = textLocalClipIdByNodeId.get(node.id);
    if (existing) return existing;
    const clipId = `clip-text-local-${node.id}`;
    textLocalClipIdByNodeId.set(node.id, clipId);
    defs.push(
      `<clipPath id="${escapeAttr(clipId)}" clipPathUnits="userSpaceOnUse"><rect x="0" y="0" width="${localW}" height="${localH}" /></clipPath>`,
    );
    return clipId;
  }

  /**
   * Emit per-character runs as separate <tspan>s when the node has runs[]
   * AND the user has not overridden the text. Runs with no fill / size / weight
   * inherit from the base style.
   */
  function tspansForRuns(
    line: string,
    lineStart: number,
    runs: TextRun[],
    baseStyle: {
      fontSize: number;
      fontWeight: number;
      fontFamily: string;
      fontStyle: string;
      fillCss: string;
    },
    x: number,
    dy: number,
  ): string {
    const lineEnd = lineStart + line.length;
    const segments: Array<{ start: number; end: number; run?: TextRun }> = [];
    let cursor = lineStart;
    while (cursor < lineEnd) {
      const run = runs.find((r) => cursor >= r.start && cursor < r.end);
      const segEnd = run ? Math.min(run.end, lineEnd) : findNextRunStart(runs, cursor, lineEnd);
      segments.push({ start: cursor, end: segEnd, run });
      cursor = segEnd;
    }

    return segments
      .map((seg, idx) => {
        const slice = line.slice(seg.start - lineStart, seg.end - lineStart);
        if (!slice) return "";
        const r = seg.run;
        const fontSize = r?.fontSize ?? baseStyle.fontSize;
        const fontWeight = r?.fontWeight ?? baseStyle.fontWeight;
        const fontFamily = r?.fontFamily ?? baseStyle.fontFamily;
        const fontStyle = r?.fontStyle ?? baseStyle.fontStyle;
        const fillCss =
          r?.fills && r.fills[0]?.kind === "solid" ? r.fills[0].css : baseStyle.fillCss;
        const decoration = r?.textDecoration ?? "none";
        const dyAttr = idx === 0 ? `dy="${dy}"` : "";
        const xAttr = idx === 0 ? `x="${x}"` : "";
        return `<tspan ${xAttr} ${dyAttr} font-size="${fontSize}" font-weight="${fontWeight}" font-style="${fontStyle}" fill="${escapeAttr(fillCss)}" text-decoration="${decoration}" style="font-family:${escapeAttr(fontFamily)};">${escapeText(slice)}</tspan>`;
      })
      .join("");
  }

  function findNextRunStart(runs: TextRun[], from: number, cap: number): number {
    let next = cap;
    for (const r of runs) if (r.start > from && r.start < next) next = r.start;
    return next;
  }

  function renderTextNode(node: NormalizedTextNode) {
    const fill = node.fills[0];
    const fillCss = fill?.kind === "solid" ? fill.css : "#000";

    const field = configured.get(node.id);
    const override = previewTextByNodeId[node.id];
    const isOverridden = Object.prototype.hasOwnProperty.call(previewTextByNodeId, node.id);
    const maxChars = field?.kind === "text" ? field.maxChars : undefined;
    const charactersRaw = override ?? node.text.characters;
    const characters =
      typeof maxChars === "number" && maxChars > 0
        ? charactersRaw.slice(0, maxChars)
        : charactersRaw;

    const outlinePaths = node.text.outlinePaths;
    if (!isOverridden && outlinePaths?.length) {
      const sizeW = node.size?.width ?? node.frame.width;
      const sizeH = node.size?.height ?? node.frame.height;
      const local = isLikelyLocalSvgPath(outlinePaths[0], { x: 0, y: 0, width: sizeW, height: sizeH });
      const m = node.transform;

      // Outline-path branch: glyphs are already vector paths, so strokes on
      // text translate directly to path strokes. INSIDE/OUTSIDE alignment
      // works exactly because we have the real glyph silhouette.
      const stroke = Array.isArray(node.strokes)
        ? node.strokes.find((s) => s.weight > 0 && s.paint?.visible !== false)
        : undefined;
      const align = stroke?.align ?? "CENTER";
      const widthMul = stroke ? (align === "CENTER" ? 1 : 2) : 1;
      const paintOrder =
        align === "OUTSIDE" ? "stroke fill" : "fill stroke";
      const strokeAttrs = stroke
        ? ` stroke="${escapeAttr(stroke.css)}" stroke-width="${stroke.weight * widthMul}" stroke-linejoin="${stroke.join === "ROUND" ? "round" : stroke.join === "BEVEL" ? "bevel" : "miter"}" stroke-linecap="${stroke.cap === "ROUND" ? "round" : stroke.cap === "SQUARE" ? "square" : "butt"}" paint-order="${paintOrder}"`
        : "";

      const paths = outlinePaths
        .map(
          (d) =>
            `<path d="${escapeAttr(d)}" fill="${escapeAttr(fillCss)}"${strokeAttrs} />`,
        )
        .join("");

      if (local && m) {
        const matrix = `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.tx} ${m.ty})`;
        return `<g transform="${escapeAttr(matrix)}">${paths}</g>`;
      }
      const translate = local ? ` transform="translate(${node.frame.x} ${node.frame.y})"` : "";
      return `<g${translate}>${paths}</g>`;
    }

    const resolvedText = {
      fontSize: node.text.fontSize ?? 12,
      fontWeight: node.text.fontWeight ?? 400,
      fontFamily: node.text.fontFamily ?? "system-ui, -apple-system, Segoe UI, Roboto, Arial",
      fontStyle: node.text.fontStyle ?? "normal",
      lineHeight: node.text.lineHeight,
      letterSpacing: node.text.letterSpacing,
      textAlignHorizontal: node.text.textAlignHorizontal ?? "LEFT",
      textAlignVertical: node.text.textAlignVertical ?? "TOP",
      textCase: node.text.textCase,
      textDecoration: node.text.textDecoration ?? "none",
    };

    const effectiveTextCase = resolveEffectiveTextCase(
      resolvedText.textCase,
      field?.kind === "text" ? field.textBehavior?.case : undefined,
    );
    const displayed = applyTextCase(characters, effectiveTextCase);
    const baseFontSize = resolvedText.fontSize;

    const localW = node.size?.width ?? node.frame.width;
    const localH = node.size?.height ?? node.frame.height;
    const m = node.transform;
    const useMatrixForOverriddenText = Boolean(isOverridden && m && localW > 0 && localH > 0);

    const behavior =
      field?.kind === "text"
        ? {
            autoScale: field.textBehavior?.autoScale ?? true,
            minFontSize: field.textBehavior?.minFontSize ?? baseFontSize,
            maxFontSize: field.textBehavior?.maxFontSize ?? baseFontSize,
            overflow: field.textBehavior?.overflow ?? "shrink",
          }
        : null;

    const fontFamily = resolvedText.fontFamily;
    const fontStyle = resolvedText.fontStyle;
    const textDecoration = resolvedText.textDecoration;

    function layoutAt(fontSizeCandidate: number) {
      const lh = computeLineHeightPx(resolvedText.lineHeight, fontSizeCandidate, baseFontSize);
      const ls = letterSpacingPx(resolvedText.letterSpacing, fontSizeCandidate);
      const font = `${fontStyle} ${resolvedText.fontWeight} ${fontSizeCandidate}px ${fontFamily}`;
      let lines: string[];
      const layoutW = useMatrixForOverriddenText ? localW : node.frame.width;
      const layoutH = useMatrixForOverriddenText ? localH : node.frame.height;
      if (behavior?.overflow === "wrap") {
        const paras = displayed.split("\n");
        lines = paras.flatMap((p) => wrapToWidth(p, Math.max(1, layoutW), font, ls));
      } else {
        lines = displayed.split("\n");
      }
      const maxW = lines.reduce((mx, line) => Math.max(mx, measureTextWidth(line, font, ls)), 0);
      const h = lines.length * lh;
      return { fontSize: fontSizeCandidate, lineHeightPx: lh, lines, maxW, h, layoutW, layoutH };
    }

    let layout = layoutAt(baseFontSize);
    const shouldConstrain = Boolean(behavior);

    if (behavior?.autoScale || behavior?.overflow === "shrink") {
      const minFs = clampNumber(behavior.minFontSize, 1, 512);
      const maxFs = clampNumber(behavior.maxFontSize, minFs, 512);
      let lo = minFs;
      let hi = maxFs;
      let best = layoutAt(lo);
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2;
        const cand = layoutAt(mid);
        const fits = cand.maxW <= cand.layoutW + 0.25 && cand.h <= cand.layoutH + 0.25;
        if (fits) {
          best = cand;
          lo = mid;
        } else {
          hi = mid;
        }
      }
      layout = best;
    }

    const textBlockHeight = layout.lines.length * layout.lineHeightPx;
    const baseY = useMatrixForOverriddenText
      ? resolvedText.textAlignVertical === "CENTER"
        ? (localH - textBlockHeight) / 2
        : resolvedText.textAlignVertical === "BOTTOM"
          ? localH - textBlockHeight
          : 0
      : resolvedText.textAlignVertical === "CENTER"
        ? node.frame.y + (node.frame.height - textBlockHeight) / 2
        : resolvedText.textAlignVertical === "BOTTOM"
          ? node.frame.y + node.frame.height - textBlockHeight
          : node.frame.y;

    const anchor =
      resolvedText.textAlignHorizontal === "CENTER"
        ? "middle"
        : resolvedText.textAlignHorizontal === "RIGHT"
          ? "end"
          : "start";

    const x = useMatrixForOverriddenText
      ? anchor === "middle"
        ? localW / 2
        : anchor === "end"
          ? localW
          : 0
      : anchor === "middle"
        ? node.frame.x + node.frame.width / 2
        : anchor === "end"
          ? node.frame.x + node.frame.width
          : node.frame.x;

    const y = baseY;

    const rotated = !useMatrixForOverriddenText && node.rotation && Math.abs(node.rotation) > 0.001;
    const cx = node.frame.x + node.frame.width / 2;
    const cy = node.frame.y + node.frame.height / 2;
    const transform = rotated ? `rotate(${node.rotation} ${cx} ${cy})` : "";

    const useRuns = !isOverridden && Array.isArray(node.text.runs) && node.text.runs.length > 0;

    let lineCharCursor = 0;
    const tspans = layout.lines
      .map((line, idx) => {
        const dy = idx === 0 ? 0 : layout.lineHeightPx;
        const lineStart = lineCharCursor;
        lineCharCursor += line.length + 1; // +1 for the implicit newline between split lines
        if (useRuns && node.text.runs) {
          return tspansForRuns(
            line,
            lineStart,
            node.text.runs,
            {
              fontSize: layout.fontSize,
              fontWeight: resolvedText.fontWeight,
              fontFamily,
              fontStyle,
              fillCss,
            },
            x,
            dy,
          );
        }
        return `<tspan x="${x}" dy="${dy}">${escapeText(line)}</tspan>`;
      })
      .join("");

    const letterSpacingCss =
      resolvedText.letterSpacing?.unit === "PERCENT"
        ? `${(resolvedText.letterSpacing.value / 100) * layout.fontSize}px`
        : `${resolvedText.letterSpacing?.value ?? 0}px`;

    // First visible text stroke wins (SVG <text> only carries one stroke).
    // OUTSIDE → paint stroke first, then fill; double the width because the
    // fill covers the inner half of the centered stroke.
    // INSIDE  → paint fill first then stroke at double width; the rendered
    // stroke is centered on the glyph edge but only the inner half is visible
    // because anything past the glyph silhouette is clipped by the next glyph
    // pass. (For pixel-perfect INSIDE we'd need to convert text to outlines;
    // this approximation matches Figma closely enough for headline use.)
    // CENTER  → default paint-order, single weight.
    const stroke =
      Array.isArray(node.strokes)
        ? node.strokes.find((s) => s.weight > 0 && s.paint?.visible !== false)
        : undefined;
    const strokeAttrs = stroke
      ? (() => {
          const align = stroke.align ?? "CENTER";
          const widthMultiplier = align === "CENTER" ? 1 : 2;
          const paintOrder =
            align === "OUTSIDE"
              ? "stroke fill"
              : align === "INSIDE"
                ? "fill stroke"
                : "fill stroke";
          const cap =
            stroke.cap === "ROUND" ? "round" : stroke.cap === "SQUARE" ? "square" : "butt";
          const join =
            stroke.join === "ROUND" ? "round" : stroke.join === "BEVEL" ? "bevel" : "miter";
          const dash =
            stroke.dashPattern && stroke.dashPattern.length
              ? ` stroke-dasharray="${stroke.dashPattern.join(" ")}"`
              : "";
          return ` stroke="${escapeAttr(stroke.css)}" stroke-width="${stroke.weight * widthMultiplier}" stroke-linecap="${cap}" stroke-linejoin="${join}" paint-order="${paintOrder}"${dash}`;
        })()
      : "";

    const textEl = `<text xml:space="preserve" x="${x}" y="${y}" fill="${escapeAttr(fillCss)}" font-size="${layout.fontSize}" font-weight="${resolvedText.fontWeight}" font-style="${fontStyle}" text-decoration="${textDecoration}" text-anchor="${anchor}" dominant-baseline="hanging"${strokeAttrs} ${transform ? `transform="${escapeAttr(transform)}"` : ""} style="white-space:pre;font-family:${escapeAttr(fontFamily)};letter-spacing:${escapeAttr(letterSpacingCss)};">${tspans}</text>`;

    const matrix =
      useMatrixForOverriddenText && m
        ? `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.tx} ${m.ty})`
        : "";

    if (!shouldConstrain) {
      return matrix ? `<g transform="${escapeAttr(matrix)}">${textEl}</g>` : textEl;
    }
    if (matrix) {
      const clip = ensureTextLocalClipPath(node, localW, localH);
      return `<g transform="${escapeAttr(matrix)}" clip-path="url(#${escapeAttr(clip)})">${textEl}</g>`;
    }
    return `<g clip-path="url(#${escapeAttr(ensureTextClipPath(node))})">${textEl}</g>`;
  }

  function renderGuidesForText(node: NormalizedTextNode) {
    const field = configured.get(node.id);
    if (!includeGuides || !field) return "";
    return `<rect x="${node.frame.x}" y="${node.frame.y}" width="${node.frame.width}" height="${node.frame.height}" fill="none" stroke="rgba(16,185,129,0.9)" stroke-width="1" stroke-dasharray="4 3"/>`;
  }

  function renderGroup(id: string): string {
    const node = design.nodesById[id] as NormalizedNode | undefined;
    if (!node) return "";
    if (!node.visible) return "";
    if (node.opacity <= 0) return "";
    const self = node.kind === "text" ? renderTextNode(node) + renderGuidesForText(node) : "";
    const children = (design.childrenById[id] ?? []).map((cid) => renderGroup(cid)).join("");
    if (!self && !children) return "";
    const clipPath =
      node.kind === "container" && node.clipsContent
        ? ` clip-path="url(#${escapeAttr(ensureClipPath(node))})"`
        : "";
    return `<g opacity="${node.opacity}"${clipPath}>${self}${children}</g>`;
  }

  const body = design.rootIds.map((rid) => renderGroup(rid)).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${design.canvas.width}" height="${design.canvas.height}" viewBox="0 0 ${design.canvas.width} ${design.canvas.height}">
${defs.length ? `<defs>\n${defs.join("\n")}\n</defs>` : ""}
${body}
</svg>`;
}
