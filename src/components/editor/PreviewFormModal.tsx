"use client";

import { X } from "lucide-react";

import type { FieldConfig } from "@/lib/storage/types";
import { groupFieldsBySection } from "@/lib/storage/fieldSections";
import { FormField } from "@/components/editor/FormField";
import { sectionIcon } from "@/components/editor/SectionsManager";

type Props = {
  open: boolean;
  onClose: () => void;
  config: FieldConfig;
  previewTextByNodeId: Record<string, string>;
  previewImageByNodeId: Record<string, { url?: string; objectFit?: "cover" | "contain"; blob?: Blob }>;
  previewColorByNodeId: Record<string, string>;
  onPreviewTextChange: (nodeId: string, value: string) => void;
  onPreviewImageChange: (nodeId: string, file: File | null) => void;
  onPreviewColorChange: (nodeId: string, value: string) => void;
};

/**
 * Right-anchored slide-over showing the user-facing form so the admin can
 * fill it as a real user would and see the live design update behind it.
 *
 * Sections come from the field config — same grouping the user will see —
 * so the admin previews the exact end-user experience, not a stripped-down
 * configuration view. Skips admin-only design-asset images and disabled
 * colour fields (those slots aren't shown to users either).
 */
export function PreviewFormModal({
  open,
  onClose,
  config,
  previewTextByNodeId,
  previewImageByNodeId,
  previewColorByNodeId,
  onPreviewTextChange,
  onPreviewImageChange,
  onPreviewColorChange,
}: Props) {
  if (!open) return null;

  const filtered: FieldConfig = {
    ...config,
    fields: config.fields.filter((f) => {
      if (f.kind === "image" && f.imageSource === "design_asset") return false;
      if (f.kind === "color" && (f.colorBehavior?.enabled ?? true) === false) return false;
      return true;
    }),
  };
  const groups = groupFieldsBySection(filtered);

  return (
    <div className="fixed inset-0 z-40">
      {/* Backdrop — clicking closes the panel without committing anything (the
          preview values live in the parent state regardless). */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <aside
        role="dialog"
        aria-label="Preview form"
        className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 sm:w-[420px]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">
              Preview form
            </div>
            <div className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-300">
              Fill it as your users will. The design updates live in the workspace.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {groups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-300">
              No editable fields yet. Configure fields in the right panel to
              see the preview here.
            </div>
          ) : (
            <div className="space-y-3">
              {groups.map(({ section, fields }) => {
                const Icon = sectionIcon(section.icon);
                return (
                  <details
                    key={section.id}
                    open
                    className="group rounded-2xl border border-zinc-200 bg-white open:shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-zinc-950 marker:hidden dark:text-zinc-100 [&::-webkit-details-marker]:hidden">
                      <span className="flex min-w-0 items-center gap-2">
                        <Icon className="h-4 w-4 shrink-0 text-zinc-700 dark:text-zinc-300" />
                        <span className="truncate">{section.label}</span>
                      </span>
                      <span className="shrink-0 text-[11px] font-normal text-zinc-600 dark:text-zinc-400">
                        {fields.length}
                      </span>
                    </summary>
                    <div className="space-y-2 border-t border-zinc-200 p-3 dark:border-zinc-800">
                      {fields.map((f) => (
                        <FormField
                          key={f.id}
                          field={f}
                          previewTextByNodeId={previewTextByNodeId}
                          previewImageByNodeId={previewImageByNodeId}
                          previewColorByNodeId={previewColorByNodeId}
                          onPreviewTextChange={onPreviewTextChange}
                          onPreviewImageChange={onPreviewImageChange}
                          onPreviewColorChange={onPreviewColorChange}
                          density="comfortable"
                        />
                      ))}
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
