import type { NormalizedDesignV1, NormalizedNode } from "@/lib/figma";

export type RenderModel = {
  design: NormalizedDesignV1;
  orderedNodeIds: string[];
  nodesById: Record<string, NormalizedNode>;
};

// Re-export from the canonical engine location so the editor never drifts
// from the renderer's idea of node order.
export { computeRenderOrder } from "@/lib/render/engine/order";
