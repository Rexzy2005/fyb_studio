import type { NormalizedDesignV1, NormalizedNode } from "@/lib/figma";
import { computeRenderOrder } from "@/lib/render/engine/order";

export function hitTestNodeId(
  design: NormalizedDesignV1,
  x: number,
  y: number,
): string | null {
  const ordered = computeRenderOrder(design);
  const parentById = buildParentMap(design);

  // top-most first
  for (let i = ordered.length - 1; i >= 0; i--) {
    const id = ordered[i];
    const node = design.nodesById[id] as NormalizedNode | undefined;
    if (!node || !node.visible || node.opacity <= 0) continue;
    if (node.isMask) continue;

    // Keep hit testing aligned with the renderer: transformed nodes are tested
    // in local space, clipped containers clip descendants, and sibling masks
    // clip all following siblings.
    if (pointInNodeBounds(node, x, y) && isVisibleThroughTree(design, parentById, id, x, y)) {
      return id;
    }
  }

  return null;
}

function buildParentMap(design: NormalizedDesignV1): Map<string, string> {
  const out = new Map<string, string>();
  for (const [parentId, childIds] of Object.entries(design.childrenById)) {
    for (const childId of childIds) out.set(childId, parentId);
  }
  return out;
}

function isVisibleThroughTree(
  design: NormalizedDesignV1,
  parentById: Map<string, string>,
  nodeId: string,
  x: number,
  y: number,
): boolean {
  let currentId = nodeId;
  let parentId = parentById.get(currentId);
  while (parentId) {
    const parent = design.nodesById[parentId] as NormalizedNode | undefined;
    if (parent?.kind === "container" && parent.clipsContent && !pointInNodeBounds(parent, x, y)) {
      return false;
    }

    const activeMask = activeMaskBeforeChild(design, parentId, currentId);
    if (activeMask && !pointInNodeBounds(activeMask, x, y)) {
      return false;
    }

    currentId = parentId;
    parentId = parentById.get(currentId);
  }
  return true;
}

function activeMaskBeforeChild(
  design: NormalizedDesignV1,
  parentId: string,
  childId: string,
): NormalizedNode | null {
  let activeMask: NormalizedNode | null = null;
  for (const siblingId of design.childrenById[parentId] ?? []) {
    if (siblingId === childId) return activeMask;
    const sibling = design.nodesById[siblingId] as NormalizedNode | undefined;
    if (sibling?.isMask) activeMask = sibling.kind === "text" ? null : sibling;
  }
  return null;
}

function pointInNodeBounds(node: NormalizedNode, x: number, y: number): boolean {
  const eps = 1e-6;
  const width = node.size?.width ?? node.frame.width;
  const height = node.size?.height ?? node.frame.height;
  if (width <= 0 || height <= 0) return false;

  if (node.transform) {
    const local = invertPoint(node.transform, x, y);
    if (!local) return false;
    return local.x >= -eps && local.y >= -eps && local.x <= width + eps && local.y <= height + eps;
  }

  if (node.rotation && Math.abs(node.rotation) > 0.001) {
    const cx = node.frame.x + node.frame.width / 2;
    const cy = node.frame.y + node.frame.height / 2;
    const rad = (-node.rotation * Math.PI) / 180;
    const dx = x - cx;
    const dy = y - cy;
    const ux = dx * Math.cos(rad) - dy * Math.sin(rad) + cx;
    const uy = dx * Math.sin(rad) + dy * Math.cos(rad) + cy;
    return (
      ux >= node.frame.x - eps &&
      uy >= node.frame.y - eps &&
      ux <= node.frame.x + node.frame.width + eps &&
      uy <= node.frame.y + node.frame.height + eps
    );
  }

  return (
    x >= node.frame.x - eps &&
    y >= node.frame.y - eps &&
    x <= node.frame.x + node.frame.width + eps &&
    y <= node.frame.y + node.frame.height + eps
  );
}

function invertPoint(
  m: NonNullable<NormalizedNode["transform"]>,
  x: number,
  y: number,
): { x: number; y: number } | null {
  const det = m.a * m.d - m.b * m.c;
  if (Math.abs(det) < 1e-8) return null;
  const dx = x - m.tx;
  const dy = y - m.ty;
  return {
    x: (m.d * dx - m.c * dy) / det,
    y: (-m.b * dx + m.a * dy) / det,
  };
}
