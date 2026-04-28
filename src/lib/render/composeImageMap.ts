import type { FieldConfig } from "@/lib/storage/types";

type ImageField = Extract<FieldConfig["fields"][number], { kind: "image" }>;

export type ImageMapEntry = { objectFit: "cover" | "contain" };

function fitForField(field: ImageField): "cover" | "contain" {
  return field.imageBehavior?.fit ?? field.cropRule ?? "cover";
}

/**
 * Merges a base preview-image map (per-render-session uploads) with a design-asset map
 * (admin-uploaded blobs persisted in IndexedDB), honoring each image field's `imageSource`.
 *
 * Rules:
 * - Field with `imageSource === "design_asset"`:
 *   - If a design asset is available → it overrides any preview entry for that node.
 *   - If no design asset is available → any preview entry for that node is removed
 *     (the slot must render as a placeholder; preview state is irrelevant).
 * - Field with `imageSource !== "design_asset"` (or absent → "user") → preview entry passes through.
 *
 * The renderer already reads fit from the field config, but we still write a sensible
 * `objectFit` on overridden entries so the existing data flow stays consistent.
 */
export function composeImageMap<T extends ImageMapEntry>(
  base: Record<string, T>,
  designAssets: Record<string, T>,
  fieldConfig: FieldConfig | undefined | null,
): Record<string, T> {
  const out: Record<string, T> = { ...base };
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
