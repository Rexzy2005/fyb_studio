import type { NormalizedNode, NormalizedVectorPath } from "../normalized";
import { parseEffects } from "./effects";
import { getBounds, getCornerRadius } from "./geometry";
import { parseFills } from "./paints";
import { buildVectorPath } from "./shared/coordinateSpace";
import { parseStrokes } from "./strokes";
import { asNumber, asString, isRecord, type AnyRecord } from "./shared/coerce";
import {
  asBlendMode,
  asContainerType,
  asLayoutMode,
  asMaskType,
} from "./shared/enums";
import type { NormalizeCtx } from "./shared/ctx";
import { parseAbsoluteTransform } from "./shared/transform";
import { buildTextNode } from "./text";

const CONTAINER_FIGMA_TYPES = new Set(["FRAME", "GROUP", "COMPONENT", "INSTANCE", "SECTION"]);
const SHAPE_FIGMA_TYPES = new Set([
  "RECTANGLE",
  "ELLIPSE",
  "LINE",
  "VECTOR",
  "POLYGON",
  "STAR",
  "BOOLEAN_OPERATION",
]);

function parseRelativeTransform(node: AnyRecord) {
  const t = Array.isArray(node.relativeTransform)
    ? (node.relativeTransform as unknown[])
    : null;
  if (!t || t.length < 2) return undefined;
  const r0 = Array.isArray(t[0]) ? (t[0] as unknown[]) : null;
  const r1 = Array.isArray(t[1]) ? (t[1] as unknown[]) : null;
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

export function normalizeNode(input: unknown, ctx: NormalizeCtx): NormalizedNode | null {
  if (!isRecord(input)) return null;

  const id = asString(input.id);
  const figmaType = asString(input.type);
  if (!id || !figmaType) return null;

  const bounds = getBounds(input);
  if (!bounds) {
    ctx.warnings.push({
      code: "missing_bounds",
      message: `Node '${id}' is missing absolute bounds; it may not render correctly until bounds are available.`,
      nodeId: id,
    });
  }

  const visible = input.visible !== false;
  const opacity = asNumber(input.opacity, 1);
  const rotation = asNumber(input.rotation, 0);
  const name = asString(input.name);
  const blendMode = asBlendMode(input.blendMode, "PASS_THROUGH");
  const effects = parseEffects(input);
  const isMask = input.isMask === true;
  const maskType = asMaskType(input.maskType);

  const absT = parseAbsoluteTransform(input);
  const transform = absT
    ? {
        a: absT.a,
        b: absT.b,
        c: absT.c,
        d: absT.d,
        tx: absT.tx - ctx.offsetX,
        ty: absT.ty - ctx.offsetY,
      }
    : undefined;
  const relativeTransform = parseRelativeTransform(input);

  const sizeW = asNumber((input as AnyRecord).width, NaN);
  const sizeH = asNumber((input as AnyRecord).height, NaN);
  const size =
    Number.isFinite(sizeW) && Number.isFinite(sizeH)
      ? { width: sizeW, height: sizeH }
      : bounds
        ? { width: bounds.width, height: bounds.height }
        : undefined;

  const frame = {
    x: (bounds?.x ?? 0) - ctx.offsetX,
    y: (bounds?.y ?? 0) - ctx.offsetY,
    width: bounds?.width ?? 0,
    height: bounds?.height ?? 0,
  };

  const fills = parseFills(input, ctx.warnings, ctx.imageHashes);

  // Track image asset references once per design (the warning is raised
  // by the top-level normalizer based on `assets.imageHashes` length, so
  // we don't need to push it per-fill here anymore).

  if (figmaType === "TEXT") {
    return buildTextNode({
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
      fills,
      input,
      ctx,
    });
  }

  const strokes = parseStrokes(input, ctx.warnings, ctx.imageHashes);
  const cornerRadius = getCornerRadius(input);

  if (CONTAINER_FIGMA_TYPES.has(figmaType)) {
    const containerType = asContainerType(figmaType);
    // GROUP never clips its contents in Figma; force this regardless of source.
    const declaredClip = (input as AnyRecord).clipsContent === true;
    const clipsContent = containerType === "GROUP" ? false : declaredClip;
    return {
      id,
      name,
      figmaType,
      kind: "container",
      containerType,
      visible,
      opacity,
      rotation,
      blendMode,
      effects,
      isMask,
      maskType,
      transform,
      relativeTransform,
      size,
      frame,
      clipsContent,
      fills,
      strokes,
      cornerRadius,
      layoutMode: asLayoutMode((input as AnyRecord).layoutMode),
    };
  }

  if (SHAPE_FIGMA_TYPES.has(figmaType)) {
    const fillGeometryRaw = Array.isArray((input as AnyRecord).fillGeometry)
      ? ((input as AnyRecord).fillGeometry as unknown[])
      : [];
    const strokeGeometryRaw = Array.isArray((input as AnyRecord).strokeGeometry)
      ? ((input as AnyRecord).strokeGeometry as unknown[])
      : [];

    const fillGeometry: NormalizedVectorPath[] = [];
    const strokeGeometry: NormalizedVectorPath[] = [];
    const vectorPathsLegacy: string[] = [];

    for (const g of fillGeometryRaw) {
      if (!isRecord(g)) continue;
      const data = asString(g.data);
      if (!data) continue;
      fillGeometry.push(buildVectorPath(data, g.windingRule, input as AnyRecord, frame));
      vectorPathsLegacy.push(data);
    }

    for (const g of strokeGeometryRaw) {
      if (!isRecord(g)) continue;
      const data = asString(g.data);
      if (!data) continue;
      strokeGeometry.push(buildVectorPath(data, g.windingRule, input as AnyRecord, frame));
      // For strict back-compat with the legacy renderer (which tries to draw
      // LINEs from strokeGeometry as fills), keep these in vectorPaths too.
      if (figmaType === "LINE") vectorPathsLegacy.push(data);
    }

    const isVectorLike =
      figmaType === "VECTOR" || figmaType === "LINE" || figmaType === "BOOLEAN_OPERATION";
    const hasPaint = fills.length > 0 || strokes.length > 0;
    if (isVectorLike && hasPaint && vectorPathsLegacy.length === 0) {
      ctx.warnings.push({
        code: "vector_geometry_missing",
        message:
          "A vector layer has fills/strokes but no path geometry (fillGeometry/strokeGeometry missing). Icons may render blank unless the exporter includes vector paths.",
        nodeId: id,
      });
    }

    return {
      id,
      name,
      figmaType,
      kind: "shape",
      visible,
      opacity,
      rotation,
      blendMode,
      effects,
      isMask,
      maskType,
      transform,
      relativeTransform,
      size,
      frame,
      fills,
      strokes,
      cornerRadius,
      vectorPaths: vectorPathsLegacy.length ? vectorPathsLegacy : undefined,
      fillGeometry: fillGeometry.length ? fillGeometry : undefined,
      strokeGeometry: strokeGeometry.length ? strokeGeometry : undefined,
    };
  }

  // Preserve unknown node types as containers so the tree stays intact.
  ctx.warnings.push({
    code: "unknown_node_type",
    message: `Unsupported node type '${figmaType}' preserved as a container placeholder.`,
    nodeId: id,
  });

  return {
    id,
    name,
    figmaType,
    kind: "container",
    containerType: "FRAME",
    visible,
    opacity,
    rotation,
    blendMode,
    effects,
    isMask,
    maskType,
    transform,
    relativeTransform,
    size,
    frame,
    clipsContent: (input as AnyRecord).clipsContent === true,
    fills,
    strokes,
    cornerRadius,
  };
}
