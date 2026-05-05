import { Canvg } from "canvg";

import type { NormalizedDesignV1 } from "@/lib/figma";
import { CanvasBackend } from "@/lib/render/engine/backends/canvasBackend";
import { renderTree } from "@/lib/render/engine/renderTree";
import { buildTextSvg } from "@/lib/render/engine/svgTextLayer";
import { ensureCustomFontsLoaded } from "@/lib/render/features/canvasFont";
import { ensureGoogleFontsLoaded } from "@/lib/fonts/googleFonts";
import type { FieldConfig } from "@/lib/storage/types";

export type ExportPngInput = {
  design: NormalizedDesignV1;
  fieldConfig: FieldConfig;
  previewTextByNodeId?: Record<string, string>;
  previewImageByNodeId?: Record<string, { blob: Blob; objectFit: "cover" | "contain" }>;
  previewColorByNodeId?: Record<string, string>;
  scale: number;
};

export async function exportTemplatePng({
  design,
  fieldConfig,
  previewTextByNodeId = {},
  previewImageByNodeId = {},
  previewColorByNodeId = {},
  scale,
}: ExportPngInput): Promise<{ blob: Blob; width: number; height: number }> {
  if (typeof window === "undefined") {
    throw new Error("PNG export must run in the browser");
  }

  // Ensure fonts are present before any text measurement/layout to prevent
  // exports rendering with fallback fonts on first run.
  await ensureGoogleFontsLoaded(design.assets?.fonts ?? []);
  await ensureCustomFontsLoaded(design.assets?.fonts ?? []);

  // Design dimensions stay exact — we never round Figma's source values.
  // Only the bitmap target is rounded (canvases must have integer pixel sizes).
  // The transform is computed as bitmap/design so design coords map onto the
  // bitmap exactly, with no sub-pixel drift introduced by independent rounding.
  const designWidth = Math.max(1, design.canvas.width);
  const designHeight = Math.max(1, design.canvas.height);

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(designWidth * scale));
  canvas.height = Math.max(1, Math.round(designHeight * scale));

  // sRGB canvas (the universal standard for PNG output). Wider color spaces
  // like display-p3 produced PNGs with embedded color profiles that some
  // viewers and social platforms rendered incorrectly — we choose maximum
  // compatibility over a slightly wider gamut.
  // `alpha: true` keeps the canvas backed by RGBA so transparent regions
  // export with proper alpha.
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) throw new Error("Failed to create 2D context");
  // High-quality smoothing for any image scaling that occurs (e.g. when an
  // uploaded photo is drawn into a smaller frame at 2× export scale).
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const sx = canvas.width / designWidth;
  const sy = canvas.height / designHeight;
  ctx.setTransform(sx, 0, 0, sy, 0, 0);

  // Resolve color overrides from the field config once, up front.
  const colorOverrideByNodeId: Record<string, string> = {};
  for (const f of fieldConfig.fields) {
    if (f.kind !== "color") continue;
    if ((f.colorBehavior?.enabled ?? true) === false) continue;
    const paletteFirst = f.colorBehavior?.palette?.[0];
    const value = previewColorByNodeId[f.nodeId] ?? paletteFirst;
    if (value) colorOverrideByNodeId[f.nodeId] = value;
  }

  // Decode user-uploaded image overrides into ImageBitmaps once, so the
  // backend can synchronously hand them to the image-fill renderer.
  const imageOverrides = new Map<string, { source: ImageBitmap; objectFit: "cover" | "contain" }>();
  for (const [nodeId, entry] of Object.entries(previewImageByNodeId)) {
    try {
      const bmp = await createImageBitmap(entry.blob);
      imageOverrides.set(nodeId, { source: bmp, objectFit: entry.objectFit });
    } catch {
      // Ignore — backend will draw a placeholder instead.
    }
  }

  const backend = new CanvasBackend({
    ctx,
    opts: {
      previewTextByNodeId,
      previewColorByNodeId,
      skipText: true,
    },
    colorOverrideByNodeId,
    resolvePreviewImage: (id) => imageOverrides.get(id),
  });

  await renderTree(design, backend, {
    previewTextByNodeId,
    previewColorByNodeId,
    skipText: true,
  });

  // Compose the SVG text layer on top using Canvg.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const svg = buildTextSvg({ design, fieldConfig, previewTextByNodeId, includeGuides: false });
  const v = await Canvg.fromString(ctx, svg, {
    ignoreDimensions: true,
    ignoreClear: true,
    scaleWidth: canvas.width,
    scaleHeight: canvas.height,
  });
  await v.render();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Failed to export PNG"))), "image/png");
  });

  return { blob, width: canvas.width, height: canvas.height };
}
