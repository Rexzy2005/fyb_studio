import type { NormalizedDesignV1, NormalizedNode } from "@/lib/figma";

export function hitTestNodeId(
  design: NormalizedDesignV1,
  x: number,
  y: number,
): string | null {
  const ordered = computeRenderOrder(design);

  // top-most first
  for (let i = ordered.length - 1; i >= 0; i--) {
    const id = ordered[i];
    const node = design.nodesById[id] as NormalizedNode | undefined;
    if (!node || !node.visible || node.opacity <= 0) continue;

    // Prefer selecting text or image-bearing nodes, but allow any visible node.
    if (
      x >= node.frame.x &&
      y >= node.frame.y &&
      x <= node.frame.x + node.frame.width &&
      y <= node.frame.y + node.frame.height
    ) {
      return id;
    }
  }

  return null;
}

function computeRenderOrder(design: NormalizedDesignV1): string[] {
  const order: string[] = [];
  function walk(id: string) {
    order.push(id);
    const children = design.childrenById[id] ?? [];
    for (const childId of children) walk(childId);
  }
  for (const rootId of design.rootIds) walk(rootId);
  return order;
}
