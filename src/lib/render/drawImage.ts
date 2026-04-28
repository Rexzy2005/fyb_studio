export type ObjectFit = "cover" | "contain";

export function drawImagePlaceholder(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  opts?: { label?: string },
) {
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  if (w < 1 || h < 1) return;

  const label = opts?.label ?? "IMAGE";

  ctx.save();

  // Subtle neutral fill (keeps underlying visible if any).
  ctx.fillStyle = "rgba(0,0,0,0.04)";
  ctx.fillRect(x, y, w, h);

  // Dashed border.
  ctx.strokeStyle = "rgba(51, 65, 85, 0.55)";
  ctx.lineWidth = Math.max(1, Math.min(2, Math.min(w, h) / 80));
  ctx.setLineDash([6, 5]);
  ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, w - 1), Math.max(0, h - 1));
  ctx.setLineDash([]);

  // Diagonal cross.
  ctx.strokeStyle = "rgba(51, 65, 85, 0.35)";
  ctx.beginPath();
  ctx.moveTo(x + 6, y + 6);
  ctx.lineTo(x + w - 6, y + h - 6);
  ctx.moveTo(x + w - 6, y + 6);
  ctx.lineTo(x + 6, y + h - 6);
  ctx.stroke();

  // Center label.
  const fontSize = Math.max(10, Math.min(14, Math.floor(Math.min(w, h) / 7)));
  ctx.font = `600 ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
  ctx.fillStyle = "rgba(15, 23, 42, 0.65)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + w / 2, y + h / 2);

  ctx.restore();
}

function getCanvasImageSourceSize(source: CanvasImageSource): { width: number; height: number } {
  // ImageBitmap
  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
    return { width: source.width, height: source.height };
  }

  // HTMLImageElement
  if (typeof HTMLImageElement !== "undefined" && source instanceof HTMLImageElement) {
    return { width: source.naturalWidth || source.width, height: source.naturalHeight || source.height };
  }

  // HTMLCanvasElement
  if (typeof HTMLCanvasElement !== "undefined" && source instanceof HTMLCanvasElement) {
    return { width: source.width, height: source.height };
  }

  // OffscreenCanvas
  if (typeof OffscreenCanvas !== "undefined" && source instanceof OffscreenCanvas) {
    return { width: source.width, height: source.height };
  }

  // HTMLVideoElement
  if (typeof HTMLVideoElement !== "undefined" && source instanceof HTMLVideoElement) {
    return { width: source.videoWidth || source.clientWidth, height: source.videoHeight || source.clientHeight };
  }

  // Fallback: best-effort
  const unknownSource = source as unknown as Record<string, unknown>;
  const width = Number((unknownSource["width"] as unknown) ?? (unknownSource["naturalWidth"] as unknown) ?? 0);
  const height = Number((unknownSource["height"] as unknown) ?? (unknownSource["naturalHeight"] as unknown) ?? 0);
  return {
    width: Number.isFinite(width) && width > 0 ? width : 1,
    height: Number.isFinite(height) && height > 0 ? height : 1,
  };
}

export function drawImageCoverContain(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  x: number,
  y: number,
  width: number,
  height: number,
  objectFit: ObjectFit,
) {
  const { width: sw, height: sh } = getCanvasImageSourceSize(source);

  const scale = objectFit === "cover" ? Math.max(width / sw, height / sh) : Math.min(width / sw, height / sh);

  const dw = sw * scale;
  const dh = sh * scale;

  const dx = x + (width - dw) / 2;
  const dy = y + (height - dh) / 2;

  ctx.drawImage(source, dx, dy, dw, dh);
}
