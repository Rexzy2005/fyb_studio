import { describe, expect, it } from "vitest";

import { parseEffects } from "@/lib/figma/normalize/effects";

describe("parseEffects", () => {
  it("returns empty array when node has no effects", () => {
    expect(parseEffects({})).toEqual([]);
    expect(parseEffects({ effects: [] })).toEqual([]);
  });

  it("parses DROP_SHADOW with offset/radius/spread/color", () => {
    const out = parseEffects({
      effects: [
        {
          type: "DROP_SHADOW",
          color: { r: 0, g: 0, b: 0, a: 0.5 },
          offset: { x: 4, y: 8 },
          radius: 12,
          spread: 2,
          blendMode: "MULTIPLY",
          showShadowBehindNode: true,
        },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      kind: "drop-shadow",
      offset: { x: 4, y: 8 },
      radius: 12,
      spread: 2,
      blendMode: "MULTIPLY",
      showShadowBehindNode: true,
      visible: true,
    });
  });

  it("parses INNER_SHADOW", () => {
    const out = parseEffects({
      effects: [{ type: "INNER_SHADOW", color: { r: 0, g: 0, b: 0 }, offset: { x: 0, y: 0 }, radius: 5 }],
    });
    expect(out[0].kind).toBe("inner-shadow");
  });

  it("parses LAYER_BLUR and BACKGROUND_BLUR", () => {
    const out = parseEffects({
      effects: [
        { type: "LAYER_BLUR", radius: 8 },
        { type: "BACKGROUND_BLUR", radius: 4, visible: false },
      ],
    });
    expect(out[0]).toEqual({ kind: "layer-blur", radius: 8, visible: true });
    expect(out[1]).toEqual({ kind: "background-blur", radius: 4, visible: false });
  });

  it("ignores unknown effect types", () => {
    expect(parseEffects({ effects: [{ type: "WEIRD_SHADOW" }] })).toEqual([]);
  });

  it("captures every drop-shadow property exactly (no value loss)", () => {
    // Mirrors the example shape the user pointed out in elegant.json:
    //   radius=34, spread=14, color.a=0.10999999940395355, offset=(0,4)
    const out = parseEffects({
      effects: [
        {
          type: "DROP_SHADOW",
          visible: true,
          radius: 34,
          color: { r: 0, g: 0, b: 0, a: 0.10999999940395355 },
          offset: { x: 0, y: 4 },
          spread: 14,
          blendMode: "NORMAL",
          showShadowBehindNode: false,
        },
      ],
    });
    expect(out).toHaveLength(1);
    const shadow = out[0];
    if (shadow.kind !== "drop-shadow") throw new Error("expected drop-shadow");
    expect(shadow.visible).toBe(true);
    expect(shadow.radius).toBe(34);
    expect(shadow.spread).toBe(14);
    expect(shadow.offset).toEqual({ x: 0, y: 4 });
    expect(shadow.blendMode).toBe("NORMAL");
    expect(shadow.showShadowBehindNode).toBe(false);
    // Alpha precision is preserved through the colour pipeline.
    expect(shadow.color).toContain("0.10999999940395355");
  });

  it("defaults showShadowBehindNode to false when omitted", () => {
    const out = parseEffects({
      effects: [
        {
          type: "DROP_SHADOW",
          color: { r: 0, g: 0, b: 0, a: 1 },
          offset: { x: 0, y: 0 },
          radius: 4,
          spread: 0,
        },
      ],
    });
    if (out[0].kind !== "drop-shadow") throw new Error("expected drop-shadow");
    expect(out[0].showShadowBehindNode).toBe(false);
  });
});
