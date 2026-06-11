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

function design(nodesById: Record<string, NormalizedNode>, childrenById: Record<string, string[]>): NormalizedDesignV1 {
  return {
    version: 2,
    source: "figma",
    rootIds: ["root"],
    canvas: { width: 100, height: 100, offsetX: 0, offsetY: 0 },
    nodesById,
    childrenById,
    stats: { nodeCount: Object.keys(nodesById).length, textCount: 0, imageCount: 0, shapeCount: 1, containerCount: 1 },
    assets: { imageHashes: [], fonts: [] },
    warnings: [],
  };
}

class AbortBackend implements RenderBackend {
  readonly events: string[] = [];
  controller?: AbortController;
  abortOnNodeId: string | null = null;

  pushAlpha(alpha: number): void {
    this.events.push(`pushAlpha:${alpha}`);
  }
  popAlpha(): void {
    this.events.push("popAlpha");
  }
  pushBlendMode(): void {
    this.events.push("pushBlendMode");
  }
  popBlendMode(): void {
    this.events.push("popBlendMode");
  }
  pushTransform(): void {}
  popTransform(): void {}
  pushClip(_geometry: ClipGeometry): void {
    this.events.push("pushClip");
  }
  popClip(): void {
    this.events.push("popClip");
  }
  pushEffects(): void {
    this.events.push("pushEffects");
  }
  popEffects(): void {
    this.events.push("popEffects");
  }
  async drawShape(node: NormalizedShapeNode): Promise<void> {
    this.events.push(`drawShape:${node.id}`);
    if (node.id === this.abortOnNodeId) this.controller?.abort();
  }
  async drawContainer(node: NormalizedContainerNode): Promise<void> {
    this.events.push(`drawContainer:${node.id}`);
    if (node.id === this.abortOnNodeId) this.controller?.abort();
  }
  async drawText(_node: NormalizedTextNode): Promise<void> {}
  drawCanvasBackground(_backgrounds: NormalizedFill[] | undefined): void {
    this.events.push("drawCanvasBackground");
  }
}

describe("renderTree abort handling", () => {
  it("unwinds alpha, blend, clip and effects when a render is aborted after draw", async () => {
    const controller = new AbortController();
    const backend = new AbortBackend();
    backend.controller = controller;
    backend.abortOnNodeId = "root";

    await expect(
      renderTree(
        design(
          {
            root: container("root", {
              clipsContent: true,
              opacity: 0.5,
              blendMode: "MULTIPLY",
              effects: [{ kind: "layer-blur", radius: 8, visible: true }],
            }),
            child: shape("child"),
          },
          { root: ["child"] },
        ),
        backend,
        { abortSignal: controller.signal, skipText: true },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(backend.events).toEqual([
      "drawCanvasBackground",
      "pushAlpha:0.5",
      "pushBlendMode",
      "pushClip",
      "pushEffects",
      "drawContainer:root",
      "popEffects",
      "popClip",
      "popBlendMode",
      "popAlpha",
    ]);
  });

  it("unwinds an active sibling mask clip when aborting between masked children", async () => {
    const controller = new AbortController();
    const backend = new AbortBackend();
    backend.controller = controller;
    backend.abortOnNodeId = "child";

    await expect(
      renderTree(
        design(
          {
            root: container("root"),
            mask: shape("mask", { isMask: true }),
            child: shape("child"),
          },
          { root: ["mask", "child"] },
        ),
        backend,
        { abortSignal: controller.signal, skipText: true },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(backend.events).toEqual([
      "drawCanvasBackground",
      "pushAlpha:1",
      "drawContainer:root",
      "pushClip",
      "pushAlpha:1",
      "pushBlendMode",
      "drawShape:child",
      "popBlendMode",
      "popAlpha",
      "popClip",
      "popAlpha",
    ]);
  });
});
