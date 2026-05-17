import { describe, expect, it } from "vitest";

import { parseFills } from "@/lib/figma/normalize/paints";

describe("image fill - imageTransform parsing", () => {
  it("captures the 2x3 affine matrix from a Figma export", () => {
    // From elegant.json's User_picture node - a custom horizontal crop on a
    // FILL-mode image. The renderer must honor this matrix even though the
    // declared scaleMode is FILL (Figma stores user crop adjustments here).
    const out = parseFills(
      {
        fills: [
          {
            type: "IMAGE",
            imageHash: "abc",
            scaleMode: "FILL",
            imageTransform: [
              [0.7514231204986572, 0, 0.12428842484951019],
              [0, 1, 0],
            ],
          },
        ],
      },
      [],
      new Set(),
    );
    expect(out).toHaveLength(1);
    if (out[0].kind !== "image") throw new Error("expected image fill");
    expect(out[0].imageTransform).toEqual({
      a: 0.7514231204986572,
      b: 0,
      c: 0,
      d: 1,
      tx: 0.12428842484951019,
      ty: 0,
    });
    expect(out[0].scaleMode).toBe("FILL");
  });

  it("identity matrix is normalized but kept (renderer ignores it)", () => {
    const out = parseFills(
      {
        fills: [
          {
            type: "IMAGE",
            imageHash: "abc",
            scaleMode: "FILL",
            imageTransform: [
              [1, 0, 0],
              [0, 1, 0],
            ],
          },
        ],
      },
      [],
      new Set(),
    );
    if (out[0].kind !== "image") throw new Error("expected image fill");
    expect(out[0].imageTransform).toEqual({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });
  });
});
