import type {
  AffineMatrix,
  BlendMode,
  ImageFilters as RendererImageFilters,
  NormalizedContainerNode,
  NormalizedDesignV1,
  NormalizedEffect,
  NormalizedFill,
  NormalizedGradientFill,
  NormalizedImageFill,
  NormalizedNode,
  NormalizedShapeNode,
  NormalizedSolidFill,
  NormalizedStroke,
  NormalizedTextNode,
  NormalizedVectorPath,
  TextRun,
} from "../normalized";
import type {
  Effect,
  FigmaDesignV1,
  FontName,
  ImageFiltersV1,
  Paint,
  PluginTransform,
  SceneNode,
  Stroke,
  TextNodeV1,
  TextRunV1,
  VectorPath,
} from "./schema";
import { rgbaCss } from "../normalize/shared/color";

/**
 * Plugin-image attachment carried alongside the IR. The renderer reads this
 * to render the *original* design's image fills pixel-perfect - without
 * waiting for an admin upload.
 *
 * Attached as `__pluginImages` on the design so the existing IR shape is
 * untouched. Consumers that don't need original-image rendering just ignore
 * the field; the renderer's `previewImageByNodeId` plumbing handles overrides
 * exactly as before.
 */
export interface PluginImageMap {
  /** imageHash → { dataUrl, width, height } */
  byHash: Record<string, { dataUrl: string; width: number; height: number }>;
  /** nodeId → imageHash referenced by that node's first IMAGE fill. */
  byNodeId: Record<string, string>;
}

export interface AdaptedDesign {
  design: NormalizedDesignV1;
  pluginImages: PluginImageMap;
}

/**
 * Convert a `FigmaDesignV1` (output of the FYB Extractor plugin) into the
 * renderer's `NormalizedDesignV1`. Lossless for everything the renderer can
 * use today; richer plugin-only data (full vector network, mixed-run text,
 * effects, etc.) is mapped onto the existing renderer hooks.
 */
export function adaptFigmaDesignV1(input: FigmaDesignV1): AdaptedDesign {
  const warnings: NormalizedDesignV1["warnings"] = [];
  const nodesById: Record<string, NormalizedNode> = {};
  const childrenById: Record<string, string[]> = {};
  const imageHashes = new Set<string>();
  const fontSet = new Set<string>();

  const page = input.pages[0];
  if (!page) {
    return {
      design: emptyDesign(input, warnings),
      pluginImages: { byHash: {}, byNodeId: {} },
    };
  }
  if (input.pages.length > 1) {
    warnings.push({
      code: "multiple_pages",
      message: `${input.pages.length} pages in plugin export - using the first one ("${page.name}").`,
    });
  }

  // Compute the canvas as the union bounding box of all visible top-level
  // children. This matches the legacy normalizer so the editor centers the
  // design correctly.
  const bbox = unionBounds(page.children);
  const offsetX = bbox.minX;
  const offsetY = bbox.minY;
  const width = Math.max(0, bbox.maxX - bbox.minX);
  const height = Math.max(0, bbox.maxY - bbox.minY);

  const ctx: AdaptCtx = { warnings, nodesById, childrenById, imageHashes, fontSet, offsetX, offsetY };

  const rootIds: string[] = [];
  for (const child of page.children) {
    rootIds.push(child.id);
    walk(child, ctx);
  }

  // Emit just the family names - that's what the Google Fonts loader resolves
  // against and what stylesheets reference. Per-text-node `fontStyleName`,
  // `fontWeight`, and `originalFontName` retain the (family, style) pair the
  // editor needs to re-apply the exact face when a user starts editing.
  for (const f of input.globals.fonts) fontSet.add(f.family);

  // Build the plugin-image map. Each ImagePaint references an imageHash; we
  // also walk the tree to collect node→hash bindings for the renderer.
  const pluginImages = buildPluginImageMap(input, page.children);

  // Page background - first SOLID becomes `background.css`.
  const pageBackgrounds = page.backgrounds.map((p) => paintToFill(p, ctx)).filter(Boolean) as NormalizedFill[];
  const firstSolid = pageBackgrounds.find((f): f is NormalizedSolidFill => f.kind === "solid");

  const design: NormalizedDesignV1 = {
    version: 2,
    source: "figma",
    sourceName: input.source.documentName,
    rootIds,
    canvas: {
      width,
      height,
      offsetX,
      offsetY,
      ...(firstSolid ? { background: { css: firstSolid.css } } : {}),
      backgrounds: pageBackgrounds,
    },
    nodesById,
    childrenById,
    stats: countStats(nodesById),
    assets: {
      imageHashes: [...imageHashes],
      fonts: [...fontSet],
    },
    warnings: dedupeWarnings(warnings),
  };

  // Carry plugin-image metadata as a non-typed field on the design so the
  // editor can pick it up via `(design as DesignWithPluginImages).__pluginImages`.
  (design as unknown as { __pluginImages?: PluginImageMap }).__pluginImages = pluginImages;

  return { design, pluginImages };
}

// ───────── Walker ──────────────────────────────────────────────────

interface AdaptCtx {
  warnings: NormalizedDesignV1["warnings"];
  nodesById: Record<string, NormalizedNode>;
  childrenById: Record<string, string[]>;
  imageHashes: Set<string>;
  fontSet: Set<string>;
  offsetX: number;
  offsetY: number;
}

function walk(node: SceneNode, ctx: AdaptCtx): void {
  if (!node) return;

  const base = baseFields(node, ctx);

  switch (node.type) {
    case "FRAME":
    case "COMPONENT":
    case "COMPONENT_SET":
    case "INSTANCE":
    case "SECTION":
    case "GROUP": {
      const fills = (node.fills ?? []).map((p) => paintToFill(p, ctx)).filter(Boolean) as NormalizedFill[];
      const strokes = (node.strokes ?? []).flatMap((s) => strokeToNormalized(s, node, ctx));
      const cornerRadius =
        "topLeftRadius" in node
          ? {
              tl: (node as { topLeftRadius?: number }).topLeftRadius ?? 0,
              tr: (node as { topRightRadius?: number }).topRightRadius ?? 0,
              bl: (node as { bottomLeftRadius?: number }).bottomLeftRadius ?? 0,
              br: (node as { bottomRightRadius?: number }).bottomRightRadius ?? 0,
            }
          : undefined;
      const layoutMode =
        "layoutMode" in node && (node.layoutMode === "HORIZONTAL" || node.layoutMode === "VERTICAL")
          ? node.layoutMode
          : "NONE";
      const containerType: NormalizedContainerNode["containerType"] =
        node.type === "FRAME" || node.type === "INSTANCE" || node.type === "SECTION"
          ? (node.type as NormalizedContainerNode["containerType"])
          : node.type === "COMPONENT" || node.type === "COMPONENT_SET"
            ? "COMPONENT"
            : "GROUP";

      const doc: NormalizedContainerNode = {
        ...base,
        kind: "container",
        containerType,
        clipsContent: "clipsContent" in node ? !!node.clipsContent : false,
        fills,
        strokes,
        ...(cornerRadius ? { cornerRadius } : {}),
        layoutMode,
      };
      ctx.nodesById[node.id] = doc;

      const children = "children" in node ? node.children ?? [] : [];
      ctx.childrenById[node.id] = children.map((c) => c.id);
      for (const child of children) walk(child, ctx);
      break;
    }

    case "RECTANGLE":
    case "ELLIPSE":
    case "LINE":
    case "POLYGON":
    case "STAR":
    case "VECTOR":
    case "BOOLEAN_OPERATION": {
      const fills = (node.fills ?? []).map((p) => paintToFill(p, ctx)).filter(Boolean) as NormalizedFill[];
      const strokes = (node.strokes ?? []).flatMap((s) => strokeToNormalized(s, node, ctx));
      const fillGeometry = vectorPathsToNormalized(getVectorField(node, "fillGeometry"));
      const strokeGeometry = vectorPathsToNormalized(getVectorField(node, "strokeGeometry"));
      // Corner radii: rectangles (and similar) carry per-corner radii;
      // VECTOR nodes carry a single uniform `cornerRadius` number applied
      // to every vertex. Promote the uniform value into the four-corner
      // shape so the renderer (and editor) handle them identically.
      const perCornerNode = node as {
        topLeftRadius?: number;
        topRightRadius?: number;
        bottomLeftRadius?: number;
        bottomRightRadius?: number;
        cornerRadius?: number;
      };
      const hasPerCorner =
        typeof perCornerNode.topLeftRadius === "number" ||
        typeof perCornerNode.topRightRadius === "number" ||
        typeof perCornerNode.bottomLeftRadius === "number" ||
        typeof perCornerNode.bottomRightRadius === "number";
      const uniform =
        typeof perCornerNode.cornerRadius === "number" ? perCornerNode.cornerRadius : undefined;
      const cornerRadius = hasPerCorner
        ? {
            tl: perCornerNode.topLeftRadius ?? uniform ?? 0,
            tr: perCornerNode.topRightRadius ?? uniform ?? 0,
            bl: perCornerNode.bottomLeftRadius ?? uniform ?? 0,
            br: perCornerNode.bottomRightRadius ?? uniform ?? 0,
          }
        : typeof uniform === "number" && uniform > 0
          ? { tl: uniform, tr: uniform, bl: uniform, br: uniform }
          : undefined;

      // Vector regions can each carry their own fill set. The renderer paints
      // `fillGeometry` as one merged path with the node-level fills, so a
      // multi-region vector with diverging region fills will lose those
      // distinctions. Warn so this is visible.
      checkVectorNetworkRegions(node, ctx);

      const doc: NormalizedShapeNode = {
        ...base,
        kind: "shape",
        fills,
        strokes,
        ...(cornerRadius ? { cornerRadius } : {}),
        ...(fillGeometry.length > 0 ? { fillGeometry } : {}),
        ...(strokeGeometry.length > 0 ? { strokeGeometry } : {}),
      };
      ctx.nodesById[node.id] = doc;

      // BOOLEAN_OPERATION carries children - preserve them so masks/selection stay coherent.
      if (node.type === "BOOLEAN_OPERATION" && "children" in node && node.children) {
        ctx.childrenById[node.id] = node.children.map((c) => c.id);
        for (const c of node.children) walk(c, ctx);
      }
      break;
    }

    case "TEXT": {
      const t = node as TextNodeV1;
      // Prefer the uniform font name when every run agrees. When runs disagree
      // (mixed-font text), fall back to the first run's font so an editor can
      // still render the input with a representative typeface - a system-ui
      // fallback would visibly shift the layout the moment a user starts typing.
      const baseFontName =
        (uniformValue(t.fontName) as FontName | undefined) ?? t.runs[0]?.fontName;
      if (baseFontName) ctx.fontSet.add(baseFontName.family);
      for (const r of t.runs) ctx.fontSet.add(r.fontName.family);

      const fills =
        Array.isArray(t.fills) && t.fills.length > 0
          ? (t.fills as Paint[]).map((p) => paintToFill(p, ctx)).filter(Boolean) as NormalizedFill[]
          : t.runs[0]?.fills.map((p) => paintToFill(p, ctx)).filter(Boolean) as NormalizedFill[] | undefined ?? [];

      const runs: TextRun[] = t.runs.map((r) => ({
        start: r.start,
        end: r.end,
        fontFamily: r.fontName.family,
        fontStyleName: r.fontName.style,
        fontWeight: r.fontWeight,
        fontStyle: figmaStyleToCss(r.fontName.style),
        fontSize: r.fontSize,
        letterSpacing: r.letterSpacing,
        lineHeight: r.lineHeight as TextRun["lineHeight"],
        fills: r.fills.map((p) => paintToFill(p, ctx)).filter(Boolean) as NormalizedFill[],
        textDecoration: textDecorationToCss(r.textDecoration),
        textCase: r.textCase,
      }));

      // Outline paths bundle every glyph into a single SVG path with one fill.
      // If the runs disagree on color, the bundled outline can't carry that
      // variation - surface it as a warning so callers know color fidelity is
      // reduced for this node.
      if (t.outlinePaths.length > 0 && runs.length > 1) {
        const fillKeys = new Set(
          runs.map((r) => {
            const f = r.fills?.[0];
            return f?.kind === "solid" ? f.css : "";
          }),
        );
        if (fillKeys.size > 1) {
          ctx.warnings.push({
            code: "text_runs_mixed_color_outlined",
            nodeId: node.id,
            message: `Text "${t.characters.slice(0, 24)}…" has runs with different fill colors; outline-path rendering will use the dominant color only.`,
          });
        }
      }

      const strokes = (node.strokes ?? []).flatMap((s) => strokeToNormalized(s, node, ctx));

      // Prefer the uniform value across all runs; otherwise fall back to the
      // first run's value. The fallback exists so that when a user starts
      // editing a mixed-style text node, the rendered glyphs adopt a real,
      // close-to-original font/size/weight instead of the renderer's hardcoded
      // defaults - which is the difference between "the layout shifts a few
      // pixels" and "the layout breaks visibly". Per-run detail is still
      // preserved on `runs[]` for the original (non-edited) render path.
      const firstRun = t.runs[0];
      const baseLetterSpacing = uniformValue(t.letterSpacing) ?? firstRun?.letterSpacing;
      const baseLineHeight = uniformValue(t.lineHeight) ?? firstRun?.lineHeight;
      const baseFontSize =
        (uniformValue(t.fontSize) as number | undefined) ?? firstRun?.fontSize;
      const baseFontWeight =
        (uniformValue(t.fontWeight) as number | undefined) ?? firstRun?.fontWeight;
      const baseTextCase = uniformValue(t.textCase) ?? firstRun?.textCase;
      const baseTextDecoration = uniformValue(t.textDecoration) ?? firstRun?.textDecoration;

      const baseListSpacing = uniformValue(t.listSpacing) as number | undefined;
      const baseLeadingTrim = uniformValue(t.leadingTrim) as "NONE" | "CAP_HEIGHT" | undefined;

      const doc: NormalizedTextNode = {
        ...base,
        kind: "text",
        strokes,
        text: {
          characters: t.characters,
          outlinePaths: t.outlinePaths.map((p) => p.data),
          ...(baseFontName
            ? {
                fontFamily: baseFontName.family,
                fontStyle: figmaStyleToCss(baseFontName.style),
                fontStyleName: baseFontName.style,
                originalFontName: { family: baseFontName.family, style: baseFontName.style },
              }
            : {}),
          ...(typeof baseFontSize === "number" ? { fontSize: baseFontSize } : {}),
          ...(typeof baseFontWeight === "number" ? { fontWeight: baseFontWeight } : {}),
          ...(baseLetterSpacing ? { letterSpacing: baseLetterSpacing as TextRun["letterSpacing"] } : {}),
          ...(baseLineHeight ? { lineHeight: baseLineHeight as { unit: string; value?: number } } : {}),
          textAlignHorizontal: t.textAlignHorizontal,
          textAlignVertical: t.textAlignVertical,
          ...(typeof baseTextCase === "string" ? { textCase: baseTextCase } : {}),
          ...(typeof baseTextDecoration === "string"
            ? { textDecoration: textDecorationToCss(baseTextDecoration as "NONE" | "UNDERLINE" | "STRIKETHROUGH") }
            : {}),
          paragraphSpacing: typeof t.paragraphSpacing === "number" ? t.paragraphSpacing : 0,
          paragraphIndent: typeof t.paragraphIndent === "number" ? t.paragraphIndent : 0,
          ...(typeof baseListSpacing === "number" ? { listSpacing: baseListSpacing } : {}),
          ...(t.hangingPunctuation ? { hangingPunctuation: true } : {}),
          ...(t.hangingList ? { hangingList: true } : {}),
          ...(baseLeadingTrim && baseLeadingTrim !== "NONE" ? { leadingTrim: baseLeadingTrim } : {}),
          ...(t.textTruncation && t.textTruncation !== "DISABLED" ? { textTruncation: t.textTruncation } : {}),
          ...(typeof t.maxLines === "number" && t.maxLines > 0 ? { maxLines: t.maxLines } : {}),
          autoResize: t.textAutoResize,
          ...(t.hasMissingFont ? { hasMissingFont: true } : {}),
          runs,
        },
        fills,
      };
      ctx.nodesById[node.id] = doc;
      break;
    }

    default: {
      // Anything else (slice, stamp, widget, embed, etc.) gets a stub
      // container so the tree shape stays intact for the renderer.
      const doc: NormalizedContainerNode = {
        ...base,
        kind: "container",
        containerType: "GROUP",
        clipsContent: false,
        fills: [],
        strokes: [],
        layoutMode: "NONE",
      };
      ctx.nodesById[node.id] = doc;
      const children = "children" in node && Array.isArray((node as { children?: SceneNode[] }).children)
        ? ((node as { children?: SceneNode[] }).children ?? [])
        : [];
      if (children.length > 0) {
        ctx.childrenById[node.id] = children.map((c) => c.id);
        for (const c of children) walk(c, ctx);
      }
      break;
    }
  }
}

// ───────── Base fields shared by every node ────────────────────────

function baseFields(node: SceneNode, ctx: AdaptCtx) {
  const transform = pluginTransformToAffine(node.absoluteTransform, ctx.offsetX, ctx.offsetY);
  const relativeTransform = pluginTransformToAffine(node.relativeTransform, 0, 0);

  // Effects: empty arrays are extremely common (plugin emits `effects: []`
  // on every node). Skip the allocation when there's nothing to map.
  const rawEffects = node.effects;
  const effects =
    rawEffects && rawEffects.length > 0
      ? (rawEffects
          .map((e) => effectToNormalized(e, node.id, ctx))
          .filter(Boolean) as NormalizedEffect[])
      : [];

  return {
    id: node.id,
    name: node.name,
    figmaType: node.type,
    visible: node.visible,
    opacity: node.opacity,
    rotation: node.rotation,
    blendMode: mapBlendMode(node.blendMode),
    effects,
    isMask: node.isMask,
    // The plugin emits `maskType: "ALPHA"` on every node regardless of
    // whether `isMask` is true (it's how the API exposes the field). Only
    // forward it when this node is *actually* used as a mask.
    ...(node.isMask && node.maskType && node.maskType !== "OUTLINE"
      ? { maskType: node.maskType as "ALPHA" | "VECTOR" | "LUMINANCE" }
      : {}),
    ...(node.constraints
      ? {
          constraints: {
            horizontal: node.constraints.horizontal as NormalizedTextNode["constraints"] extends infer T
              ? T extends { horizontal: infer H }
                ? H
                : never
              : never,
            vertical: node.constraints.vertical as NormalizedTextNode["constraints"] extends infer T
              ? T extends { vertical: infer V }
                ? V
                : never
              : never,
          },
        }
      : {}),
    transform,
    relativeTransform,
    size: { width: node.width, height: node.height },
    frame: {
      x: (node.absoluteBoundingBox?.x ?? node.x) - ctx.offsetX,
      y: (node.absoluteBoundingBox?.y ?? node.y) - ctx.offsetY,
      width: node.absoluteBoundingBox?.width ?? node.width,
      height: node.absoluteBoundingBox?.height ?? node.height,
    },
  };
}

// ───────── Paints ──────────────────────────────────────────────────

function paintToFill(paint: Paint, ctx: AdaptCtx): NormalizedFill | null {
  if (!paint) return null;

  if (paint.type === "SOLID") {
    const out: NormalizedSolidFill = {
      kind: "solid",
      visible: paint.visible,
      opacity: paint.opacity,
      blendMode: mapBlendMode(paint.blendMode),
      css: paint.css,
    };
    return out;
  }

  if (
    paint.type === "GRADIENT_LINEAR" ||
    paint.type === "GRADIENT_RADIAL" ||
    paint.type === "GRADIENT_ANGULAR" ||
    paint.type === "GRADIENT_DIAMOND"
  ) {
    // Stops carry their own per-stop alpha; the paint's overall opacity acts
    // as a multiplier applied to *every* stop. The legacy REST normalizer
    // does the same - see paints.ts:138. Keeping the math here is what makes
    // a gradient with `opacity: 0.5` actually fade.
    const paintOpacity = typeof paint.opacity === "number" ? paint.opacity : 1;
    // Sort stops by offset - Figma usually emits them in order, but the spec
    // doesn't promise it, and an out-of-order stop would confuse the canvas
    // gradient API.
    const sortedStops = [...paint.gradientStops].sort((a, b) => a.position - b.position);
    const stops = sortedStops.map((s) => ({
      offset: Math.max(0, Math.min(1, s.position)),
      colorCss: rgbaCss({
        r: s.color.r,
        g: s.color.g,
        b: s.color.b,
        a: (typeof s.color.a === "number" ? s.color.a : 1) * paintOpacity,
      }),
    }));
    const handles = handlesFromTransform(paint.gradientTransform, paint.type);
    const out: NormalizedGradientFill = {
      kind: "gradient",
      visible: paint.visible,
      opacity: paint.opacity,
      blendMode: mapBlendMode(paint.blendMode),
      gradientType: gradientKind(paint.type),
      stops,
      handlePositions: handles,
      cssFallback: stops[0]?.colorCss ?? "transparent",
    };
    return out;
  }

  if (paint.type === "IMAGE") {
    const hash = paint.imageHash ?? "";
    if (hash) ctx.imageHashes.add(hash);
    const out: NormalizedImageFill = {
      kind: "image",
      visible: paint.visible,
      opacity: paint.opacity,
      blendMode: mapBlendMode(paint.blendMode),
      imageHash: hash,
      scaleMode: (paint.scaleMode === "TILE" ? "TILE" : paint.scaleMode) as NormalizedImageFill["scaleMode"],
      ...(paint.imageTransform ? { imageTransform: pluginTransformToAffine(paint.imageTransform, 0, 0) } : {}),
      ...(typeof paint.scalingFactor === "number" ? { scalingFactor: paint.scalingFactor } : {}),
      ...(typeof paint.rotation === "number" ? { rotation: paint.rotation } : {}),
      ...(paint.filters ? { filters: filtersToRenderer(paint.filters) } : {}),
      cssFallback: "rgba(0,0,0,0.05)",
    };
    return out;
  }

  return null;
}

function gradientKind(t: string): NormalizedGradientFill["gradientType"] {
  switch (t) {
    case "GRADIENT_LINEAR": return "linear";
    case "GRADIENT_RADIAL": return "radial";
    case "GRADIENT_ANGULAR": return "angular";
    case "GRADIENT_DIAMOND": return "diamond";
    default: return "linear";
  }
}

/**
 * Decompose Figma's gradient transform into the bbox-normalized handle
 * positions the renderer expects.
 *
 * Convention: `gradientTransform` is the affine matrix that maps points from
 * Figma's gradient handle space (a unit square [0..1]²) to the layer's
 * normalized bounding-box space. We multiply the transform by the canonical
 * handle-space points for each gradient kind to recover their bbox positions.
 *
 *   linear  : start (0, 0.5), end (1, 0.5), width-perp (0, 1)
 *   radial  : center (0.5, 0.5), x-edge (1, 0.5), y-edge (0.5, 1)
 *   diamond : center (0.5, 0.5), x-corner (1, 0.5), y-corner (0.5, 1)
 *   angular : center (0.5, 0.5), sweep-start (0.5, 0), sweep-90° (1, 0.5)
 *
 * Matches the renderer defaults in canvasGradient.ts.
 */
function handlesFromTransform(
  t: PluginTransform,
  gradientType: "GRADIENT_LINEAR" | "GRADIENT_RADIAL" | "GRADIENT_ANGULAR" | "GRADIENT_DIAMOND",
): Array<{ x: number; y: number }> {
  const a = t[0][0];
  const c = t[0][1];
  const e = t[0][2];
  const b = t[1][0];
  const d = t[1][1];
  const f = t[1][2];
  const apply = (x: number, y: number) => ({ x: a * x + c * y + e, y: b * x + d * y + f });

  if (gradientType === "GRADIENT_LINEAR") {
    return [apply(0, 0.5), apply(1, 0.5), apply(0, 1)];
  }
  if (gradientType === "GRADIENT_ANGULAR") {
    return [apply(0.5, 0.5), apply(0.5, 0), apply(1, 0.5)];
  }
  // Radial + diamond share the (center, x-edge, y-edge) convention.
  return [apply(0.5, 0.5), apply(1, 0.5), apply(0.5, 1)];
}

function filtersToRenderer(f: ImageFiltersV1): RendererImageFilters {
  return {
    exposure: f.exposure ?? 0,
    contrast: f.contrast ?? 0,
    saturation: f.saturation ?? 0,
    temperature: f.temperature ?? 0,
    tint: f.tint ?? 0,
    highlights: f.highlights ?? 0,
    shadows: f.shadows ?? 0,
  };
}

// ───────── Strokes ─────────────────────────────────────────────────

function strokeToNormalized(s: Stroke, node: SceneNode, ctx: AdaptCtx): NormalizedStroke[] {
  if (!s || s.paints.length === 0) return [];

  // Resolve per-side weights. Plugin emits them on the *node* (strokeTopWeight,
  // …) for the common case, and inside the Stroke as `{ mixed, perSide }` only
  // when a stroke-style id ties weights together. Prefer node-level fields,
  // since those reflect Figma's actual rendering.
  const ns = node as {
    strokeTopWeight?: number;
    strokeRightWeight?: number;
    strokeBottomWeight?: number;
    strokeLeftWeight?: number;
  };
  const havePerSide =
    typeof ns.strokeTopWeight === "number" &&
    typeof ns.strokeRightWeight === "number" &&
    typeof ns.strokeBottomWeight === "number" &&
    typeof ns.strokeLeftWeight === "number";

  let weight: number;
  let individualWeights: NormalizedStroke["individualWeights"];
  if (havePerSide) {
    const t = ns.strokeTopWeight!;
    const r = ns.strokeRightWeight!;
    const b = ns.strokeBottomWeight!;
    const l = ns.strokeLeftWeight!;
    if (t === r && r === b && b === l) {
      weight = t;
    } else {
      weight = Math.max(t, r, b, l);
      individualWeights = { top: t, right: r, bottom: b, left: l };
    }
  } else if (typeof s.weight === "number") {
    weight = s.weight;
  } else {
    const ps = s.weight.perSide;
    individualWeights = { ...ps };
    weight = Math.max(ps.top, ps.right, ps.bottom, ps.left);
  }
  if (weight <= 0) return [];

  const align: NormalizedStroke["align"] = s.align;
  const cap = (typeof s.cap === "string" ? s.cap : "NONE") as NormalizedStroke["cap"];
  const join = (typeof s.join === "string" ? s.join : "MITER") as NormalizedStroke["join"];
  const dashPattern = Array.from(s.dashPattern ?? []);

  // Figma strokes can carry multiple paints (e.g. solid + image overlay).
  // Our renderer expects one stroke per NormalizedStroke entry - fan them out.
  const out: NormalizedStroke[] = [];
  for (const p of s.paints) {
    const paint = paintToFill(p, ctx);
    if (!paint) continue;
    out.push({
      paint,
      weight,
      align,
      cap,
      join,
      miterLimit: s.miterLimit ?? 4,
      dashPattern,
      ...(individualWeights ? { individualWeights } : {}),
      css: paint.kind === "solid" ? paint.css : ((paint as NormalizedGradientFill | NormalizedImageFill).cssFallback ?? "transparent"),
    });
  }
  return out;
}

// ───────── Effects ─────────────────────────────────────────────────

function effectToNormalized(e: Effect, nodeId: string, ctx: AdaptCtx): NormalizedEffect | null {
  if (!e || e.visible === false) return null;
  switch (e.type) {
    case "DROP_SHADOW":
      return {
        kind: "drop-shadow",
        offset: e.offset ?? { x: 0, y: 0 },
        radius: e.radius ?? 0,
        spread: e.spread ?? 0,
        color: e.color ? rgbaCss(e.color) : "rgba(0,0,0,0.25)",
        blendMode: mapBlendMode(e.blendMode),
        visible: true,
        showShadowBehindNode: e.showShadowBehindNode ?? false,
      };
    case "INNER_SHADOW":
      return {
        kind: "inner-shadow",
        offset: e.offset ?? { x: 0, y: 0 },
        radius: e.radius ?? 0,
        spread: e.spread ?? 0,
        color: e.color ? rgbaCss(e.color) : "rgba(0,0,0,0.25)",
        blendMode: mapBlendMode(e.blendMode),
        visible: true,
      };
    case "LAYER_BLUR":
      return { kind: "layer-blur", radius: e.radius ?? 0, visible: true };
    case "BACKGROUND_BLUR":
      return { kind: "background-blur", radius: e.radius ?? 0, visible: true };
    default:
      // Beta effects (NOISE / TEXTURE / GLASS): the renderer can't reproduce
      // them yet, but dropping silently makes diffs hard to debug. Surface a
      // warning so the gap is visible in the design's `warnings` list.
      ctx.warnings.push({
        code: "unsupported_effect",
        nodeId,
        message: `Effect "${e.type}" is not yet rendered; the node will draw without it.`,
      });
      return null;
  }
}

// ───────── Vector geometry ─────────────────────────────────────────

function vectorPathsToNormalized(paths: VectorPath[] | undefined): NormalizedVectorPath[] {
  if (!paths || paths.length === 0) return [];
  return paths.map((p) => ({
    data: p.data,
    windingRule: p.windingRule === "EVENODD" ? "EVENODD" : "NONZERO",
    coordinateSpace: "local",
  }));
}

function getVectorField(node: SceneNode, key: "fillGeometry" | "strokeGeometry"): VectorPath[] | undefined {
  const v = (node as unknown as Record<string, unknown>)[key];
  return Array.isArray(v) ? (v as VectorPath[]) : undefined;
}

interface VectorRegion {
  fills?: Array<{ type?: string; color?: { r: number; g: number; b: number; a?: number } }>;
}

function checkVectorNetworkRegions(node: SceneNode, ctx: AdaptCtx): void {
  const network = (node as unknown as { vectorNetwork?: { regions?: VectorRegion[] } }).vectorNetwork;
  const regions = network?.regions;
  if (!regions || regions.length < 2) return;

  // Build a fingerprint of each region's fill set. If they all match, the
  // node-level fill is faithful and there's nothing to warn about.
  const fingerprints = new Set<string>();
  for (const r of regions) {
    fingerprints.add(JSON.stringify(r.fills ?? []));
    if (fingerprints.size > 1) break;
  }
  if (fingerprints.size > 1) {
    ctx.warnings.push({
      code: "vector_network_mixed_region_fills",
      nodeId: node.id,
      message: `Vector "${node.name}" has ${regions.length} regions with different fills; the merged fillGeometry will draw with the node-level fill only.`,
    });
  }
}

// ───────── Plugin image map ────────────────────────────────────────

function buildPluginImageMap(input: FigmaDesignV1, roots: SceneNode[]): PluginImageMap {
  const byHash: PluginImageMap["byHash"] = {};
  for (const [hash, asset] of Object.entries(input.assets.images)) {
    byHash[hash] = {
      dataUrl: `data:${asset.mime || "image/png"};base64,${asset.base64}`,
      width: asset.width,
      height: asset.height,
    };
  }

  const byNodeId: Record<string, string> = {};
  const visit = (n: SceneNode | undefined): void => {
    if (!n) return;
    const fills = (n as { fills?: Paint[] }).fills;
    if (Array.isArray(fills)) {
      for (const p of fills) {
        if (p && p.type === "IMAGE" && p.imageHash && byHash[p.imageHash]) {
          byNodeId[n.id] = p.imageHash;
          break;
        }
      }
    }
    const children = (n as { children?: SceneNode[] }).children;
    if (Array.isArray(children)) for (const c of children) visit(c);
  };
  for (const r of roots) visit(r);

  return { byHash, byNodeId };
}

// ───────── Helpers ─────────────────────────────────────────────────

/**
 * Map plugin BlendMode → renderer BlendMode. The renderer's enum doesn't
 * include `LINEAR_BURN` or `LINEAR_DODGE`; collapse them onto the closest
 * supported equivalent so downstream code doesn't have to special-case them.
 */
function mapBlendMode(mode: string | undefined): BlendMode {
  switch (mode) {
    case "LINEAR_BURN": return "MULTIPLY";
    case "LINEAR_DODGE": return "SCREEN";
    case "PASS_THROUGH":
    case "NORMAL":
    case "DARKEN":
    case "MULTIPLY":
    case "COLOR_BURN":
    case "LIGHTEN":
    case "SCREEN":
    case "COLOR_DODGE":
    case "OVERLAY":
    case "SOFT_LIGHT":
    case "HARD_LIGHT":
    case "DIFFERENCE":
    case "EXCLUSION":
    case "HUE":
    case "SATURATION":
    case "COLOR":
    case "LUMINOSITY":
      return mode;
    default:
      return "NORMAL";
  }
}

function pluginTransformToAffine(
  t: PluginTransform | undefined,
  offsetX: number,
  offsetY: number,
): AffineMatrix {
  if (!t) return { a: 1, b: 0, c: 0, d: 1, tx: -offsetX, ty: -offsetY };
  // Plugin convention: t = [[a, c, tx],[b, d, ty]]. Renderer's AffineMatrix
  // uses the column-major-friendly layout `{ a, b, c, d, tx, ty }`.
  return {
    a: t[0][0],
    b: t[1][0],
    c: t[0][1],
    d: t[1][1],
    tx: t[0][2] - offsetX,
    ty: t[1][2] - offsetY,
  };
}

function unionBounds(roots: SceneNode[]): { minX: number; minY: number; maxX: number; maxY: number } {
  const acc = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };
  const visit = (n: SceneNode): void => {
    if (!n.visible) return;
    const bb = n.absoluteBoundingBox;
    if (bb) {
      if (bb.x < acc.minX) acc.minX = bb.x;
      if (bb.y < acc.minY) acc.minY = bb.y;
      if (bb.x + bb.width > acc.maxX) acc.maxX = bb.x + bb.width;
      if (bb.y + bb.height > acc.maxY) acc.maxY = bb.y + bb.height;
    }
    // If the node clips its content, don't recurse into children for bounds -
    // rotated descendants overflowing the clip would inflate the canvas.
    if ("clipsContent" in n && n.clipsContent) return;
    const children = (n as { children?: SceneNode[] }).children;
    if (Array.isArray(children)) for (const c of children) visit(c);
  };
  for (const r of roots) visit(r);
  if (!Number.isFinite(acc.minX)) {
    acc.minX = 0;
    acc.minY = 0;
    acc.maxX = 0;
    acc.maxY = 0;
  }
  return acc;
}

function uniformValue<T>(value: T | { __mixed: true }): T | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "object" && value !== null && (value as { __mixed?: true }).__mixed) return undefined;
  return value as T;
}

function figmaStyleToCss(style: string): "normal" | "italic" {
  return /italic/i.test(style) ? "italic" : "normal";
}

function textDecorationToCss(d: "NONE" | "UNDERLINE" | "STRIKETHROUGH"): "none" | "underline" | "line-through" {
  if (d === "UNDERLINE") return "underline";
  if (d === "STRIKETHROUGH") return "line-through";
  return "none";
}

// `rgbaCss` is imported from ../normalize/shared/color. It preserves Figma's
// raw float channels (no integer rounding), which matters for gradient stop
// interpolation accuracy and for matching colors across pipelines.

/**
 * Collapse repeated warnings so a 5000-node design with the same issue on
 * every node doesn't surface 5000 identical entries. The first occurrence
 * keeps its original nodeId; an aggregate suffix ("…and 4,999 more nodes")
 * communicates scope without the noise.
 */
function dedupeWarnings(
  warnings: NormalizedDesignV1["warnings"],
): NormalizedDesignV1["warnings"] {
  if (warnings.length <= 1) return warnings;
  const seen = new Map<string, { entry: NormalizedDesignV1["warnings"][number]; count: number }>();
  for (const w of warnings) {
    const existing = seen.get(w.code);
    if (existing) existing.count += 1;
    else seen.set(w.code, { entry: w, count: 1 });
  }
  const out: NormalizedDesignV1["warnings"] = [];
  for (const { entry, count } of seen.values()) {
    if (count <= 1) {
      out.push(entry);
      continue;
    }
    out.push({
      ...entry,
      message: `${entry.message} (and ${count - 1} more node${count - 1 === 1 ? "" : "s"})`,
    });
  }
  return out;
}

function countStats(nodesById: Record<string, NormalizedNode>): NormalizedDesignV1["stats"] {
  let textCount = 0;
  let imageCount = 0;
  let shapeCount = 0;
  let containerCount = 0;
  for (const node of Object.values(nodesById)) {
    if (node.kind === "text") textCount += 1;
    else if (node.kind === "shape") {
      shapeCount += 1;
      if (node.fills.some((f) => f.kind === "image")) imageCount += 1;
    } else containerCount += 1;
  }
  return {
    nodeCount: Object.keys(nodesById).length,
    textCount,
    imageCount,
    shapeCount,
    containerCount,
  };
}

function emptyDesign(input: FigmaDesignV1, warnings: NormalizedDesignV1["warnings"]): NormalizedDesignV1 {
  return {
    version: 2,
    source: "figma",
    sourceName: input.source.documentName,
    rootIds: [],
    canvas: { width: 0, height: 0, offsetX: 0, offsetY: 0, backgrounds: [] },
    nodesById: {},
    childrenById: {},
    stats: { nodeCount: 0, textCount: 0, imageCount: 0, shapeCount: 0, containerCount: 0 },
    assets: { imageHashes: [], fonts: [] },
    warnings: [...warnings, { code: "empty_document", message: "Plugin export contained no pages." }],
  };
}
