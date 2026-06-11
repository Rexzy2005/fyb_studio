import type { NormalizedDesignV1 } from "@/lib/figma";
import { CanvasBackend } from "@/lib/render/engine/backends/canvasBackend";
import { renderTree } from "@/lib/render/engine/renderTree";
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

  await ensureGoogleFontsLoaded(design.assets?.fonts ?? []);
  await ensureCustomFontsLoaded(design.assets?.fonts ?? []);

  const designWidth = Math.max(1, design.canvas.width);
  const designHeight = Math.max(1, design.canvas.height);

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(designWidth * scale));
  canvas.height = Math.max(1, Math.round(designHeight * scale));

  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) throw new Error("Failed to create 2D context");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const sx = canvas.width / designWidth;
  const sy = canvas.height / designHeight;
  ctx.setTransform(sx, 0, 0, sy, 0, 0);

  const colorOverrideByNodeId: Record<string, string> = {};
  for (const f of fieldConfig.fields) {
    if (f.kind !== "color") continue;
    if ((f.colorBehavior?.enabled ?? true) === false) continue;
    const paletteFirst = f.colorBehavior?.palette?.[0];
    const value = previewColorByNodeId[f.nodeId] ?? paletteFirst;
    if (value) colorOverrideByNodeId[f.nodeId] = value;
  }

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
      // Missing/undecodable user images render as placeholders.
    }
  }

  const fontFacesStyle = await buildEmbeddedFontFacesStyle(design.assets?.fonts ?? []);
  const backend = new CanvasBackend({
    ctx,
    opts: {
      previewTextByNodeId,
      previewColorByNodeId,
      skipText: false,
    },
    design,
    fieldConfig,
    fontFacesStyle,
    colorOverrideByNodeId,
    resolvePreviewImage: (id) => imageOverrides.get(id),
  });

  try {
    await renderTree(design, backend, {
      previewTextByNodeId,
      previewColorByNodeId,
      skipText: false,
    });
  } finally {
    for (const image of imageOverrides.values()) image.release();
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) {
        resolve(b);
        return;
      }
      try {
        const dataUrl = canvas.toDataURL("image/png");
        const [, base64] = dataUrl.split(",");
        if (!base64) {
          reject(new Error("Failed to export PNG"));
          return;
        }
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        resolve(new Blob([bytes], { type: "image/png" }));
      } catch (err) {
        reject(err instanceof Error ? err : new Error("Failed to export PNG"));
      }
    }, "image/png");
  });

  return { blob, width: canvas.width, height: canvas.height };
}
