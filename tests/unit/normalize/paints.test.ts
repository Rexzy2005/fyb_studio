import { describe, expect, it } from "vitest";

import { parseFills } from "@/lib/figma/normalize/paints";

describe("parseFills", () => {
  it("normalizes a SOLID paint with default visible/opacity/blendMode", () => {
    const fills = parseFills(
      { fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0, a: 1 } }] },
      [],
      new Set<string>(),
    );
    expect(fills).toHaveLength(1);
    expect(fills[0]).toMatchObject({
      kind: "solid",
      visible: true,
      opacity: 1,
      blendMode: "NORMAL",
    });
  });

  it("honors per-fill opacity by baking into the solid CSS", () => {
    const fills = parseFills(
      { fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 0, a: 1 }, opacity: 0.5 }] },
      [],
      new Set<string>(),
    );
    expect(fills[0]).toMatchObject({ kind: "solid", opacity: 0.5 });
    expect((fills[0] as { css: string }).css).toContain("0.5");
  });

  it("honors per-fill visible flag", () => {
    const fills = parseFills(
      { fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 0 }, visible: false }] },
      [],
      new Set<string>(),
    );
    expect(fills[0].visible).toBe(false);
  });

  it("captures GRADIENT_LINEAR with stops, handles, blendMode", () => {
    const fills = parseFills(
      {
        fills: [
          {
            type: "GRADIENT_LINEAR",
            blendMode: "MULTIPLY",
            gradientStops: [
              { position: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
              { position: 1, color: { r: 0, g: 0, b: 1, a: 1 } },
            ],
            gradientHandlePositions: [
              { x: 0, y: 0 },
              { x: 1, y: 0 },
            ],
          },
        ],
      },
      [],
      new Set<string>(),
    );
    expect(fills[0]).toMatchObject({
      kind: "gradient",
      gradientType: "linear",
      blendMode: "MULTIPLY",
    });
    expect((fills[0] as { stops: unknown[] }).stops).toHaveLength(2);
    expect((fills[0] as { handlePositions: unknown[] }).handlePositions).toHaveLength(2);
  });

  it("captures IMAGE paint with scaleMode + filters", () => {
    const hashes = new Set<string>();
    const fills = parseFills(
      {
        fills: [
          {
            type: "IMAGE",
            imageHash: "abc123",
            scaleMode: "FIT",
            filters: { exposure: 0.5, contrast: 0, saturation: 0, temperature: 0, tint: 0, highlights: 0, shadows: 0 },
          },
        ],
      },
      [],
      hashes,
    );
    expect(fills[0]).toMatchObject({
      kind: "image",
      imageHash: "abc123",
      scaleMode: "FIT",
    });
    expect((fills[0] as { filters?: { exposure: number } }).filters?.exposure).toBe(0.5);
    expect(hashes.has("abc123")).toBe(true);
  });

  it("supports all 4 gradient types", () => {
    const types = [
      ["GRADIENT_LINEAR", "linear"],
      ["GRADIENT_RADIAL", "radial"],
      ["GRADIENT_ANGULAR", "angular"],
      ["GRADIENT_DIAMOND", "diamond"],
    ] as const;
    for (const [src, kind] of types) {
      const fills = parseFills(
        { fills: [{ type: src, gradientStops: [{ position: 0, color: { r: 0, g: 0, b: 0, a: 1 } }] }] },
        [],
        new Set<string>(),
      );
      expect((fills[0] as { gradientType: string }).gradientType).toBe(kind);
    }
  });
});
