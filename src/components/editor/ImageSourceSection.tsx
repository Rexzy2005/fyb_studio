"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { createLocalTemplateRepository } from "@/lib/storage/templateRepo";
import type { FieldConfig } from "@/lib/storage/types";

type ImageField = Extract<FieldConfig["fields"][number], { kind: "image" }>;
type ImageSource = NonNullable<ImageField["imageSource"]>;

const ACCEPTED_MIME = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"];
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB cap; admin assets are usually well under this.

type Props = {
  templateId: string | null;
  field: ImageField;
  onChange: (patch: Partial<ImageField>) => void;
  /** Called after a successful save/remove so a parent renderer can refetch its asset map. */
  onAssetChange?: () => void;
};

/**
 * Admin control for an image field's source classification.
 *
 * - "User Image" (default): user uploads at template-use time.
 * - "Design Asset": admin uploads here; blob saved to IndexedDB keyed by (templateId, nodeId).
 *   At render time the design-asset blob replaces the placeholder for everyone.
 */
export function ImageSourceSection({ templateId, field, onChange, onAssetChange }: Props) {
  const repo = useRepo();
  const source: ImageSource = field.imageSource ?? "user";
  const isDesignAsset = source === "design_asset";

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [hasAsset, setHasAsset] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load the saved blob into a preview URL whenever the field becomes a design asset
  // or the reload token bumps (after upload/remove).
  useEffect(() => {
    if (!isDesignAsset || !templateId) {
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setHasAsset(false);
      return;
    }

    let cancelled = false;
    let createdUrl: string | null = null;
    setLoading(true);

    repo
      .getDesignAsset({ templateId, nodeId: field.nodeId })
      .then((record) => {
        if (cancelled) return;
        if (record) {
          createdUrl = URL.createObjectURL(record.blob);
          setPreviewUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return createdUrl;
          });
          setHasAsset(true);
        } else {
          setPreviewUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
          });
          setHasAsset(false);
        }
      })
      .catch(() => {
        if (cancelled) return;
        setError("Failed to load saved asset.");
        setHasAsset(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [isDesignAsset, templateId, field.nodeId, reloadToken, repo]);

  // Final cleanup on unmount.
  useEffect(() => {
    return () => {
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    };
  }, []);

  const handleSourceChange = useCallback(
    (next: ImageSource) => {
      if (next === source) return;
      // Saved blobs are kept in IDB so toggling back to "design_asset" restores them.
      // Use the explicit "Remove" button to clear an asset.
      onChange({ imageSource: next });
      setError(null);
    },
    [source, onChange],
  );

  const handleFileSelected = useCallback(
    async (file: File | null) => {
      if (!file) return;
      if (!templateId) {
        setError("Save the template first, then upload the asset.");
        return;
      }
      if (file.size > MAX_BYTES) {
        setError(`File exceeds ${Math.round(MAX_BYTES / 1024 / 1024)} MB limit.`);
        return;
      }
      const mime = file.type || "image/png";
      if (!ACCEPTED_MIME.includes(mime)) {
        setError("Unsupported image type.");
        return;
      }

      setBusy(true);
      setError(null);
      try {
        await repo.saveDesignAsset({ templateId, nodeId: field.nodeId, blob: file, mime });
        setReloadToken((t) => t + 1);
        onAssetChange?.();
      } catch {
        setError("Failed to save asset.");
      } finally {
        setBusy(false);
      }
    },
    [repo, templateId, field.nodeId, onAssetChange],
  );

  const handleRemove = useCallback(async () => {
    if (!templateId) return;
    setBusy(true);
    setError(null);
    try {
      await repo.deleteDesignAsset({ templateId, nodeId: field.nodeId });
      setReloadToken((t) => t + 1);
      onAssetChange?.();
    } catch {
      setError("Failed to remove asset.");
    } finally {
      setBusy(false);
    }
  }, [repo, templateId, field.nodeId, onAssetChange]);

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <div className="rounded-2xl border border-hairline bg-canvas p-3 dark:border-hairline dark:bg-surface-2/30">
      <div className="text-xs font-semibold text-ink dark:text-ink">Image source</div>
      <div className="mt-1 text-[11px] text-ink-muted dark:text-ink-muted">
        Choose who provides the image for this slot.
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <SourceOption
          label="User Image"
          description="End user uploads at template-use time."
          checked={source === "user"}
          onSelect={() => handleSourceChange("user")}
        />
        <SourceOption
          label="Design Asset"
          description="You upload here. Locked on user side."
          checked={source === "design_asset"}
          onSelect={() => handleSourceChange("design_asset")}
        />
      </div>

      {isDesignAsset ? (
        <div className="mt-3 grid gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_MIME.join(",")}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              void handleFileSelected(file);
              // Reset so selecting the same file again still triggers change.
              e.target.value = "";
            }}
          />

          <div className="flex items-center gap-3 rounded-xl border border-hairline bg-surface-1 p-2 dark:border-hairline dark:bg-surface-1">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-hairline bg-surface-2 dark:border-hairline dark:bg-surface-1">
              {loading ? (
                <span className="text-[10px] text-ink-faint dark:text-ink-faint">…</span>
              ) : previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="" className="h-full w-full object-contain" />
              ) : (
                <span className="text-[10px] text-ink-faint dark:text-ink-faint">No image</span>
              )}
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={openFilePicker}
                  disabled={busy || !templateId}
                  className="inline-flex h-8 items-center justify-center rounded-xl bg-surface-1 px-3 text-[11px] font-medium text-white shadow-sm transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-surface-2 dark:text-ink dark:hover:bg-surface-1"
                >
                  {hasAsset ? "Replace" : "Upload"}
                </button>
                {hasAsset ? (
                  <button
                    type="button"
                    onClick={() => void handleRemove()}
                    disabled={busy}
                    className="inline-flex h-8 items-center justify-center rounded-xl border border-hairline bg-surface-1 px-3 text-[11px] font-medium text-ink shadow-sm transition hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-50 dark:border-hairline dark:bg-surface-1 dark:text-ink dark:hover:bg-surface-2"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              <div className="text-[10px] text-ink-muted dark:text-ink-muted">
                {hasAsset
                  ? "Saved. Renders for all users; not editable on user side."
                  : "PNG, JPG, WebP, GIF, or SVG. Max 8 MB."}
              </div>
            </div>
          </div>

          {error ? (
            <div className="rounded-lg border border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.08)] px-2 py-1 text-[11px] text-red-900 dark:border-[rgba(239,68,68,0.28)] dark:bg-[rgba(239,68,68,0.12)] dark:text-danger">
              {error}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SourceOption({
  label,
  description,
  checked,
  onSelect,
}: {
  label: string;
  description: string;
  checked: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={checked}
      className={
        "flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left transition " +
        (checked
          ? "border-[var(--accent-blue)] bg-[var(--accent-blue-soft)] dark:border-[rgba(0,153,255,0.4)] dark:bg-[var(--accent-blue-soft)]"
          : "border-hairline bg-surface-1 hover:bg-canvas dark:border-hairline dark:bg-surface-1 dark:hover:bg-surface-1")
      }
    >
      <span className="text-xs font-medium text-ink dark:text-ink">{label}</span>
      <span className="text-[10px] leading-snug text-ink-muted dark:text-ink-muted">{description}</span>
    </button>
  );
}

function useRepo() {
  // Repository is a thin stateless wrapper around IndexedDB; one instance per render is fine,
  // but memoizing avoids unnecessary identity churn for downstream effect deps.
  const ref = useRef<ReturnType<typeof createLocalTemplateRepository> | null>(null);
  if (!ref.current) ref.current = createLocalTemplateRepository();
  return ref.current;
}
