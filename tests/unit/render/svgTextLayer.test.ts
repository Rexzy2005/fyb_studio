import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NormalizedDesignV1, NormalizedTextNode } from "@/lib/figma";
import { buildTextSvg } from "@/lib/render/engine/svgTextLayer";
import type { FieldConfig } from "@/lib/storage/types";

function textNode(overrides: Partial<NormalizedTextNode> = {}): NormalizedTextNode {
  return {
    id: "text-1",
    name: "Name",
    figmaType: "TEXT",
    kind: "text",
    visible: true,
    opacity: 1,
    rotation: 0,
    blendMode: "NORMAL",
    effects: [],
    isMask: false,
    frame: { x: 10, y: 20, width: 200, height: 30 },
    size: { width: 200, height: 30 },
    transform: { a: 1, b: 0, c: 0, d: 1, tx: 10, ty: 20 },
    fills: [
      {
        kind: "solid",
        visible: true,
        opacity: 1,
        blendMode: "NORMAL",
        css: "rgba(10, 20, 30, 1)",
      },
    ],
    strokes: [],
    text: {
      characters: "Original",
      fontSize: 20,
      fontWeight: 700,
      fontFamily: "Inter",
      fontStyle: "normal",
      lineHeight: { unit: "AUTO" },
      letterSpacing: { unit: "PIXELS", value: 0 },
      textAlignHorizontal: "LEFT",
      textAlignVertical: "TOP",
      textDecoration: "none",
      outlinePaths: ["M1 5 L80 5 L80 20 L1 20 Z"],
    },
    ...overrides,
  };
}

function design(node: NormalizedTextNode): NormalizedDesignV1 {
  return {
    version: 2,
    source: "figma",
    rootIds: [node.id],
    canvas: { width: 300, height: 120, offsetX: 0, offsetY: 0 },
    nodesById: { [node.id]: node },
    childrenById: {},
    stats: { nodeCount: 1, textCount: 1, imageCount: 0, shapeCount: 0, containerCount: 0 },
    assets: { imageHashes: [], fonts: ["Inter"] },
    warnings: [],
  };
}

const fieldConfig: FieldConfig = {
  version: 1,
  fields: [
    {
      id: "field-1",
      nodeId: "text-1",
      kind: "text",
      label: "Name",
      editable: true,
    },
  ],
};

describe("buildTextSvg edited text", () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      font: "",
      measureText: (text: string) => ({
        width: text.length * 8,
        actualBoundingBoxLeft: 0,
        actualBoundingBoxRight: text.length * 8,
        actualBoundingBoxAscent: 15,
        actualBoundingBoxDescent: 0,
      }),
    } as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps edited text on the original outline position and transform", () => {
    const svg = buildTextSvg({
      design: design(textNode()),
      fieldConfig,
      previewTextByNodeId: { "text-1": "Edited" },
      includeGuides: false,
    });

    expect(svg).toContain('transform="matrix(1 0 0 1 10 20)"');
    expect(svg).toContain('clip-path="url(#clip-text-local-text-1)"');
    expect(svg).toContain('x="1" y="20"');
    expect(svg).toContain('fill="rgba(10, 20, 30, 1)"');
    expect(svg).toContain('font-size="20"');
    expect(svg).toContain('font-weight="700"');
    expect(svg).toContain('font-family:&quot;Inter&quot;');
    expect(svg).not.toContain('dominant-baseline="text-before-edge"');
  });

  it("uses SVG path-aware outline bounds when configured text has H/V path commands", () => {
    const svg = buildTextSvg({
      design: design(
        textNode({
          text: {
            ...textNode().text,
            outlinePaths: ["M1 5 H80 H90 V20 H1 V5 Z"],
          },
        }),
      ),
      fieldConfig,
      previewTextByNodeId: { "text-1": "Edited" },
      includeGuides: false,
    });

    expect(svg).toContain('x="1" y="20"');
    expect(svg).not.toContain('y="90"');
  });

  it("keeps the original font size exactly when configured text already fits", () => {
    const svg = buildTextSvg({
      design: design(textNode()),
      fieldConfig: {
        version: 1,
        fields: [
          {
            id: "field-1",
            nodeId: "text-1",
            kind: "text",
            label: "Name",
            editable: true,
            textBehavior: {
              autoScale: true,
              minFontSize: 8,
              overflow: "shrink",
            },
          },
        ],
      },
      previewTextByNodeId: { "text-1": "Edited" },
      includeGuides: false,
    });

    expect(svg).toContain('font-size="20"');
    expect(svg).not.toContain('font-size="19.');
  });
});
