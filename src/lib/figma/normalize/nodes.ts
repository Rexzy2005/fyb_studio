import type { NormalizedNode } from "../normalized";
import { getBounds, getCornerRadius } from "./geometry";
import { parseFills } from "./paints";
import { parseStrokes } from "./strokes";
import { asNumber, asString, isRecord, type AnyRecord } from "./shared/coerce";
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

  if (figmaType === "TEXT") {
    return buildTextNode({
      id,
      name,
      figmaType,
      visible,
      opacity,
      rotation,
      transform,
      size,
      frame,
      fills,
      input,
      ctx,
    });
  }

  const strokes = parseStrokes(input);
  const cornerRadius = getCornerRadius(input);

  if (CONTAINER_FIGMA_TYPES.has(figmaType)) {
    return {
      id,
      name,
      figmaType,
      kind: "container",
      visible,
      opacity,
      rotation,
      transform,
      size,
      frame,
      clipsContent: (input as AnyRecord).clipsContent === true,
      fills,
      strokes,
      cornerRadius,
    };
  }

  if (SHAPE_FIGMA_TYPES.has(figmaType)) {
    const fillGeometry = Array.isArray((input as AnyRecord).fillGeometry)
      ? ((input as AnyRecord).fillGeometry as unknown[])
      : [];

    const strokeGeometry = Array.isArray((input as AnyRecord).strokeGeometry)
      ? ((input as AnyRecord).strokeGeometry as unknown[])
      : [];

    const vectorPaths: string[] = [];
    for (const g of fillGeometry) {
      if (!isRecord(g)) continue;
      const data = asString(g.data);
      if (data) vectorPaths.push(data);
    }

    // Many exports store LINE geometry under strokeGeometry only.
    for (const g of strokeGeometry) {
      if (!isRecord(g)) continue;
      const data = asString(g.data);
      if (data) vectorPaths.push(data);
    }

    // If a vector-like node has fills/strokes but no geometry, it will render as "missing icon".
    // Typical of legacy exporters that omit SVG/path data.
    const isVectorLike =
      figmaType === "VECTOR" || figmaType === "LINE" || figmaType === "BOOLEAN_OPERATION";
    const hasPaint = fills.length > 0 || strokes.length > 0;
    if (isVectorLike && hasPaint && vectorPaths.length === 0) {
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
      transform,
      size,
      frame,
      fills,
      strokes,
      cornerRadius,
      vectorPaths: vectorPaths.length ? vectorPaths : undefined,
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
    visible,
    opacity,
    rotation,
    transform,
    size,
    frame,
    clipsContent: (input as AnyRecord).clipsContent === true,
    fills,
    strokes,
    cornerRadius,
  };
}
