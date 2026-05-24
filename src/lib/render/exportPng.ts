import type { NormalizedDesignV1 } from "@/lib/figma";
import { CanvasBackend } from "@/lib/render/engine/backends/canvasBackend";
import { renderTree } from "@/lib/render/engine/renderTree";
import { buildTextSvg } from "@/lib/render/engine/svgTextLayer";
import { ensureCustomFontsLoaded } from "@/lib/render/features/canvasFont";
import { decodeImageBlobForCanvas } from "@/lib/render/features/canvasImageSource";
import { buildEmbeddedFontFacesStyle } from "@/lib/render/features/embedFonts";
import { ensureGoogleFontsLoaded } from "@/lib/fonts/googleFonts";
import type { FieldConfig } from "@/lib/storage/types";

export type ExportPngInput = {
  design: NormalizedDesignV1;
  fieldConfig: FieldConfig;
  previewTextByNodeId?: Record<string, string>;
  previewImageByNodeId?: Record<
    string,
    { blob: Blob; objectFit: "cover" | "contain"; preservePaintScaleMode?: boolean }
  >;
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

  // Design dimensions stay exact - we never round Figma's source values.
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
  // viewers and social platforms rendered incorrectly - we choose maximum
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

  // Decode user-uploaded image overrides into drawable sources once, so the
  // backend can synchronously hand them to the image-fill renderer. iOS Safari
  // often lacks/rejects createImageBitmap for picker blobs, so the decoder
  // falls back to HTMLImageElement and keeps its object URL alive until the
  // render pass finishes.
  const imageOverrides = new Map<
    string,
    {
      source: CanvasImageSource;
      objectFit: "cover" | "contain";
      preservePaintScaleMode?: boolean;
      release: () => void;
    }
  >();
  for (const [nodeId, entry] of Object.entries(previewImageByNodeId)) {
    try {
      const decoded = await decodeImageBlobForCanvas(entry.blob);
      imageOverrides.set(nodeId, {
        source: decoded.source,
        objectFit: entry.objectFit,
        preservePaintScaleMode: entry.preservePaintScaleMode,
        release: decoded.release,
      });
    } catch {
      // Ignore - backend will draw a placeholder instead.
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

  try {
    await renderTree(design, backend, {
      previewTextByNodeId,
      previewColorByNodeId,
      skipText: true,
    });
  } finally {
    for (const image of imageOverrides.values()) image.release();
  }

  // Compose the SVG text layer on top using the browser's NATIVE SVG
  // rasterizer (the same engine the editor preview uses). We previously used
  // Canvg, but its text/transform/baseline interpretation diverged from the
  // browser, causing the exported PNG to look wrong even though the preview
  // looked correct. Rasterizing through `<img src=blob:…>` + `drawImage`
  // guarantees pixel-identical output between editor and export.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  await drawSvgOntoCanvas(ctx, canvas, design, fieldConfig, previewTextByNodeId);

  // `canvas.toBlob` is async and null-safe; fall back to `toDataURL` on the
  // rare iOS WebKit versions that return null from `toBlob` for large canvases.
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) { resolve(b); return; }
      // Fallback: toDataURL is synchronous and works on all iOS versions.
      try {
        const dataUrl = canvas.toDataURL("image/png");
        const [, base64] = dataUrl.split(",");
        if (!base64) { reject(new Error("Failed to export PNG")); return; }
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        resolve(new Blob([bytes], { type: "image/png" }));
      } catch (err) {
        reject(err instanceof Error ? err : new Error("Failed to export PNG"));
      }
    }, "image/png");
  });

  return { blob, width: canvas.width, height: canvas.height };
}


/**
 * Rasterize the SVG text layer onto the export canvas using the browser's
 * native SVG renderer.
 *
 * Strategy:
 *   1. Build the SVG string via `buildTextSvg` (same builder the editor uses).
 *   2. Inline `@font-face` rules with base64-encoded font files so the SVG's
 *      isolated document context (it loads via `<img src="blob:..."`) can
 *      resolve the same typefaces the editor used. Without this, edited text
 *      drops to the system font.
 *   3. Wrap it in a Blob URL.
 *   4. Decode it as an `<img>` - this triggers the browser's full SVG parser.
 *   5. `drawImage` it onto the canvas at full bitmap dimensions; the SVG's
 *      viewBox handles the design→pixel scaling.
 */
async function drawSvgOntoCanvas(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  design: NormalizedDesignV1,
  fieldConfig: FieldConfig,
  previewTextByNodeId: Record<string, string>,
): Promise<void> {
  const svg = buildTextSvg({ design, fieldConfig, previewTextByNodeId, includeGuides: false });

  // Inline `@font-face` data-URLs so the SVG document carries its own font
  // payload. Done in parallel with the (small) HD-dimension rewrite below.
  const fontFacesStyle = await buildEmbeddedFontFacesStyle(design.assets?.fonts ?? []);

  // HD trick: override the SVG's declared width/height with the BITMAP pixel
  // size while keeping its `viewBox` at design coordinates. The browser will
  // then rasterize the SVG natively at full target resolution - no bilinear
  // scaling on `drawImage`, so text and outlines stay pixel-sharp.
  //
  // Without this override the SVG defaults to design dimensions (e.g. 1024 ×
  // 1280); `drawImage` would scale that 2× to fit the 2048 × 2560 canvas,
  // producing the soft, low-resolution look the user reported.
  let hdSvg = svg
    .replace(/(<svg [^>]*?\bwidth=)"[^"]*"/, `$1"${canvas.width}"`)
    .replace(/(<svg [^>]*?\bheight=)"[^"]*"/, `$1"${canvas.height}"`);

  // Inject the @font-face styles into the SVG's <defs>. If <defs> doesn't
  // exist (no clip paths in the design), insert one right after the <svg>
  // opening tag.
  if (fontFacesStyle) {
    if (/<defs>/.test(hdSvg)) {
      hdSvg = hdSvg.replace(/<defs>/, `<defs>${fontFacesStyle}`);
    } else {
      hdSvg = hdSvg.replace(/(<svg [^>]*>)/, `$1<defs>${fontFacesStyle}</defs>`);
    }
  }

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
