import type { NormalizedDesignV1, NormalizedNode } from "@/lib/figma";

export type RenderModel = {
  design: NormalizedDesignV1;
  orderedNodeIds: string[];
  nodesById: Record<string, NormalizedNode>;
};

export function computeRenderOrder(design: NormalizedDesignV1): string[] {
  const order: string[] = [];

  function walk(id: string) {
    order.push(id);
    const children = design.childrenById[id] ?? [];
    for (const childId of children) walk(childId);
  }

  for (const rootId of design.rootIds) walk(rootId);

  return order;
}
