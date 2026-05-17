import { describe, expect, it } from "vitest";

import { parseFills } from "@/lib/figma/normalize/paints";

describe("gradient normalization - all four kinds", () => {
  it("captures GRADIENT_ANGULAR with multiple stops and no handles", () => {
    // Mirrors the shape found in fyb_3.json - handles omitted, only stops + position.
    const out = parseFills(
      {
        fills: [
          {
            type: "GRADIENT_ANGULAR",
            gradientStops: [
              { position: 0.065, color: { r: 0, g: 0.13, b: 0.42, a: 1 } },
              { position: 0.5, color: { r: 0, g: 0.25, b: 0.78, a: 1 } },
              { position: 0.85, color: { r: 0, g: 0.21, b: 0.65, a: 1 } },
            ],
          },
        ],
      },
      [],
      new Set(),
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      kind: "gradient",
      gradientType: "angular",
    });
    if (out[0].kind !== "gradient") return;
    expect(out[0].stops).toHaveLength(3);
    expect(out[0].handlePositions).toBeUndefined();
  });

  it("captures GRADIENT_DIAMOND", () => {
    const out = parseFills(
      {
        fills: [
          {
            type: "GRADIENT_DIAMOND",
            gradientStops: [
              { position: 0, color: { r: 0, g: 0.25, b: 0.78, a: 1 } },
              { position: 1, color: { r: 0, g: 0.12, b: 0.38, a: 1 } },
            ],
          },
        ],
      },
      [],
      new Set(),
    );
    expect(out[0]).toMatchObject({ kind: "gradient", gradientType: "diamond" });
  });
});
