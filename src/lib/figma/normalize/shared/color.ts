import { asNumber, type AnyRecord } from "./coerce";

export function rgbaCss(input: { r?: number; g?: number; b?: number; a?: number }): string {
  const r = Math.round(Math.max(0, Math.min(1, input.r ?? 0)) * 255);
  const g = Math.round(Math.max(0, Math.min(1, input.g ?? 0)) * 255);
  const b = Math.round(Math.max(0, Math.min(1, input.b ?? 0)) * 255);
  const a = Math.max(0, Math.min(1, input.a ?? 1));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
  // Inputs are expected as 0..1 floats from Figma exports.
  function toLinear(u: number) {
    const v = Math.max(0, Math.min(1, u));
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }
  const R = toLinear(rgb.r);
  const G = toLinear(rgb.g);
  const B = toLinear(rgb.b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

export function normalizeLegacyColor01(
  color: AnyRecord,
): { r: number; g: number; b: number; a: number } {
  const rRaw = asNumber(color.r, 0);
  const gRaw = asNumber(color.g, 0);
  const bRaw = asNumber(color.b, 0);
  const aRaw = asNumber(color.a, 1);

  // Detect 0..255 encoding by looking at RGB channels collectively.
  // Avoids the case where r=1 (looks like 0..1) but g/b are 31/98 (0..255).
  const rgbLooks255 = Math.max(rRaw, gRaw, bRaw) > 1;

  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  const to01 = (v: number) => (rgbLooks255 ? v / 255 : v);

  return {
    r: clamp01(to01(rRaw)),
    g: clamp01(to01(gRaw)),
    b: clamp01(to01(bRaw)),
    a: clamp01(aRaw > 1 ? aRaw / 255 : aRaw),
  };
}
