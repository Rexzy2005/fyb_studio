import { describe, expect, it } from "vitest";

import { rgbaCss } from "@/lib/figma/normalize/shared/color";

describe("rgbaCss", () => {
  it("preserves full JS-number precision (no rounding) — Figma source values pass through unchanged", () => {
    // 0.003921568859368563 is what Figma exports for what is conceptually 1/255.
    // After multiplying by 255 we get 1.0000000591389835. The renderer must NOT
    // truncate this to "1" — the full float must reach the CSS output.
    const css = rgbaCss({ r: 0.003921568859368563, g: 0, b: 0, a: 1 });
    expect(css).toBe("rgba(1.0000000591389835, 0, 0, 1)");
  });

  it("preserves alpha precision", () => {
    const css = rgbaCss({ r: 0, g: 0, b: 0, a: 0.5099999904632568 });
    expect(css).toContain("0.5099999904632568");
  });

  it("clamps out-of-range inputs to legal CSS color space", () => {
    const css = rgbaCss({ r: 1.5, g: -0.2, b: 2, a: 1 });
    expect(css).toBe("rgba(255, 0, 255, 1)");
  });

  it("renders pure colors without artificial decimals", () => {
    expect(rgbaCss({ r: 1, g: 0, b: 0, a: 1 })).toBe("rgba(255, 0, 0, 1)");
  });
});
