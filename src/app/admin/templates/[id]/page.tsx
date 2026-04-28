"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { normalizeFigmaExport, type NormalizedDesignV1 } from "@/lib/figma";
import { composeImageMap } from "@/lib/render/composeImageMap";
import { useDesignAssets } from "@/lib/render/useDesignAssets";
import { createLocalTemplateRepository } from "@/lib/storage/templateRepo";
import type { TemplateRecord } from "@/lib/storage/types";
import { DesignWorkspace } from "@/components/editor/DesignWorkspace";
import { FieldConfigPanel } from "@/components/editor/FieldConfigPanel";
import { IconsFontsPanel } from "@/components/editor/IconsFontsPanel";
import { useTemplateEditorStore } from "@/lib/stores/templateEditorStore";
import { useGoogleFonts } from "@/components/editor/useGoogleFonts";
import { ImageUpload } from "@/components/forms/ImageUpload";
import { ProgressModal } from "@/components/ui/ProgressModal";
import { useSimulatedProgress } from "@/components/ui/useSimulatedProgress";
import { NormalizationWarningsModal } from "@/components/ui/NormalizationWarningsModal";

type TemplateCategoryPreset = "fyb" | "signout" | "other";

function inferCategoryPreset(raw: string | undefined): { preset: TemplateCategoryPreset; otherValue: string } {
  const v = (raw ?? "").trim();
  if (!v) return { preset: "fyb", otherValue: "" };
  const lower = v.toLowerCase();
  if (lower === "fyb") return { preset: "fyb", otherValue: "" };
  if (/(sign\s*-?\s*out|signed\s*out)/.test(lower) || lower === "sign-out" || lower === "signout") {
    return { preset: "signout", otherValue: "" };
  }
  return { preset: "other", otherValue: v };
}

function resolveCategoryValue(preset: TemplateCategoryPreset, otherValue: string): string {
  if (preset === "fyb") return "FYB";
  if (preset === "signout") return "Sign-out";
  return otherValue.trim();
}

export default function TemplateEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const repo = useMemo(() => createLocalTemplateRepository(), []);
  const router = useRouter();
  const [record, setRecord] = useState<TemplateRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [normalizing, setNormalizing] = useState(false);
  const saveTimerRef = useRef<number | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);

  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [publishFile, setPublishFile] = useState<File | null>(null);
  const [publishPreviewUrl, setPublishPreviewUrl] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishCategoryPreset, setPublishCategoryPreset] = useState<TemplateCategoryPreset>("fyb");
  const [publishCategoryOther, setPublishCategoryOther] = useState("");

  const [warningsModalOpen, setWarningsModalOpen] = useState(false);

  const normalizeProgress = useSimulatedProgress(normalizing);
  const publishProgress = useSimulatedProgress(publishing);
  const pageLoading = !record;
  const pageProgress = useSimulatedProgress(pageLoading, { start: 0.12, cap: 0.92 });

  const [previewTextByNodeId, setPreviewTextByNodeId] = useState<Record<string, string>>({});
  const [previewImageByNodeId, setPreviewImageByNodeId] = useState<
    Record<string, { url: string; objectFit: "cover" | "contain"; _revoke?: boolean }>
  >({});
  const [previewColorByNodeId, setPreviewColorByNodeId] = useState<Record<string, string>>({});
  const previewImagesRef = useRef(previewImageByNodeId);
  const selectedNodeId = useTemplateEditorStore((s) => s.selectedNodeId);
  const setSelectedNodeId = useTemplateEditorStore((s) => s.setSelectedNodeId);

  const { designAssetImageByNodeId, reloadDesignAssets } = useDesignAssets(id);
  const renderImageByNodeId = useMemo(
    () => composeImageMap(previewImageByNodeId, designAssetImageByNodeId, record?.fieldConfig),
    [previewImageByNodeId, designAssetImageByNodeId, record?.fieldConfig],
  );

  const normalizedForFonts = (record?.normalized as NormalizedDesignV1 | undefined) ?? undefined;
  useGoogleFonts(["Ms Madi", ...(normalizedForFonts?.assets.fonts ?? [])]);

  useEffect(() => {
    previewImagesRef.current = previewImageByNodeId;
  }, [previewImageByNodeId]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      for (const v of Object.values(previewImagesRef.current)) {
        if (v._revoke) URL.revokeObjectURL(v.url);
      }
      if (publishPreviewUrl) URL.revokeObjectURL(publishPreviewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await repo.get(id);
        setRecord(r);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
      }
    })();
  }, [id, repo]);

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200">
        {error}
      </div>
    );
  }

  if (!record) {
    return (
      <div className="min-h-dvh bg-zinc-50 dark:bg-zinc-950">
        <ProgressModal
          open
          title="Loading editor"
          subtitle={pageProgress < 0.6 ? "Fetching draft" : "Preparing workspace"}
          percent={Math.round(pageProgress * 100)}
          hint="Saved locally in your browser."
        />
      </div>
    );
  }

  const normalized = record.normalized as NormalizedDesignV1 | undefined;

  const warnings = normalized?.warnings ?? [];

  async function normalizeNow() {
    if (!record) return;
    setError(null);
    setBusy(true);
    setNormalizing(true);
    try {
      const next = normalizeFigmaExport(record.designJson);
      const updated = await repo.upsertDraft({
        id: record.id,
        name: record.name,
        designJson: record.designJson,
        normalized: next,
        fieldConfig: record.fieldConfig,
      });
      setRecord(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to normalize");
    } finally {
      setBusy(false);
      setNormalizing(false);
    }
  }

  async function setStatus(status: "draft" | "published") {
    if (!record) return;
    setError(null);
    setBusy(true);
    try {
      await repo.setStatus(record.id, status);
      const refreshed = await repo.get(record.id);
      setRecord(refreshed);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update status");
    } finally {
      setBusy(false);
    }
  }

  function openPublishModal() {
    setPublishError(null);
    setPublishFile(null);
    const inferred = inferCategoryPreset(record?.category ?? record?.name);
    setPublishCategoryPreset(inferred.preset);
    setPublishCategoryOther(inferred.otherValue);
    if (publishPreviewUrl) {
      URL.revokeObjectURL(publishPreviewUrl);
      setPublishPreviewUrl(null);
    }
    setPublishModalOpen(true);
  }

  function closePublishModal() {
    setPublishModalOpen(false);
    setPublishError(null);
    setPublishFile(null);
    setPublishCategoryPreset("fyb");
    setPublishCategoryOther("");
    if (publishPreviewUrl) {
      URL.revokeObjectURL(publishPreviewUrl);
      setPublishPreviewUrl(null);
    }
  }

  function onPickPublishPreview(file: File) {
    setPublishError(null);
    const maxBytes = 5 * 1024 * 1024;
    if (!file.type.startsWith("image/")) {
      setPublishError("Please upload an image file (PNG, JPG, or WebP). ");
      return;
    }
    if (file.size > maxBytes) {
      setPublishError("Preview image must be under 5MB.");
      return;
    }

    if (publishPreviewUrl) URL.revokeObjectURL(publishPreviewUrl);
    setPublishFile(file);
    setPublishPreviewUrl(URL.createObjectURL(file));
  }

  async function getImageDimensionsFromBlob(blob: Blob): Promise<{ width: number; height: number }> {
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        img.onload = () => resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
        img.onerror = () => reject(new Error("Failed to read image"));
        img.src = url;
      });
      return dims;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async function confirmPublishWithPreview() {
    if (!record) return;
    if (!normalized) return;

    const categoryValue = resolveCategoryValue(publishCategoryPreset, publishCategoryOther);
    if (!categoryValue) {
      setPublishError("Please choose a template type (FYB, Sign-out, or Other). ");
      return;
    }
    if (!publishFile) {
      setPublishError("Please upload a preview image before publishing.");
      return;
    }

    setPublishError(null);
    setPublishing(true);
    setBusy(true);
    try {
      // Persist category/type before publishing so lists/search can use it.
      const updated = await repo.upsertDraft({
        id: record.id,
        name: record.name,
        category: categoryValue,
        designJson: record.designJson,
        normalized: record.normalized,
        fieldConfig: record.fieldConfig,
      });
      setRecord(updated);

      const { width, height } = await getImageDimensionsFromBlob(publishFile);
      await repo.attachPreview({ templateId: record.id, blob: publishFile, width, height });
      await repo.setStatus(record.id, "published");
      closePublishModal();
      router.push("/admin/templates");
      router.refresh();
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : "Failed to publish template");
    } finally {
      setBusy(false);
      setPublishing(false);
    }
  }

  async function updateFieldConfig(nextConfig: TemplateRecord["fieldConfig"]) {
    if (!record) return;
    const { id, name, designJson, normalized: normalizedAny } = record;
    setRecord({ ...record, fieldConfig: nextConfig });
    setSavingConfig(true);
    setError(null);

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(async () => {
      try {
        const updated = await repo.upsertDraft({
          id,
          name,
          designJson,
          normalized: normalizedAny,
          fieldConfig: nextConfig,
        });
        setRecord(updated);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save configuration");
      } finally {
        setSavingConfig(false);
      }
    }, 350);
  }

  function onPreviewTextChange(nodeId: string, value: string) {
    const field = record?.fieldConfig.fields.find(
      (f): f is Extract<typeof f, { kind: "text" }> => f.nodeId === nodeId && f.kind === "text",
    );
    const mode = field?.textBehavior?.case ?? "as_design";
    const nextValue =
      mode === "upper"
        ? value.toUpperCase()
        : mode === "lower"
          ? value.toLowerCase()
          : mode === "title"
            ? value.replace(/\b\w+/g, (w) => w.slice(0, 1).toUpperCase() + w.slice(1).toLowerCase())
            : value;
    setPreviewTextByNodeId((prev) => ({ ...prev, [nodeId]: nextValue }));
  }

  function onPreviewColorChange(nodeId: string, value: string) {
    setPreviewColorByNodeId((prev) => ({ ...prev, [nodeId]: value }));
  }

  function onPreviewImageChange(nodeId: string, file: File | null) {
    setPreviewImageByNodeId((prev) => {
      const existing = prev[nodeId];
      if (existing?._revoke) URL.revokeObjectURL(existing.url);

      if (!file) {
        const next = { ...prev };
        delete next[nodeId];
        return next;
      }

      const url = URL.createObjectURL(file);
      const imageField = record?.fieldConfig.fields.find(
        (f): f is Extract<typeof f, { kind: "image" }> => f.nodeId === nodeId && f.kind === "image",
      );
      const fit = imageField?.imageBehavior?.fit ?? (imageField?.cropRule === "contain" ? "contain" : "cover");
      return {
        ...prev,
        [nodeId]: {
          url,
          objectFit: fit,
          _revoke: true,
        },
      };
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-col gap-3 border-b border-zinc-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800 dark:bg-zinc-900">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Link href="/admin/templates" className="text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-50">
              Templates
            </Link>
            <span className="text-sm text-zinc-400 dark:text-zinc-500">/</span>
            <h1 className="truncate text-lg font-semibold tracking-tight text-zinc-950 dark:text-zinc-100">
              {record.name}
            </h1>
            <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
              {record.status}
            </span>
          </div>
          {savingConfig ? (
            <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
              <span className="rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                Saving…
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {warnings.length ? (
            <button
              type="button"
              onClick={() => setWarningsModalOpen(true)}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 px-3 text-xs font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100 dark:hover:bg-amber-950/40"
              title="View normalization warnings"
            >
              Warnings ({warnings.length})
            </button>
          ) : null}

          {!normalized ? (
            <button
              type="button"
              onClick={normalizeNow}
              disabled={busy}
              className="inline-flex h-9 items-center justify-center rounded-xl bg-zinc-900 px-3 text-xs font-medium text-white disabled:opacity-50"
            >
              {busy ? "Normalizing…" : "Normalize"}
            </button>
          ) : (
            <button
              type="button"
              onClick={normalizeNow}
              disabled={busy}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              title="Re-run normalization (updates fonts/assets/bounds from design JSON)"
            >
              Re-normalize
            </button>
          )}

          {record.status === "draft" ? (
            <button
              type="button"
              onClick={openPublishModal}
              disabled={busy || !normalized}
              className="inline-flex h-9 items-center justify-center rounded-xl bg-emerald-600 px-3 text-xs font-medium text-white disabled:opacity-50"
              title={!normalized ? "Normalize before publishing" : undefined}
            >
              Publish
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setStatus("draft")}
              disabled={busy}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              Unpublish
            </button>
          )}
        </div>
      </header>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : null}

      {!normalized ? (
        <div className="flex-1 p-6">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            <div className="font-medium">Normalization required</div>
            <div className="mt-1 text-xs">
              This template has raw design JSON but no normalized schema yet.
            </div>
            <button
              type="button"
              onClick={normalizeNow}
              disabled={busy}
              className="mt-3 inline-flex h-9 items-center justify-center rounded-xl bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              {busy ? "Normalizing…" : "Normalize now"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 min-w-0">
          <aside className="hidden h-full flex-col bg-white lg:flex lg:basis-1/4 lg:max-w-[25%] dark:bg-zinc-900">
            <IconsFontsPanel design={normalized} />
          </aside>

          <div className="flex min-w-0 flex-1 flex-col overflow-hidden p-4 lg:basis-1/2 lg:max-w-[50%]">
            <div className="h-full min-h-0 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <DesignWorkspace
                design={normalized}
                fieldConfig={record.fieldConfig}
                previewTextByNodeId={previewTextByNodeId}
                previewImageByNodeId={renderImageByNodeId}
                previewColorByNodeId={previewColorByNodeId}
                selectedNodeId={selectedNodeId}
              />
            </div>
          </div>

          <aside className="hidden h-full flex-col border-l border-zinc-200 bg-white lg:flex lg:basis-1/4 lg:max-w-[25%] dark:border-zinc-800 dark:bg-zinc-900">
            <div className="h-full min-h-0 overflow-y-auto p-4">
              <FieldConfigPanel
                design={normalized}
                config={record.fieldConfig}
                onChange={updateFieldConfig}
                selectedNodeId={selectedNodeId}
                onSelectNodeId={setSelectedNodeId}
                previewTextByNodeId={previewTextByNodeId}
                onPreviewTextChange={onPreviewTextChange}
                onPreviewImageChange={onPreviewImageChange}
                previewColorByNodeId={previewColorByNodeId}
                onPreviewColorChange={onPreviewColorChange}
                templateId={id}
                onDesignAssetsChanged={reloadDesignAssets}
              />
            </div>
          </aside>
        </div>
      )}

      {publishModalOpen ? (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => {
              if (publishing) return;
              closePublishModal();
            }}
          />

          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
              <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
                <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">Upload Template Preview</div>
                <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                  This image will be displayed to users on the Templates page.
                </div>
              </div>

              <div className="space-y-4 px-5 py-4">
                <div>
                  <div className="text-xs font-semibold text-zinc-950 dark:text-zinc-100">Template type</div>
                  <div className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-300">
                    Used for labeling and filtering on the gallery.
                  </div>
                  <div className="mt-2 grid gap-2">
                    <select
                      value={publishCategoryPreset}
                      onChange={(e) => setPublishCategoryPreset(e.target.value as TemplateCategoryPreset)}
                      disabled={publishing}
                      className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                    >
                      <option value="fyb">FYB</option>
                      <option value="signout">Sign-out</option>
                      <option value="other">Other</option>
                    </select>

                    {publishCategoryPreset === "other" ? (
                      <input
                        value={publishCategoryOther}
                        onChange={(e) => setPublishCategoryOther(e.target.value)}
                        disabled={publishing}
                        placeholder="Enter custom type (e.g. Department Banner)"
                        className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-emerald-500/40 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                      />
                    ) : null}
                  </div>
                </div>

                <ImageUpload
                  label="Preview image"
                  description="Drag & drop or click to choose."
                  accept="image/*"
                  objectFit="contain"
                  valueUrl={publishPreviewUrl ?? undefined}
                  valueName={publishFile ? `${publishFile.name} • ${Math.round(publishFile.size / 1024)} KB` : undefined}
                  disabled={publishing}
                  onPick={onPickPublishPreview}
                  onClear={
                    publishing
                      ? undefined
                      : () => {
                          setPublishFile(null);
                          if (publishPreviewUrl) {
                            URL.revokeObjectURL(publishPreviewUrl);
                            setPublishPreviewUrl(null);
                          }
                        }
                  }
                />

                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/30">
                  <div className="text-xs font-semibold text-zinc-950 dark:text-zinc-100">Guidelines</div>
                  <ul className="mt-2 space-y-1 text-[11px] leading-4 text-zinc-600 dark:text-zinc-300">
                    <li>Recommended formats: PNG, JPG, WebP</li>
                    <li>Suggested aspect ratio: 4:5</li>
                    <li>Minimum resolution: 1200×1500</li>
                    <li>Max file size: 5MB</li>
                  </ul>
                </div>

                {publishError ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200">
                    {publishError}
                  </div>
                ) : null}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-zinc-200 px-5 py-4 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={closePublishModal}
                  disabled={publishing}
                  className="inline-flex h-9 items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmPublishWithPreview}
                  disabled={publishing || !publishFile || !resolveCategoryValue(publishCategoryPreset, publishCategoryOther)}
                  className="inline-flex h-9 items-center justify-center rounded-xl bg-emerald-600 px-3 text-xs font-medium text-white disabled:opacity-50"
                >
                  {publishing ? "Publishing…" : "Publish"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <ProgressModal
        open={normalizing}
        title="Normalizing design"
        subtitle={
          normalizeProgress < 0.25
            ? "Reading layers and bounds"
            : normalizeProgress < 0.65
              ? "Extracting text styles, vectors, and images"
              : "Applying updates and refreshing the editor"
        }
        percent={Math.round(normalizeProgress * 100)}
        hint="We’re rebuilding the normalized schema from the raw JSON."
      />

      <ProgressModal
        open={publishing}
        title="Publishing"
        subtitle={
          publishProgress < 0.5
            ? "Uploading preview image"
            : publishProgress < 0.9
              ? "Saving status and indexing template"
              : "Finalizing"
        }
        percent={Math.round(publishProgress * 100)}
        hint="Your template will appear on the Templates page once finished."
      />

      <NormalizationWarningsModal
        open={warningsModalOpen}
        onClose={() => setWarningsModalOpen(false)}
        warnings={warnings}
        resolveNodeLabel={(nodeId) => {
          const node = normalized?.nodesById[nodeId];
          return node?.name || node?.figmaType;
        }}
      />
    </div>
  );
}

