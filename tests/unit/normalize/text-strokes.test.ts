import { describe, expect, it } from "vitest";

import { normalizeFigmaExport } from "@/lib/figma";

function wrapAsExport(child: unknown) {
  return {
    document: {
      type: "DOCUMENT",
      children: [{ type: "PAGE", children: [child] }],
    },
  };
}

describe("text strokes", () => {
  it("captures strokes on TEXT nodes", () => {
    const text = {
      id: "1:1",
      type: "TEXT",
      visible: true,
      width: 200,
      height: 40,
      absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 40 },
      characters: "FYB",
      style: { fontFamily: "Inter", fontSize: 24, fontWeight: 700 },
      strokes: [
        { type: "SOLID", color: { r: 0, g: 0, b: 1, a: 1 } },
      ],
      strokeWeight: 10,
      strokeAlign: "OUTSIDE",
    };
    const out = normalizeFigmaExport(wrapAsExport(text));
    const node = out.nodesById["1:1"];
    expect(node?.kind).toBe("text");
    if (node?.kind !== "text") return;
    expect(node.strokes).toHaveLength(1);
    expect(node.strokes[0]).toMatchObject({
      weight: 10,
      align: "OUTSIDE",
    });
  });

  it("returns empty strokes array when none defined", () => {
    const text = {
      id: "1:1",
      type: "TEXT",
      visible: true,
      width: 100,
      height: 20,
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 20 },
      characters: "plain",
    };
    const out = normalizeFigmaExport(wrapAsExport(text));
    const node = out.nodesById["1:1"];
    if (node?.kind !== "text") throw new Error("expected text node");
    expect(node.strokes).toEqual([]);
  });
});
