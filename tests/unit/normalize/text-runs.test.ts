import { describe, expect, it } from "vitest";

import { normalizeFigmaExport } from "@/lib/figma";

function wrapAsExport(child: unknown) {
  return {
    document: {
      type: "DOCUMENT",
      children: [
        {
          type: "PAGE",
          children: [child],
        },
      ],
    },
  };
}

describe("text mixed-style runs", () => {
  it("compresses adjacent identical override ids into a single run", () => {
    const text = {
      id: "1:1",
      type: "TEXT",
      name: "t",
      visible: true,
      width: 200,
      height: 40,
      absoluteBoundingBox: { x: 0, y: 0, width: 200, height: 40 },
      characters: "Hello world",
      style: { fontFamily: "Inter", fontSize: 24, fontWeight: 400 },
      // First 5 chars use override "1" (bold), rest are default (0).
      characterStyleOverrides: [1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0],
      styleOverrideTable: {
        "1": { fontWeight: 700 },
      },
    };
    const out = normalizeFigmaExport(wrapAsExport(text));
    const node = out.nodesById["1:1"];
    expect(node?.kind).toBe("text");
    if (node?.kind !== "text") return;
    expect(node.text.runs).toBeDefined();
    expect(node.text.runs).toHaveLength(1);
    expect(node.text.runs![0]).toMatchObject({ start: 0, end: 5, fontWeight: 700 });
  });

  it("returns no runs when all characters use default style (id 0)", () => {
    const text = {
      id: "1:1",
      type: "TEXT",
      visible: true,
      width: 100,
      height: 20,
      absoluteBoundingBox: { x: 0, y: 0, width: 100, height: 20 },
      characters: "plain",
      characterStyleOverrides: [0, 0, 0, 0, 0],
      styleOverrideTable: {},
    };
    const out = normalizeFigmaExport(wrapAsExport(text));
    const node = out.nodesById["1:1"];
    if (node?.kind !== "text") throw new Error("expected text node");
    expect(node.text.runs).toBeUndefined();
  });
});
