import type { FieldConfig } from "@/lib/storage/types";

type ImageField = Extract<FieldConfig["fields"][number], { kind: "image" }>;

export type ImageMapEntry = { objectFit: "cover" | "contain" };

function fitForField(field: ImageField): "cover" | "contain" {
  return field.imageBehavior?.fit ?? field.cropRule ?? "cover";
}

/**
 * Merges layered image sources for the renderer, in precedence order:
 *
 *   1. `base` (highest)        - per-render-session user uploads
 *   2. `designAssets`          - admin-uploaded blobs (only when the field's
 *                                `imageSource === "design_asset"`)
 *   3. `pluginOriginals`       - original image bytes embedded by the FYB
 *                                Extractor plugin (FigmaDesignV1.assets.images)
 *
 * Rules:
 * - For fields with `imageSource === "design_asset"`:
 *   - design asset wins if present; otherwise the preview entry is *removed*
 *     so the slot renders as a placeholder (admin must upload).
 * - For other (or unconfigured) image nodes:
 *   - the user's `base` entry wins; if absent, the plugin original (if any)
 *     fills in so the design always shows its real picture by default.
 */
export function composeImageMap<T extends ImageMapEntry>(
  base: Record<string, T>,
  designAssets: Record<string, T>,
  fieldConfig: FieldConfig | undefined | null,
  pluginOriginals?: Record<string, T>,
): Record<string, T> {
  const out: Record<string, T> = { ...base };

  // Fill in plugin originals for nodes that don't already have a user entry.
  if (pluginOriginals) {
    for (const [nodeId, entry] of Object.entries(pluginOriginals)) {
      if (!out[nodeId]) out[nodeId] = entry;
    }
  }

  if (!fieldConfig) return out;

  for (const field of fieldConfig.fields) {
    if (field.kind !== "image") continue;
    if (field.imageSource !== "design_asset") continue;

    const asset = designAssets[field.nodeId];
    if (asset) {
      out[field.nodeId] = { ...asset, objectFit: fitForField(field) };
    } else {
      delete out[field.nodeId];
    }
  }

  return out;
}
