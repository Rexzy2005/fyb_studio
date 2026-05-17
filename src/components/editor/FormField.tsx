"use client";

import type { FieldConfig } from "@/lib/storage/types";
import { ImageUpload, inferFileMeta } from "@/components/forms/ImageUpload";

/**
 * One row of the user-facing template form. Used by:
 *   - The user template-use page (mobile + desktop)
 *   - The admin preview modal (so admin sees exactly what the user will see)
 *
 * `density` controls input sizing only - not styling logic - so the same
 * field always renders consistently across surfaces.
 */
export function FormField({
  field,
  previewTextByNodeId,
  previewImageByNodeId,
  previewColorByNodeId,
  onPreviewTextChange,
  onPreviewImageChange,
  onPreviewColorChange,
  density,
}: {
  field: FieldConfig["fields"][number];
  previewTextByNodeId: Record<string, string>;
  previewImageByNodeId: Record<string, { url?: string; objectFit?: "cover" | "contain"; blob?: Blob }>;
  previewColorByNodeId: Record<string, string>;
  onPreviewTextChange: (nodeId: string, value: string) => void;
  onPreviewImageChange: (nodeId: string, file: File | null) => void;
  onPreviewColorChange: (nodeId: string, value: string) => void;
  density: "compact" | "comfortable";
}) {
  const inputClass =
    density === "compact"
      ? "h-9 rounded-xl border border-hairline bg-surface-1 px-3 text-[13px] text-ink dark:border-hairline dark:bg-surface-1 dark:text-ink"
      : "h-11 rounded-2xl border border-hairline bg-surface-1 px-3 text-sm text-ink dark:border-hairline dark:bg-surface-1 dark:text-ink";

  if (field.kind === "text") {
    const value = previewTextByNodeId[field.nodeId] ?? "";
    return (
      <label className="grid gap-1">
        <span className="text-xs font-medium text-ink dark:text-ink">{field.label}</span>
        <input
          value={value}
          maxLength={field.maxChars}
          placeholder={field.placeholder ?? ""}
          onChange={(e) => onPreviewTextChange(field.nodeId, e.target.value)}
          className={inputClass}
        />
      </label>
    );
  }

  if (field.kind === "image") {
    const allowReplace = field.imageBehavior?.allowReplace ?? true;
    const current = previewImageByNodeId[field.nodeId];
    const meta = inferFileMeta(current?.blob ? new File([current.blob], "image") : undefined);
    return (
      <ImageUpload
        label={field.label}
        description={undefined}
        valueUrl={current?.url}
        valueName={meta}
        objectFit={
          current?.objectFit ??
          (field.imageBehavior?.fit ?? (field.cropRule === "contain" ? "contain" : "cover"))
        }
        disabled={!allowReplace}
        onPick={(file) => onPreviewImageChange(field.nodeId, file)}
        onClear={allowReplace ? () => onPreviewImageChange(field.nodeId, null) : undefined}
      />
    );
  }

  if (field.kind === "color") {
    const enabled = field.colorBehavior?.enabled ?? true;
    if (!enabled) return null;
    const palette = field.colorBehavior?.palette?.filter(Boolean) ?? [];
    const value = previewColorByNodeId[field.nodeId] ?? (palette[0] ?? "#000000");
    return (
      <label className="grid gap-1">
        <span className="text-xs font-medium text-ink dark:text-ink">{field.label}</span>
        {palette.length ? (
          <select
            value={value}
            onChange={(e) => onPreviewColorChange(field.nodeId, e.target.value)}
            className={inputClass}
          >
            {palette.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="color"
            value={value}
            onChange={(e) => onPreviewColorChange(field.nodeId, e.target.value)}
            className={
              density === "compact"
                ? "h-9 w-16 rounded-xl border border-hairline bg-surface-1 dark:border-hairline dark:bg-surface-1"
                : "h-11 w-24 rounded-2xl border border-hairline bg-surface-1 dark:border-hairline dark:bg-surface-1"
            }
          />
        )}
      </label>
    );
  }

  return null;
}
