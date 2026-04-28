import type { NormalizedNode } from "@/lib/figma";

export function createCanvasGradient(
  ctx: CanvasRenderingContext2D,
  frame: { x: number; y: number; width: number; height: number },
  fill: Extract<NormalizedNode["fills"][number], { kind: "gradient" }>,
): CanvasGradient | null {
  const { x, y, width, height } = frame;

  if (fill.gradientType === "linear") {
    const h0 = fill.handlePositions?.[0];
    const h1 = fill.handlePositions?.[1];
    const x0 = x + (h0 ? h0.x * width : 0);
    const y0 = y + (h0 ? h0.y * height : 0);
    const x1 = x + (h1 ? h1.x * width : width);
    const y1 = y + (h1 ? h1.y * height : 0);
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (const s of fill.stops) g.addColorStop(s.offset, s.colorCss);
    return g;
  }

  if (fill.gradientType === "radial") {
    const cx = x + width / 2;
    const cy = y + height / 2;
    const r = Math.max(width, height) / 2;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    for (const s of fill.stops) g.addColorStop(s.offset, s.colorCss);
    return g;
  }

  return null;
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  r: { tl: number; tr: number; bl: number; br: number },
) {
  const tl = Math.max(0, Math.min(r.tl, Math.min(width, height) / 2));
  const tr = Math.max(0, Math.min(r.tr, Math.min(width, height) / 2));
  const br = Math.max(0, Math.min(r.br, Math.min(width, height) / 2));
  const bl = Math.max(0, Math.min(r.bl, Math.min(width, height) / 2));

  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + width - tr, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + tr);
  ctx.lineTo(x + width, y + height - br);
  ctx.quadraticCurveTo(x + width, y + height, x + width - br, y + height);
  ctx.lineTo(x + bl, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - bl);
  ctx.lineTo(x, y + tl);
  ctx.quadraticCurveTo(x, y, x + tl, y);
  ctx.closePath();
}
