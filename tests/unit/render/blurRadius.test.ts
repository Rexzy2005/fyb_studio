import { describe, expect, it } from "vitest";

import {
  figmaBlurRadiusToCanvasPx,
  figmaBlurRadiusToSigma,
} from "@/lib/render/features/effects/blurRadius";

describe("figma blur radius mapping", () => {
  it("maps Figma blur radius to Gaussian sigma", () => {
    expect(figmaBlurRadiusToSigma(8)).toBe(4);
    expect(figmaBlurRadiusToSigma(0)).toBe(0);
    expect(figmaBlurRadiusToSigma(-10)).toBe(0);
  });

  it("scales canvas filter blur to the active bitmap transform", () => {
    expect(figmaBlurRadiusToCanvasPx(8, { a: 2, b: 0, c: 0, d: 2 })).toBe(8);
    expect(figmaBlurRadiusToCanvasPx(8, { a: 0, b: 3, c: -3, d: 0 })).toBe(12);
    expect(figmaBlurRadiusToCanvasPx(8)).toBe(4);
  });
});
