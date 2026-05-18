import type { BlendMode, NormalizedDesignV1, NormalizedNode, NormalizedTextNode, TextRun } from "@/lib/figma";
import { figmaBlurRadiusToSigma } from "@/lib/render/features/effects/blurRadius";
import { escapeAttr, escapeText } from "@/lib/render/features/svgEscape";
import { isLikelyLocalSvgPath } from "@/lib/render/features/path2d";
import { applyTextCase, resolveEffectiveTextCase } from "@/lib/render/textCase";
import type { FieldConfig } from "@/lib/storage/types";

/**
 * Build a font-family stack from the resolved family + the original Figma
 * family. Quoted because Figma family names often contain spaces ("Helvetica
 * Neue") which CSS requires to be quoted. Both names are emitted so the
 * browser walks them in order - useful when font-loading normalisation aliased
 * the family to a Google Fonts equivalent but the original name is what's
 * actually installed on the user's system.
 */
function buildFontFamilyStack(
  primary: string | undefined,
  fallback: string | undefined,
): string | null {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const name of [primary, fallback]) {
    if (!name) continue;
    const trimmed = name.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    parts.push(`"${trimmed.replace(/"/g, '\\"')}"`);
  }
  if (parts.length === 0) return null;
  return parts.join(", ");
}

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
 * call into this - see `engine/renderTree.ts` for the unified flow.
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

  function ensureClipPath(node: Exclude<NormalizedNode, { kind: "text" }>) {
    const existing = clipIdByNodeId.get(node.id);
    if (existing) return existing;
    const clipId = `clip-${node.id}`;
    clipIdByNodeId.set(node.id, clipId);
    const r = node.cornerRadius;
    const hasMatrix = Boolean(node.transform && node.size);
    const x = hasMatrix ? 0 : node.frame.x;
    const y = hasMatrix ? 0 : node.frame.y;
    const w = hasMatrix ? (node.size?.width ?? node.frame.width) : node.frame.width;
    const h = hasMatrix ? (node.size?.height ?? node.frame.height) : node.frame.height;
    const transform =
      hasMatrix && node.transform
        ? ` transform="matrix(${node.transform.a} ${node.transform.b} ${node.transform.c} ${node.transform.d} ${node.transform.tx} ${node.transform.ty})"`
        : "";
    let shape: string;
    if (!r || (r.tl === 0 && r.tr === 0 && r.bl === 0 && r.br === 0)) {
      shape = `<rect x="${x}" y="${y}" width="${w}" height="${h}"${transform} />`;
    } else {
      // Build an SVG path with individual corner radii - SVG <rect rx/ry> only
      // supports uniform corners, so we need an explicit path for asymmetric radii.
      const tl = Math.min(r.tl, w / 2, h / 2);
      const tr = Math.min(r.tr, w / 2, h / 2);
      const br = Math.min(r.br, w / 2, h / 2);
      const bl = Math.min(r.bl, w / 2, h / 2);
      shape = `<path d="M${x + tl},${y} H${x + w - tr} Q${x + w},${y} ${x + w},${y + tr} V${y + h - br} Q${x + w},${y + h} ${x + w - br},${y + h} H${x + bl} Q${x},${y + h} ${x},${y + h - bl} V${y + tl} Q${x},${y} ${x + tl},${y} Z"${transform} />`;
    }
    defs.push(`<clipPath id="${escapeAttr(clipId)}" clipPathUnits="userSpaceOnUse">${shape}</clipPath>`);
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
   * Build an SVG <filter> equivalent of Figma's text effects that can be
   * represented inside the SVG text layer: drop-shadow, inner-shadow, and
   * layer-blur. Returns the `filter="url(#...)"` attribute or empty string.
   *
   * Why this lives here: shape/container shadows are painted by the canvas
   * backend, but text glyphs render in the SVG layer - so the SVG layer needs
   * its own shadow path. SVG's <feDropShadow> is GPU-accelerated and matches
   * the Figma sigma → radius mapping at radius/2.
   */
  function ensureTextEffectFilter(node: NormalizedTextNode): string {
    const dropShadows = node.effects.filter(
      (e): e is Extract<NormalizedNode["effects"][number], { kind: "drop-shadow" }> =>
        e.kind === "drop-shadow" && e.visible,
    );
    const innerShadows = node.effects.filter(
      (e): e is Extract<NormalizedNode["effects"][number], { kind: "inner-shadow" }> =>
        e.kind === "inner-shadow" && e.visible,
    );
    const layerBlur = node.effects.find(
      (e): e is Extract<NormalizedNode["effects"][number], { kind: "layer-blur" }> =>
        e.kind === "layer-blur" && e.visible && e.radius > 0,
    );
    if (dropShadows.length === 0 && innerShadows.length === 0 && !layerBlur) return "";

    const filterId = `text-effect-${node.id}`;
    const sourceGraphic = layerBlur ? "textLayerBlur" : "SourceGraphic";
    const sourceAlpha = layerBlur ? "textLayerBlurAlpha" : "SourceAlpha";
    const blurParts = layerBlur
      ? [
          `<feGaussianBlur in="SourceGraphic" stdDeviation="${figmaBlurRadiusToSigma(layerBlur.radius)}" result="textLayerBlur" />`,
          `<feColorMatrix in="textLayerBlur" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" result="textLayerBlurAlpha" />`,
        ].join("")
      : "";
    // Each shadow is its own <feGaussianBlur>+<feOffset>+<feFlood>+<feComposite>
    // chain; we merge them all back together with the source on top so the text
    // glyphs themselves stay sharp.
    const dropParts = dropShadows.map((eff, idx) => {
      // Figma's "radius" maps to SVG's stdDeviation = radius/2.
      const sigma = Math.max(0, eff.radius / 2);
      const dx = eff.offset.x;
      const dy = eff.offset.y;
      const flood = `<feFlood flood-color="${escapeAttr(eff.color)}" result="dropFlood${idx}" />`;
      const offset = `<feOffset dx="${dx}" dy="${dy}" in="${sourceAlpha}" result="dropOffset${idx}" />`;
      const blur = `<feGaussianBlur stdDeviation="${sigma}" in="dropOffset${idx}" result="dropBlur${idx}" />`;
      const composite = `<feComposite in="dropFlood${idx}" in2="dropBlur${idx}" operator="in" result="dropShadow${idx}" />`;
      return `${flood}${offset}${blur}${composite}`;
    });
    const innerParts = innerShadows.map((eff, idx) => {
      const sigma = Math.max(0, eff.radius / 2);
      const dx = eff.offset.x;
      const dy = eff.offset.y;
      // Inner shadow = invert the source alpha (so the "outside" becomes
      // opaque), offset+blur it, then composite back inside the original
      // shape using `in` so it only shows within the glyph.
      return [
        `<feFlood flood-color="${escapeAttr(eff.color)}" result="innerFlood${idx}" />`,
        `<feComposite in="innerFlood${idx}" in2="${sourceAlpha}" operator="out" result="innerColored${idx}" />`,
        `<feOffset in="innerColored${idx}" dx="${dx}" dy="${dy}" result="innerOffset${idx}" />`,
        `<feGaussianBlur in="innerOffset${idx}" stdDeviation="${sigma}" result="innerBlur${idx}" />`,
        `<feComposite in="innerBlur${idx}" in2="${sourceAlpha}" operator="in" result="innerShadow${idx}" />`,
      ].join("");
    });

    // Stack drop shadows behind the source, then the source, then inner shadows on top.
    const mergeChildren = [
      ...dropShadows.map((_, i) => `<feMergeNode in="dropShadow${i}" />`),
      `<feMergeNode in="${sourceGraphic}" />`,
      ...innerShadows.map((_, i) => `<feMergeNode in="innerShadow${i}" />`),
    ].join("");

    defs.push(
      `<filter id="${escapeAttr(filterId)}" x="-50%" y="-50%" width="200%" height="200%" filterUnits="objectBoundingBox" primitiveUnits="userSpaceOnUse">${blurParts}${dropParts.join("")}${innerParts.join("")}<feMerge>${mergeChildren}</feMerge></filter>`,
    );
    return ` filter="url(#${escapeAttr(filterId)})"`;
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
        const fontFamily = buildFontFamilyStack(r?.fontFamily, undefined) ?? baseStyle.fontFamily;
        const fontStyle = r?.fontStyle ?? baseStyle.fontStyle;
        const fillCss =
          r?.fills && r.fills[0]?.kind === "solid" ? r.fills[0].css : baseStyle.fillCss;
        const decoration = r?.textDecoration ?? "none";
        // Per-run letter-spacing/line-height: when present, they override
        // the parent <text>'s inherited values for this run only. Without
        // these explicit overrides, mixed-letter-spacing text (very common
        // in headlines like "BOLDtitle SUBTITLE") collapses to one spacing.
        const runLetterSpacingPx =
          r?.letterSpacing?.unit === "PERCENT"
            ? (r.letterSpacing.value / 100) * fontSize
            : r?.letterSpacing?.value;
        const letterSpacingStyle =
          typeof runLetterSpacingPx === "number"
            ? `letter-spacing:${runLetterSpacingPx}px;`
            : "";
        const dyAttr = idx === 0 ? `dy="${dy}"` : "";
        const xAttr = idx === 0 ? `x="${x}"` : "";
        return `<tspan ${xAttr} ${dyAttr} font-size="${fontSize}" font-weight="${fontWeight}" font-style="${fontStyle}" fill="${escapeAttr(fillCss)}" text-decoration="${decoration}" style="font-family:${escapeAttr(fontFamily)};${letterSpacingStyle}">${escapeText(slice)}</tspan>`;
      })
      .join("");
  }

  function findNextRunStart(runs: TextRun[], from: number, cap: number): number {
    let next = cap;
    for (const r of runs) if (r.start > from && r.start < next) next = r.start;
    return next;
  }

  /**
   * Resolve a node fill into an SVG fill attribute value. For solid fills,
   * returns the CSS color string directly. For linear/radial gradient fills,
   * registers a <linearGradient> or <radialGradient> def and returns
   * `url(#id)`. Falls back to `#000` when no usable fill is found.
   *
   * The gradient uses `gradientUnits="objectBoundingBox"` so handle positions
   * in the [0,1] unit-square map correctly onto the text element's bbox.
   */
  function resolveTextFill(fills: NormalizedTextNode["fills"], nodeId: string): string {
    const fill = fills.find((f) => f.visible);
    if (!fill) return "#000";
    if (fill.kind === "solid") return fill.css;
    if (fill.kind === "gradient") {
      const gradId = `text-grad-${nodeId}`;
      const stops = fill.stops
        .map((s) => `<stop offset="${s.offset}" stop-color="${escapeAttr(s.colorCss)}" />`)
        .join("");
      if (fill.gradientType === "linear") {
        const h0 = fill.handlePositions?.[0] ?? { x: 0, y: 0.5 };
        const h1 = fill.handlePositions?.[1] ?? { x: 1, y: 0.5 };
        defs.push(
          `<linearGradient id="${escapeAttr(gradId)}" x1="${h0.x}" y1="${h0.y}" x2="${h1.x}" y2="${h1.y}" gradientUnits="objectBoundingBox">${stops}</linearGradient>`,
        );
        return `url(#${escapeAttr(gradId)})`;
      }
      if (fill.gradientType === "radial") {
        const h0 = fill.handlePositions?.[0] ?? { x: 0.5, y: 0.5 };
        const h1 = fill.handlePositions?.[1] ?? { x: 1, y: 0.5 };
        const r = Math.hypot(h1.x - h0.x, h1.y - h0.y);
        defs.push(
          `<radialGradient id="${escapeAttr(gradId)}" cx="${h0.x}" cy="${h0.y}" r="${r}" fx="${h0.x}" fy="${h0.y}" gradientUnits="objectBoundingBox">${stops}</radialGradient>`,
        );
        return `url(#${escapeAttr(gradId)})`;
      }
      // Angular/diamond: use first-stop color as best approximation
      return fill.stops[0]?.colorCss ?? "#000";
    }
    return "#000";
  }

  function renderTextNode(node: NormalizedTextNode) {
    // Resolve the dominant fill: prefer node.fills, fall back to the first
    // run's fill, then black. Gradient fills are promoted to SVG gradient defs.
    const fillCss = (() => {
      const nodeFill = node.fills.find((f) => f.visible);
      if (nodeFill) return resolveTextFill([nodeFill], node.id);
      const runFill = node.text.runs?.[0]?.fills?.find((f) => f.visible);
      if (runFill?.kind === "solid") return runFill.css;
      return "#000";
    })();

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

      const shadowFilterAttr = ensureTextEffectFilter(node);

      if (local && m) {
        const matrix = `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.tx} ${m.ty})`;
        return `<g transform="${escapeAttr(matrix)}"${shadowFilterAttr}>${paths}</g>`;
      }
      const translate = local ? ` transform="translate(${node.frame.x} ${node.frame.y})"` : "";
      return `<g${translate}${shadowFilterAttr}>${paths}</g>`;
    }

    const resolvedText = {
      fontSize: node.text.fontSize ?? 12,
      fontWeight: node.text.fontWeight ?? 400,
      // The font-family stack: prefer the resolved family, then the original
      // family Figma reported (matters when normalisation simplified the
      // name), and finally a generic fallback. Browsers walk the stack in
      // order, picking the first installed face - exactly what we want for
      // an edited text node so the design retains its typeface even when
      // the family alias has been refined.
      fontFamily:
        buildFontFamilyStack(node.text.fontFamily, node.text.originalFontName?.family) ??
        "system-ui, -apple-system, Segoe UI, Roboto, Arial",
      fontStyle: node.text.fontStyle ?? "normal",
      lineHeight: node.text.lineHeight,
      letterSpacing: node.text.letterSpacing,
      textAlignHorizontal: node.text.textAlignHorizontal ?? "LEFT",
      textAlignVertical: node.text.textAlignVertical ?? "TOP",
      textCase: node.text.textCase,
      textDecoration: node.text.textDecoration ?? "none",
      paragraphSpacing: node.text.paragraphSpacing ?? 0,
      paragraphIndent: node.text.paragraphIndent ?? 0,
      // `leadingTrim: "CAP_HEIGHT"` (Figma's "Vertical trim" toggle) means
      // the bbox top sits flush with the cap-top of the first line - no
      // leading above. Renderer must skip the half-leading offset for this
      // case, otherwise the text drops below where Figma painted it.
      leadingTrim: node.text.leadingTrim ?? "NONE",
      textTruncation: node.text.textTruncation,
      maxLines: node.text.maxLines,
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

    // Apply maxLines + textTruncation: when the design specifies a line cap,
    // trim and append an ellipsis so overflow doesn't just bleed past the box.
    const maxLines = resolvedText.maxLines;
    const isTruncating = resolvedText.textTruncation === "ENDING" || (typeof maxLines === "number" && maxLines > 0);
    if (isTruncating && typeof maxLines === "number" && maxLines > 0 && layout.lines.length > maxLines) {
      const truncated = layout.lines.slice(0, maxLines);
      // Append ellipsis to the last visible line
      const lastLine = truncated[truncated.length - 1] ?? "";
      truncated[truncated.length - 1] = lastLine.trimEnd() + "…";
      layout = { ...layout, lines: truncated, h: truncated.length * layout.lineHeightPx };
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

    // Vertical alignment - match Figma's box-top → em-box-top math precisely.
    // Two cases:
    //
    //   leadingTrim: "NONE" (default)
    //     The bbox includes leading distributed above the cap. With
    //     `dominant-baseline="text-before-edge"` (em-box top at y), we must
    //     add half the leading so the em-box sits where Figma placed it.
    //
    //   leadingTrim: "CAP_HEIGHT"
    //     The bbox top IS the cap-top - no leading above. Adding the half-
    //     leading would push text DOWN. Skip the offset so the em-box top
    //     lands as close as possible to the cap-top (still slightly off by
    //     ~10% of fontSize, the em-top-to-cap-top gap, but visually right).
    const leadingOffsetPx =
      resolvedText.leadingTrim === "CAP_HEIGHT"
        ? 0
        : Math.max(0, (layout.lineHeightPx - layout.fontSize) / 2);
    const y = baseY + leadingOffsetPx;

    const rotated = !useMatrixForOverriddenText && node.rotation && Math.abs(node.rotation) > 0.001;
    const cx = node.frame.x + node.frame.width / 2;
    const cy = node.frame.y + node.frame.height / 2;
    const transform = rotated ? `rotate(${node.rotation} ${cx} ${cy})` : "";

    const useRuns = !isOverridden && Array.isArray(node.text.runs) && node.text.runs.length > 0;

    // Paragraph layout: every `\n` in the source starts a new paragraph.
    // Paragraphs add `paragraphSpacing` between them (extra px of vertical
    // gap) and apply `paragraphIndent` to the first line of each paragraph
    // (horizontal x offset). Lines INSIDE a paragraph (from word-wrap) get
    // neither - they're continuation lines.
    //
    // We track which `displayed` line is a paragraph-start via the source
    // characters. Without an explicit `\n` count, every line is its own
    // paragraph (so paragraphSpacing applies between every line).
    const paragraphCharCounts = displayed.split("\n").map((p) => p.length);
    let lineCharCursor = 0;
    let paragraphIndex = 0;
    let paragraphCharsConsumed = 0;
    const indentPx = resolvedText.paragraphIndent || 0;
    const paragraphGapPx = resolvedText.paragraphSpacing || 0;
    const tspans = layout.lines
      .map((line, idx) => {
        const lineStart = lineCharCursor;
        lineCharCursor += line.length + 1; // +1 for the implicit newline between split lines

        // Did this line start a new paragraph? Only true for the first wrap
        // line of each paragraph. We track via cumulative chars vs the
        // paragraph's char count.
        const isFirstLineOfParagraph =
          idx === 0 ||
          paragraphCharsConsumed >=
            (paragraphCharCounts[paragraphIndex] ?? Number.POSITIVE_INFINITY);
        if (isFirstLineOfParagraph && idx !== 0) {
          paragraphIndex++;
          paragraphCharsConsumed = 0;
        }
        paragraphCharsConsumed += line.length;

        // Vertical advance: lineHeight per line, plus paragraphSpacing when
        // crossing a paragraph boundary (anything but the first line and
        // anything but a continuation wrap-line).
        const dy =
          idx === 0
            ? 0
            : layout.lineHeightPx + (isFirstLineOfParagraph ? paragraphGapPx : 0);

        // Horizontal: indent the FIRST line of each paragraph. Continuation
        // wrap lines stay flush with the bbox edge.
        const xForLine = isFirstLineOfParagraph && indentPx > 0 ? x + indentPx : x;

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
            xForLine,
            dy,
          );
        }
        return `<tspan x="${xForLine}" dy="${dy}">${escapeText(line)}</tspan>`;
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

    const shadowFilterAttr = ensureTextEffectFilter(node);

    const textEl = `<text xml:space="preserve" x="${x}" y="${y}" fill="${escapeAttr(fillCss)}" font-size="${layout.fontSize}" font-weight="${resolvedText.fontWeight}" font-style="${fontStyle}" text-decoration="${textDecoration}" text-anchor="${anchor}" dominant-baseline="text-before-edge"${strokeAttrs}${shadowFilterAttr} ${transform ? `transform="${escapeAttr(transform)}"` : ""} style="white-space:pre;font-family:${escapeAttr(fontFamily)};letter-spacing:${escapeAttr(letterSpacingCss)};">${tspans}</text>`;

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

  function svgBlendMode(mode: BlendMode): string | null {
    switch (mode) {
      case "MULTIPLY":
        return "multiply";
      case "SCREEN":
        return "screen";
      case "OVERLAY":
        return "overlay";
      case "DARKEN":
        return "darken";
      case "LIGHTEN":
        return "lighten";
      case "COLOR_DODGE":
        return "color-dodge";
      case "COLOR_BURN":
        return "color-burn";
      case "HARD_LIGHT":
        return "hard-light";
      case "SOFT_LIGHT":
        return "soft-light";
      case "DIFFERENCE":
        return "difference";
      case "EXCLUSION":
        return "exclusion";
      case "HUE":
        return "hue";
      case "SATURATION":
        return "saturation";
      case "COLOR":
        return "color";
      case "LUMINOSITY":
        return "luminosity";
      default:
        return null;
    }
  }

  function renderChildren(parentId: string): string {
    const childIds = design.childrenById[parentId] ?? [];
    let activeMask: Exclude<NormalizedNode, { kind: "text" }> | null = null;
    const out: string[] = [];

    for (const childId of childIds) {
      const child = design.nodesById[childId] as NormalizedNode | undefined;
      if (!child) continue;
      if (child.isMask) {
        activeMask = child.kind === "text" ? null : child;
        continue;
      }

      const rendered = renderGroup(childId);
      if (!rendered) continue;
      if (activeMask) {
        const clip = ensureClipPath(activeMask);
        out.push(`<g clip-path="url(#${escapeAttr(clip)})">${rendered}</g>`);
      } else {
        out.push(rendered);
      }
    }

    return out.join("");
  }

  function renderGroup(id: string): string {
    const node = design.nodesById[id] as NormalizedNode | undefined;
    if (!node) return "";
    if (!node.visible) return "";
    if (node.opacity <= 0) return "";
    if (node.isMask) return "";
    const self = node.kind === "text" ? renderTextNode(node) + renderGuidesForText(node) : "";
    const children = renderChildren(id);
    if (!self && !children) return "";
    const clipPath =
      node.kind === "container" && node.clipsContent
        ? ` clip-path="url(#${escapeAttr(ensureClipPath(node))})"`
        : "";
    const blendMode = svgBlendMode(node.blendMode);
    const blendStyle = blendMode ? ` style="mix-blend-mode:${blendMode};"` : "";
    return `<g opacity="${node.opacity}"${clipPath}${blendStyle}>${self}${children}</g>`;
  }

  const body = design.rootIds.map((rid) => renderGroup(rid)).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${design.canvas.width}" height="${design.canvas.height}" viewBox="0 0 ${design.canvas.width} ${design.canvas.height}">
${defs.length ? `<defs>\n${defs.join("\n")}\n</defs>` : ""}
${body}
</svg>`;
}
