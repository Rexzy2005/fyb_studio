import { describe, expect, it } from "vitest";

import {
  applyFiltersInPlace,
  hasAnyImageFilter,
} from "@/lib/render/features/paints/filters";

const ZERO = {
  exposure: 0,
  contrast: 0,
  saturation: 0,
  temperature: 0,
  tint: 0,
  highlights: 0,
  shadows: 0,
};

function makePixel(r: number, g: number, b: number, a = 255): Uint8ClampedArray {
  return new Uint8ClampedArray([r, g, b, a]);
}

describe("hasAnyImageFilter", () => {
  it("returns false for null/undefined/all-zero", () => {
    expect(hasAnyImageFilter(undefined)).toBe(false);
    expect(hasAnyImageFilter(null)).toBe(false);
    expect(hasAnyImageFilter({ ...ZERO })).toBe(false);
  });
  it("returns true if any channel is non-zero", () => {
    expect(hasAnyImageFilter({ ...ZERO, exposure: 0.1 })).toBe(true);
    expect(hasAnyImageFilter({ ...ZERO, shadows: -0.5 })).toBe(true);
  });
});

describe("applyFiltersInPlace", () => {
  it("identity (all zeros) leaves pixels unchanged", () => {
    const buf = makePixel(123, 45, 200);
    applyFiltersInPlace(buf, { ...ZERO });
    expect([...buf]).toEqual([123, 45, 200, 255]);
  });

  it("exposure +1 doubles linear brightness (clamps at 255)", () => {
    const buf = makePixel(60, 60, 60);
    applyFiltersInPlace(buf, { ...ZERO, exposure: 1 });
    // 2^1 * 60 = 120
    expect(buf[0]).toBeGreaterThanOrEqual(119);
    expect(buf[0]).toBeLessThanOrEqual(121);
  });

  it("exposure -1 halves brightness", () => {
    const buf = makePixel(200, 200, 200);
    applyFiltersInPlace(buf, { ...ZERO, exposure: -1 });
    // 2^-1 * 200 = 100
    expect(buf[0]).toBeGreaterThanOrEqual(99);
    expect(buf[0]).toBeLessThanOrEqual(101);
  });

  it("saturation -1 collapses to grayscale (R=G=B = luminance)", () => {
    const buf = makePixel(255, 0, 0);
    applyFiltersInPlace(buf, { ...ZERO, saturation: -1 });
    // 0.2126 * 255 ≈ 54
    expect(buf[0]).toBe(buf[1]);
    expect(buf[1]).toBe(buf[2]);
    expect(buf[0]).toBeGreaterThanOrEqual(53);
    expect(buf[0]).toBeLessThanOrEqual(55);
  });

  it("contrast +1 doubles spread around midgray (255 → 255, 0 → 0)", () => {
    const buf = new Uint8ClampedArray([200, 200, 200, 255, 50, 50, 50, 255]);
    applyFiltersInPlace(buf, { ...ZERO, contrast: 1 });
    // (200/255 - 0.5) * 2 + 0.5 ≈ 1.07 → 255 (clamped)
    expect(buf[0]).toBe(255);
    // (50/255 - 0.5) * 2 + 0.5 ≈ -0.11 → 0 (clamped)
    expect(buf[4]).toBe(0);
  });

  it("temperature +1 increases R and decreases B (warm shift)", () => {
    const buf = makePixel(128, 128, 128);
    applyFiltersInPlace(buf, { ...ZERO, temperature: 1 });
    expect(buf[0]).toBeGreaterThan(128); // R up
    expect(buf[2]).toBeLessThan(128); // B down
    expect(buf[1]).toBe(128); // G unchanged
  });

  it("temperature -1 decreases R and increases B (cool shift)", () => {
    const buf = makePixel(128, 128, 128);
    applyFiltersInPlace(buf, { ...ZERO, temperature: -1 });
    expect(buf[0]).toBeLessThan(128);
    expect(buf[2]).toBeGreaterThan(128);
  });

  it("tint +1 pushes green down (magenta shift)", () => {
    const buf = makePixel(128, 128, 128);
    applyFiltersInPlace(buf, { ...ZERO, tint: 1 });
    expect(buf[1]).toBeLessThan(128);
  });

  it("highlights only affects bright pixels", () => {
    const buf = new Uint8ClampedArray([
      230, 230, 230, 255, // bright
      40, 40, 40, 255, // dark
    ]);
    applyFiltersInPlace(buf, { ...ZERO, highlights: 1 });
    expect(buf[0]).toBeGreaterThan(230); // bright lifted
    expect(buf[4]).toBeLessThanOrEqual(41); // dark essentially unchanged
  });

  it("shadows only affects dark pixels", () => {
    const buf = new Uint8ClampedArray([
      230, 230, 230, 255, // bright
      40, 40, 40, 255, // dark
    ]);
    applyFiltersInPlace(buf, { ...ZERO, shadows: 1 });
    expect(buf[0]).toBeLessThanOrEqual(231); // bright essentially unchanged
    expect(buf[4]).toBeGreaterThan(40); // dark lifted
  });

  it("alpha channel is never modified", () => {
    const buf = new Uint8ClampedArray([100, 100, 100, 128]);
    applyFiltersInPlace(buf, {
      exposure: 1,
      contrast: 0.5,
      saturation: -1,
      temperature: 1,
      tint: -1,
      highlights: 1,
      shadows: 1,
    });
    expect(buf[3]).toBe(128);
  });

  it("filters compose without crashing on all-extreme combo", () => {
    const buf = makePixel(127, 64, 200);
    expect(() =>
      applyFiltersInPlace(buf, {
        exposure: 1,
        contrast: 1,
        saturation: 1,
        temperature: 1,
        tint: 1,
        highlights: 1,
        shadows: 1,
      }),
    ).not.toThrow();
    // All channels remain in valid byte range.
    expect(buf[0]).toBeGreaterThanOrEqual(0);
    expect(buf[0]).toBeLessThanOrEqual(255);
  });
});
