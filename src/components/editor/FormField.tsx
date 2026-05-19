"use client";

import type { CSSProperties } from "react";
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
const INPUT_BASE: CSSProperties = {
  width: "100%",
  background: "rgba(255,255,255,0.025)",
  border: "1px solid rgba(255,215,0,0.18)",
  borderRadius: 10,
  color: "var(--ink)",
  outline: "none",
  transition: "border-color 140ms ease, box-shadow 140ms ease, background 140ms ease",
};

function focusGold(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = "rgba(255,215,0,0.6)";
  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(255,215,0,0.15)";
  e.currentTarget.style.background = "rgba(255,255,255,0.04)";
}
function blurGold(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = "rgba(255,215,0,0.18)";
  e.currentTarget.style.boxShadow = "none";
  e.currentTarget.style.background = "rgba(255,255,255,0.025)";
}

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
  const inputStyle: CSSProperties = {
    ...INPUT_BASE,
    height: density === "compact" ? 38 : 44,
    padding: "0 14px",
    // iOS Safari zooms the page when focusing inputs below 16px.
    fontSize: 16,
    lineHeight: "20px",
  };

  if (field.kind === "text") {
    const value = previewTextByNodeId[field.nodeId] ?? "";
    return (
      <label className="grid gap-1.5">
        <span
          className="text-[11px] font-semibold"
          style={{ color: "#fff", letterSpacing: "0.01em" }}
        >
          {field.label}
        </span>
        <input
          value={value}
          maxLength={field.maxChars}
          placeholder={field.placeholder ?? ""}
          onChange={(e) => onPreviewTextChange(field.nodeId, e.target.value)}
          onFocus={focusGold}
          onBlur={blurGold}
          style={inputStyle}
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
      <label className="grid gap-1.5">
        <span
          className="text-[11px] font-semibold"
          style={{ color: "#fff", letterSpacing: "0.01em" }}
        >
          {field.label}
        </span>
        {palette.length ? (
          <select
            value={value}
            onChange={(e) => onPreviewColorChange(field.nodeId, e.target.value)}
            onFocus={focusGold}
            onBlur={blurGold}
            style={inputStyle}
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
            onFocus={focusGold}
            onBlur={blurGold}
            style={{
              ...INPUT_BASE,
              height: density === "compact" ? 38 : 44,
              width: density === "compact" ? 72 : 96,
              padding: 4,
              cursor: "pointer",
              fontSize: 16,
            }}
          />
        )}
      </label>
    );
  }

  return null;
}
