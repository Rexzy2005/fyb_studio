import { describe, expect, it } from "vitest";

import { parseStrokes } from "@/lib/figma/normalize/strokes";

describe("parseStrokes", () => {
  it("returns [] when node has no strokes", () => {
    expect(parseStrokes({}, [], new Set())).toEqual([]);
    expect(parseStrokes({ strokes: [] }, [], new Set())).toEqual([]);
  });

  it("parses a SOLID stroke with weight + alignment + cap + join", () => {
    const out = parseStrokes(
      {
        strokes: [{ type: "SOLID", color: { r: 0, g: 0, b: 0, a: 1 } }],
        strokeWeight: 4,
        strokeAlign: "INSIDE",
        strokeCap: "ROUND",
        strokeJoin: "BEVEL",
      },
      [],
      new Set(),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      weight: 4,
      align: "INSIDE",
      cap: "ROUND",
      join: "BEVEL",
    });
  });

  it("captures dashPattern", () => {
    const out = parseStrokes(
      {
        strokes: [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }],
        strokeWeight: 1,
        dashPattern: [4, 2],
      },
      [],
      new Set(),
    );
    expect(out[0].dashPattern).toEqual([4, 2]);
  });

  it("captures individualStrokeWeights", () => {
    const out = parseStrokes(
      {
        strokes: [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }],
        strokeWeight: 1,
        individualStrokeWeights: { top: 2, right: 4, bottom: 6, left: 8 },
      },
      [],
      new Set(),
    );
    expect(out[0].individualWeights).toEqual({ top: 2, right: 4, bottom: 6, left: 8 });
  });

  it("defaults align to CENTER and cap/join to NONE/MITER", () => {
    const out = parseStrokes(
      {
        strokes: [{ type: "SOLID", color: { r: 0, g: 0, b: 0 } }],
        strokeWeight: 1,
      },
      [],
      new Set(),
    );
    expect(out[0]).toMatchObject({ align: "CENTER", cap: "NONE", join: "MITER" });
  });
});
