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

  // Compose the SVG text layer on top using the browser's NATIVE SVG
  // rasterizer (the same engine the editor preview uses). We previously used
  // Canvg, but its text/transform/baseline interpretation diverged from the
  // browser, causing the exported PNG to look wrong even though the preview
  // looked correct. Rasterizing through `<img src=blob:…>` + `drawImage`
  // guarantees pixel-identical output between editor and export.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  await drawSvgOntoCanvas(ctx, canvas, design, fieldConfig, previewTextByNodeId);

  // Final touch: paint a subtle "design by fybstudio.art" signature at the
  // bottom-right corner. Renders in design coordinates so the size is
  // proportional to the design — never overpowering, never disappearing.
  drawBrandSignature(ctx, designWidth, designHeight, sx, sy);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Failed to export PNG"))), "image/png");
  });

  return { blob, width: canvas.width, height: canvas.height };
}

/**
 * Paint a subtle "design by fybstudio.art" signature at the bottom-right of
 * the export. Designed to be a small mark — not a watermark — that survives
 * heavy social-media compression while remaining unobtrusive on the design.
 *
 * Rendering choices:
 *   - Position is in DESIGN coordinates (right-padding, bottom-padding) so it
 *     scales proportionally with the design at any export scale.
 *   - White fill at 80% opacity for legibility on dark backgrounds.
 *   - A soft drop-shadow halo (semi-opaque black, 1.5 px blur) gives the text
 *     enough separation from light backgrounds without looking heavy.
 *   - Font size capped to a sensible range so very small or very large
 *     designs still get a readable but unobtrusive mark.
 */
function drawBrandSignature(
  ctx: CanvasRenderingContext2D,
  designWidth: number,
  designHeight: number,
  sx: number,
  sy: number,
): void {
  ctx.save();
  // Render in design coordinates so the math is independent of bitmap pixels.
  ctx.setTransform(sx, 0, 0, sy, 0, 0);

  const text = "design by fybstudio.art";
  // 0.85% of the design's smaller dimension, clamped to a comfortable range.
  const fontSize = Math.max(9, Math.min(14, Math.min(designWidth, designHeight) * 0.0085));
  // 1.6× the font size of breathing room from the canvas edges.
  const padding = fontSize * 1.6;

  ctx.font = `500 ${fontSize}px system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";

  // Soft halo so the mark stays readable on any background colour.
  ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
  ctx.shadowBlur = 1.5;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0.5;

  ctx.fillStyle = "rgba(255, 255, 255, 0.82)";
  ctx.fillText(text, designWidth - padding, designHeight - padding);

  ctx.restore();
}

/**
 * Rasterize the SVG text layer onto the export canvas using the browser's
 * native SVG renderer.
 *
 * Strategy:
 *   1. Build the SVG string via `buildTextSvg` (same builder the editor uses).
 *   2. Wrap it in a Blob URL.
 *   3. Decode it as an `<img>` — this triggers the browser's full SVG parser.
 *   4. `drawImage` it onto the canvas at full bitmap dimensions; the SVG's
 *      viewBox handles the design→pixel scaling.
 *
 * Caveats:
 *   - Fonts loaded into `document.fonts` aren't accessible from inside an
 *     `<img>`-loaded SVG (it's a separate document context). For this design
 *     family, almost all text uses pre-baked outline paths from Figma — no
 *     font lookup needed. Live edited text falls back to the system font.
 *     If we ever need exact font fidelity for edited text, we can inline the
 *     fonts as data-URLs inside the SVG via `@font-face`.
 */
async function drawSvgOntoCanvas(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  design: NormalizedDesignV1,
  fieldConfig: FieldConfig,
  previewTextByNodeId: Record<string, string>,
): Promise<void> {
  const svg = buildTextSvg({ design, fieldConfig, previewTextByNodeId, includeGuides: false });

  // HD trick: override the SVG's declared width/height with the BITMAP pixel
  // size while keeping its `viewBox` at design coordinates. The browser will
  // then rasterize the SVG natively at full target resolution — no bilinear
  // scaling on `drawImage`, so text and outlines stay pixel-sharp.
  //
  // Without this override the SVG defaults to design dimensions (e.g. 1024 ×
  // 1280); `drawImage` would scale that 2× to fit the 2048 × 2560 canvas,
  // producing the soft, low-resolution look the user reported.
  const hdSvg = svg
    .replace(/(<svg [^>]*?\bwidth=)"[^"]*"/, `$1"${canvas.width}"`)
    .replace(/(<svg [^>]*?\bheight=)"[^"]*"/, `$1"${canvas.height}"`);

  const blob = new Blob([hdSvg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = "async";
    img.width = canvas.width;
    img.height = canvas.height;
    img.src = url;
    // `decode()` is the modern way to wait for the image to be ready; it
    // resolves once the SVG has been parsed AND its dimensions are known.
    // Falls back to onload for any environment that doesn't expose decode().
    if (typeof img.decode === "function") {
      await img.decode();
    } else {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("SVG text layer failed to load"));
      });
    }
    // Source rect explicit + 1:1 destination so no resampling occurs.
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  } finally {
    URL.revokeObjectURL(url);
  }
}
