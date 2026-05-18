import { describe, expect, it } from "vitest";

import type { NormalizedDesignV1, NormalizedNode } from "@/lib/figma";
import { hitTestNodeId } from "@/lib/render/hitTest";

function shape(
  id: string,
  frame: NormalizedNode["frame"],
  overrides: Partial<Extract<NormalizedNode, { kind: "shape" }>> = {},
): Extract<NormalizedNode, { kind: "shape" }> {
  return {
    id,
    name: id,
    figmaType: "RECTANGLE",
    kind: "shape",
    visible: true,
    opacity: 1,
    rotation: 0,
    blendMode: "NORMAL",
    effects: [],
    isMask: false,
    frame,
    fills: [],
    strokes: [],
    ...overrides,
  };
}

function container(
  id: string,
  frame: NormalizedNode["frame"],
  overrides: Partial<Extract<NormalizedNode, { kind: "container" }>> = {},
): Extract<NormalizedNode, { kind: "container" }> {
  return {
    id,
    name: id,
    figmaType: "FRAME",
    kind: "container",
    containerType: "FRAME",
    visible: true,
    opacity: 1,
    rotation: 0,
    blendMode: "PASS_THROUGH",
    effects: [],
    isMask: false,
    frame,
    clipsContent: false,
    fills: [],
    strokes: [],
    ...overrides,
  };
}

function design(
  nodesById: Record<string, NormalizedNode>,
  childrenById: Record<string, string[]>,
  rootIds = ["root"],
): NormalizedDesignV1 {
  return {
    version: 2,
    source: "figma",
    rootIds,
    canvas: {
      width: 300,
      height: 300,
      offsetX: 0,
      offsetY: 0,
      background: { css: "#fff" },
    },
    nodesById,
    childrenById,
    stats: {
      nodeCount: Object.keys(nodesById).length,
      textCount: 0,
      imageCount: 0,
      shapeCount: 0,
      containerCount: 0,
    },
    assets: { imageHashes: [], fonts: [] },
    warnings: [],
  };
}

describe("hitTestNodeId", () => {
  it("tests transformed nodes in local space instead of their axis-aligned frame", () => {
    const cos = Math.cos(Math.PI / 4);
    const sin = Math.sin(Math.PI / 4);
    const rotated = shape(
      "rotated",
      { x: 85.86, y: 100, width: 84.85, height: 84.85 },
      {
        size: { width: 100, height: 20 },
        transform: { a: cos, b: sin, c: -sin, d: cos, tx: 100, ty: 100 },
      },
    );
    const d = design({ rotated }, {}, ["rotated"]);

    expect(hitTestNodeId(d, 170, 101)).toBeNull();
    expect(hitTestNodeId(d, 120, 120)).toBe("rotated");
  });

  it("honors clipped containers", () => {
    const root = container("root", { x: 0, y: 0, width: 300, height: 300 });
    const clipped = container(
      "clipped",
      { x: 0, y: 0, width: 50, height: 50 },
      { clipsContent: true },
    );
    const child = shape("child", { x: 40, y: 0, width: 80, height: 50 });
    const d = design({ root, clipped, child }, { root: ["clipped"], clipped: ["child"] });

    expect(hitTestNodeId(d, 75, 25)).toBe("root");
    expect(hitTestNodeId(d, 45, 25)).toBe("child");
  });

  it("honors sibling masks for following siblings", () => {
    const root = container("root", { x: 0, y: 0, width: 300, height: 300 });
    const mask = shape(
      "mask",
      { x: 0, y: 0, width: 50, height: 50 },
      { isMask: true },
    );
    const target = shape("target", { x: 0, y: 0, width: 100, height: 50 });
    const d = design({ root, mask, target }, { root: ["mask", "target"] });

    expect(hitTestNodeId(d, 75, 25)).toBe("root");
    expect(hitTestNodeId(d, 25, 25)).toBe("target");
  });
});
