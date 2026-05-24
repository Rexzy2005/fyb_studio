import { describe, expect, it } from "vitest";

import type {
  NormalizedContainerNode,
  NormalizedDesignV1,
  NormalizedFill,
  NormalizedNode,
  NormalizedShapeNode,
  NormalizedTextNode,
} from "@/lib/figma";
import { renderTree } from "@/lib/render/engine/renderTree";
import type { ClipGeometry, RenderBackend } from "@/lib/render/engine/types";

function shape(id: string, overrides: Partial<NormalizedShapeNode> = {}): NormalizedShapeNode {
  return {
    id,
    figmaType: "RECTANGLE",
    kind: "shape",
    visible: true,
    opacity: 1,
    rotation: 0,
    blendMode: "NORMAL",
    effects: [],
    isMask: false,
    frame: { x: 0, y: 0, width: 10, height: 10 },
    fills: [],
    strokes: [],
    ...overrides,
  };
}

function container(id: string, overrides: Partial<NormalizedContainerNode> = {}): NormalizedContainerNode {
  return {
    id,
    figmaType: "FRAME",
    kind: "container",
    containerType: "FRAME",
    visible: true,
    opacity: 1,
    rotation: 0,
    blendMode: "PASS_THROUGH",
    effects: [],
    isMask: false,
    frame: { x: 0, y: 0, width: 100, height: 100 },
    clipsContent: false,
    fills: [],
    strokes: [],
    ...overrides,
  };
}

function design(nodesById: Record<string, NormalizedNode>): NormalizedDesignV1 {
  return {
    version: 2,
    source: "figma",
    rootIds: ["root"],
    canvas: { width: 100, height: 100, offsetX: 0, offsetY: 0 },
    nodesById,
    childrenById: { root: ["child"] },
    stats: { nodeCount: 2, textCount: 0, imageCount: 0, shapeCount: 1, containerCount: 1 },
    assets: { imageHashes: [], fonts: [] },
    warnings: [],
  };
}

class AlphaBackend implements RenderBackend {
  readonly alphas: number[] = [];

  pushAlpha(alpha: number): void {
    this.alphas.push(alpha);
  }
  popAlpha(): void {}
  pushBlendMode(): void {}
  popBlendMode(): void {}
  pushTransform(): void {}
  popTransform(): void {}
  pushClip(_geometry: ClipGeometry): void {}
  popClip(): void {}
  pushEffects(): void {}
  popEffects(): void {}
  async drawShape(_node: NormalizedShapeNode): Promise<void> {}
  async drawContainer(_node: NormalizedContainerNode): Promise<void> {}
  async drawText(_node: NormalizedTextNode): Promise<void> {}
  drawCanvasBackground(_backgrounds: NormalizedFill[] | undefined): void {}
}

describe("renderTree opacity", () => {
  it("passes exact inherited opacity to non-text elements", async () => {
    const backend = new AlphaBackend();

    await renderTree(
      design({
        root: container("root", { opacity: 0.5 }),
        child: shape("child", { opacity: 0.375 }),
      }),
      backend,
      { skipText: true },
    );

    expect(backend.alphas).toEqual([0.5, 0.1875]);
  });
});
