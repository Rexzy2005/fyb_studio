import { asNumber, type AnyRecord } from "./coerce";

export type AffineMatrix = {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
};

export function parseAbsoluteTransform(node: AnyRecord): AffineMatrix | undefined {
  const t = Array.isArray(node.absoluteTransform) ? (node.absoluteTransform as unknown[]) : null;
  if (!t || t.length < 2) return undefined;

  const r0 = Array.isArray(t[0]) ? (t[0] as unknown[]) : null;
  const r1 = Array.isArray(t[1]) ? (t[1] as unknown[]) : null;
  if (!r0 || !r1 || r0.length < 3 || r1.length < 3) return undefined;

  const a = asNumber(r0[0], NaN);
  const c = asNumber(r0[1], NaN);
  const tx = asNumber(r0[2], NaN);
  const b = asNumber(r1[0], NaN);
  const d = asNumber(r1[1], NaN);
  const ty = asNumber(r1[2], NaN);

  if (![a, b, c, d, tx, ty].every((v) => Number.isFinite(v))) return undefined;
  return { a, b, c, d, tx, ty };
}
