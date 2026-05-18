import { describe, expect, it } from "vitest";

import type {
  NormalizedContainerNode,
  NormalizedDesignV1,
  NormalizedNode,
  NormalizedShapeNode,
  NormalizedTextNode,
} from "@/lib/figma";
import { renderTree } from "@/lib/render/engine/renderTree";
import type { RenderBackend } from "@/lib/render/engine/types";

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

function text(id: string, overrides: Partial<NormalizedTextNode> = {}): NormalizedTextNode {
  return {
    id,
    figmaType: "TEXT",
    kind: "text",
    visible: true,
    opacity: 1,
    rotation: 0,
    blendMode: "NORMAL",
    effects: [],
    isMask: false,
    frame: { x: 0, y: 0, width: 10, height: 10 },
    fills: [],
    strokes: [],
    text: {
      characters: "Mask",
      textDecoration: "none",
    },
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
    childrenById: { root: ["textMask", "target"] },
    stats: { nodeCount: 3, textCount: 1, imageCount: 0, shapeCount: 1, containerCount: 1 },
    assets: { imageHashes: [], fonts: [] },
    warnings: [],
  };
}

class CountingBackend implements RenderBackend {
  clipDepth = 0;
  minClipDepth = 0;
  drawn: string[] = [];

  pushAlpha(): void {}
  popAlpha(): void {}
  pushBlendMode(): void {}
  popBlendMode(): void {}
  pushTransform(): void {}
  popTransform(): void {}
  pushClip(): void {
    this.clipDepth += 1;
  }
  popClip(): void {
    this.clipDepth -= 1;
    this.minClipDepth = Math.min(this.minClipDepth, this.clipDepth);
  }
  pushEffects(): void {}
  popEffects(): void {}
  async drawShape(node: NormalizedShapeNode): Promise<void> {
    this.drawn.push(node.id);
  }
  async drawContainer(node: NormalizedContainerNode): Promise<void> {
    this.drawn.push(node.id);
  }
  async drawText(node: NormalizedTextNode): Promise<void> {
    this.drawn.push(node.id);
  }
  drawCanvasBackground(): void {}
}

describe("renderTree sibling masks", () => {
  it("does not pop a clip for unsupported text masks", async () => {
    const backend = new CountingBackend();

    await renderTree(
      design({
        root: container("root"),
        textMask: text("textMask", { isMask: true }),
        target: shape("target"),
      }),
      backend,
      { skipText: true },
    );

    expect(backend.minClipDepth).toBe(0);
    expect(backend.clipDepth).toBe(0);
    expect(backend.drawn).toEqual(["root", "target"]);
  });
});
