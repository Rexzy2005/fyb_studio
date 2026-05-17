"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { normalizeFigmaExport, type NormalizedDesignV1 } from "@/lib/figma";
import { composeImageMap } from "@/lib/render/composeImageMap";
import { useDesignAssets } from "@/lib/render/useDesignAssets";
import { usePluginImages } from "@/lib/render/usePluginImages";
import { createLocalTemplateRepository } from "@/lib/storage/templateRepo";
import type { TemplateRecord } from "@/lib/storage/types";
import { DesignWorkspace } from "@/components/editor/DesignWorkspace";
import { FieldConfigPanel } from "@/components/editor/FieldConfigPanel";
import { PreviewFormModal } from "@/components/editor/PreviewFormModal";
import { Eye } from "lucide-react";
import { useTemplateEditorStore } from "@/lib/stores/templateEditorStore";
import { useEditorDirty } from "@/lib/stores/editorDirtyStore";
import { useGoogleFonts } from "@/components/editor/useGoogleFonts";
import { ImageUpload } from "@/components/forms/ImageUpload";
import { ProgressModal } from "@/components/ui/ProgressModal";
import { useSimulatedProgress } from "@/components/ui/useSimulatedProgress";
import { NormalizationWarningsModal } from "@/components/ui/NormalizationWarningsModal";
import {
  fetchAdminTemplate,
  publishTemplateToBackend,
  unpublishTemplate,
  updateTemplateOnBackend,
  type RemoteTemplate,
} from "@/lib/api/adminTemplates";

type EditorMode = "draft" | "published";

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
  const [mode, setMode] = useState<EditorMode | null>(null);
  const [record, setRecord] = useState<TemplateRecord | null>(null);
  const [remoteAssets, setRemoteAssets] = useState<RemoteTemplate["designAssets"]>([]);
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

  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [updateCoverFile, setUpdateCoverFile] = useState<File | null>(null);
  const [updateCoverUrl, setUpdateCoverUrl] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  const [unpublishModalOpen, setUnpublishModalOpen] = useState(false);
  const [unpublishConfirmInput, setUnpublishConfirmInput] = useState("");
  const [unpublishError, setUnpublishError] = useState<string | null>(null);
  const [unpublishing, setUnpublishing] = useState(false);

  const [warningsModalOpen, setWarningsModalOpen] = useState(false);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);

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

  const localAssetTemplateId = mode === "draft" ? id : null;
  const { designAssetImageByNodeId: localDesignAssets, reloadDesignAssets } =
    useDesignAssets(localAssetTemplateId);

  const remoteDesignAssetMap = useMemo(() => {
    if (mode !== "published") return {};
    const out: Record<string, { url: string; objectFit: "cover" | "contain" }> = {};
    for (const a of remoteAssets) {
      out[a.nodeId] = { url: a.url, objectFit: "cover" };
    }
    return out;
  }, [mode, remoteAssets]);

  const designAssetImageByNodeId =
    mode === "published" ? remoteDesignAssetMap : localDesignAssets;

  const normalizedForFonts = (record?.normalized as NormalizedDesignV1 | undefined) ?? undefined;
  const pluginImageByNodeId = usePluginImages(normalizedForFonts);

  const renderImageByNodeId = useMemo(
    () =>
      composeImageMap(
        previewImageByNodeId,
        designAssetImageByNodeId,
        record?.fieldConfig,
        pluginImageByNodeId,
      ),
    [previewImageByNodeId, designAssetImageByNodeId, record?.fieldConfig, pluginImageByNodeId],
  );
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
      if (updateCoverUrl) URL.revokeObjectURL(updateCoverUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const local = await repo.get(id);
        if (cancelled) return;
        if (local) {
          setMode("draft");
          setRecord(local);
          setRemoteAssets([]);
          return;
        }

        const remote = await fetchAdminTemplate(id);
        if (cancelled) return;
        if (!remote) {
          setError("Template not found");
          return;
        }

        setMode("published");
        setRemoteAssets(remote.designAssets);
        setRecord({
          id: remote.id,
          name: remote.name,
          category: remote.category ?? undefined,
          status: "published",
          createdAt: remote.publishedAt,
          updatedAt: remote.updatedAt,
          designJson: remote.designJson,
          normalized: remote.normalized,
          fieldConfig: remote.fieldConfig as TemplateRecord["fieldConfig"],
          previewId: undefined,
        });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unknown error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, repo]);

  // Dirty-store wiring. Declared HERE (above the early returns below) because
  // hooks must be invoked unconditionally on every render - relocating them
  // past `if (error) return …` would change the hook order between renders.
  const setDirty = useEditorDirty((s) => s.setDirty);
  const setFlushSave = useEditorDirty((s) => s.setFlushSave);
  const resetDirtyStore = useEditorDirty((s) => s.reset);

  // Latest record snapshot - held in a ref so flushSave (registered once with
  // the dirty store) always sees the freshest state when invoked from the shell.
  const latestRecordRef = useRef<TemplateRecord | null>(null);
  useEffect(() => {
    latestRecordRef.current = record;
  }, [record]);

  /**
   * Synchronously flush any pending debounced save. Returns once the write
   * has landed in storage. Registered with the dirty store so the admin
   * shell can call it when the user picks "Save & continue" on the
   * unsaved-changes prompt - guarantees no edits get lost on navigation.
   */
  const flushPendingSave = useCallback(async () => {
    const current = latestRecordRef.current;
    if (!current || mode !== "draft") return;
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    setSavingConfig(true);
    try {
      await repo.upsertDraft({
        id: current.id,
        name: current.name,
        designJson: current.designJson,
        normalized: current.normalized,
        fieldConfig: current.fieldConfig,
      });
      setDirty(false);
    } finally {
      setSavingConfig(false);
    }
  }, [mode, repo, setDirty]);

  // Register/unregister the flush callback with the dirty store. Cleared on
  // unmount + when leaving draft mode so the prompt won't fire stale.
  useEffect(() => {
    setFlushSave(mode === "draft" ? flushPendingSave : null);
    return () => {
      // Only clear what we registered - the next mount will set its own.
      resetDirtyStore();
    };
  }, [mode, flushPendingSave, setFlushSave, resetDirtyStore]);

  if (error) {
    return (
      <div className="rounded-xl border border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.08)] p-4 text-sm text-danger dark:border-[rgba(239,68,68,0.28)] dark:bg-red-950/40 dark:text-danger">
        {error}
      </div>
    );
  }

  if (!record) {
    return (
      <div className="min-h-dvh bg-canvas dark:bg-canvas">
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
    if (mode !== "draft") {
      setError("Re-normalization is only available for drafts. Unpublish to re-normalize.");
      return;
    }
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
    if (mode !== "draft") return;

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
      await publishTemplateToBackend({
        name: record.name,
        category: categoryValue,
        designJson: record.designJson,
        normalized: record.normalized,
        fieldConfig: record.fieldConfig,
        coverFile: publishFile,
      });

      await repo.delete(record.id);
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

  function openUpdateModal() {
    setUpdateError(null);
    setUpdateCoverFile(null);
    if (updateCoverUrl) {
      URL.revokeObjectURL(updateCoverUrl);
      setUpdateCoverUrl(null);
    }
    setUpdateModalOpen(true);
  }

  function closeUpdateModal() {
    setUpdateModalOpen(false);
    setUpdateError(null);
    setUpdateCoverFile(null);
    if (updateCoverUrl) {
      URL.revokeObjectURL(updateCoverUrl);
      setUpdateCoverUrl(null);
    }
  }

  function onPickUpdateCover(file: File) {
    setUpdateError(null);
    if (!file.type.startsWith("image/")) {
      setUpdateError("Please upload an image file (PNG, JPG, or WebP).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUpdateError("Cover image must be under 5MB.");
      return;
    }
    if (updateCoverUrl) URL.revokeObjectURL(updateCoverUrl);
    setUpdateCoverFile(file);
    setUpdateCoverUrl(URL.createObjectURL(file));
  }

  async function confirmUpdate() {
    if (!record || mode !== "published") return;
    setUpdateError(null);
    setUpdating(true);
    setBusy(true);
    try {
      const updated = await updateTemplateOnBackend({
        templateId: record.id,
        name: record.name,
        category: record.category ?? null,
        designJson: record.designJson,
        normalized: record.normalized,
        fieldConfig: record.fieldConfig,
        replaceCoverFile: updateCoverFile,
      });
      setRecord({
        id: updated.id,
        name: updated.name,
        category: updated.category ?? undefined,
        status: "published",
        createdAt: updated.publishedAt,
        updatedAt: updated.updatedAt,
        designJson: updated.designJson,
        normalized: updated.normalized,
        fieldConfig: updated.fieldConfig as TemplateRecord["fieldConfig"],
        previewId: undefined,
      });
      setRemoteAssets(updated.designAssets);
      closeUpdateModal();
    } catch (e) {
      setUpdateError(e instanceof Error ? e.message : "Failed to update template");
    } finally {
      setBusy(false);
      setUpdating(false);
    }
  }

  function openUnpublishModal() {
    setUnpublishConfirmInput("");
    setUnpublishError(null);
    setUnpublishModalOpen(true);
  }

  function closeUnpublishModal() {
    if (unpublishing) return;
    setUnpublishModalOpen(false);
    setUnpublishConfirmInput("");
    setUnpublishError(null);
  }

  async function confirmUnpublish() {
    if (!record || mode !== "published") return;
    if (unpublishConfirmInput.trim() !== record.name.trim()) {
      setUnpublishError("Name doesn't match. Please type it exactly.");
      return;
    }
    setUnpublishError(null);
    setUnpublishing(true);
    setBusy(true);
    try {
      await unpublishTemplate(record.id, unpublishConfirmInput.trim());
      router.push("/admin/templates");
      router.refresh();
    } catch (e) {
      setUnpublishError(e instanceof Error ? e.message : "Failed to unpublish");
      setUnpublishing(false);
      setBusy(false);
    }
  }

  /**
   * Persist a draft snapshot to local storage with a 350ms debounce.
   * Trailing-edge: the most recent change wins, prior in-flight writes are
   * cancelled. Triggered by any editable field (name, fieldConfig). Published
   * templates skip the debounced save - their edits are committed via the
   * explicit Update flow.
   *
   * Also flips the cross-cutting `dirty` flag so the admin shell can prompt
   * before navigation if the debounce hasn't settled yet.
   */
  function scheduleDraftSave(next: TemplateRecord) {
    if (mode !== "draft") return;
    setSavingConfig(true);
    setError(null);
    setDirty(true);
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(async () => {
      saveTimerRef.current = null;
      try {
        const updated = await repo.upsertDraft({
          id: next.id,
          name: next.name,
          designJson: next.designJson,
          normalized: next.normalized,
          fieldConfig: next.fieldConfig,
        });
        setRecord(updated);
        setDirty(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save draft");
      } finally {
        setSavingConfig(false);
      }
    }, 350);
  }

  async function updateFieldConfig(nextConfig: TemplateRecord["fieldConfig"]) {
    if (!record) return;
    const next = { ...record, fieldConfig: nextConfig };
    setRecord(next);
    scheduleDraftSave(next);
  }

  function updateName(nextName: string) {
    if (!record) return;
    const next = { ...record, name: nextName };
    setRecord(next);
    scheduleDraftSave(next);
  }

  /**
   * Flush any pending debounced save and persist immediately, then navigate
   * the admin to the templates list. Used by the explicit "Save to draft"
   * button so admins always know their work is durably stored.
   */
  async function saveDraftAndExit() {
    if (!record) return;
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    setSavingConfig(true);
    try {
      await repo.upsertDraft({
        id: record.id,
        name: record.name,
        designJson: record.designJson,
        normalized: record.normalized,
        fieldConfig: record.fieldConfig,
      });
      router.push("/admin/templates");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save draft");
    } finally {
      setSavingConfig(false);
    }
  }

  function cancelAndStartOver() {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    router.push("/admin/templates/new");
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
      <header className="flex flex-col gap-3 border-b border-hairline bg-surface-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-hairline dark:bg-surface-1">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Link
            href="/admin/templates"
            className="shrink-0 text-sm font-medium text-ink-muted hover:text-ink dark:text-ink-muted dark:hover:text-ink"
          >
            Templates
          </Link>
          <span className="shrink-0 text-sm text-ink-faint dark:text-ink-faint">/</span>
          <input
            type="text"
            value={record.name}
            onChange={(e) => updateName(e.target.value)}
            disabled={mode !== "draft"}
            placeholder="Untitled template"
            aria-label="Template name"
            className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-lg font-semibold tracking-tight text-ink outline-none transition focus:border-hairline hover:border-hairline disabled:cursor-not-allowed disabled:hover:border-transparent dark:text-ink dark:hover:border-hairline dark:focus:border-accent-blue"
          />
          <span className="shrink-0 rounded-full bg-surface-2 px-2 py-1 text-xs font-medium text-ink-muted dark:bg-surface-2 dark:text-ink">
            {record.status}
          </span>
          {savingConfig ? (
            <span className="shrink-0 rounded-full bg-surface-2 px-2 py-1 text-[11px] font-medium text-ink-muted dark:bg-surface-2 dark:text-ink">
              Saving…
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {warnings.length ? (
            <button
              type="button"
              onClick={() => setWarningsModalOpen(true)}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-[rgba(245,158,11,0.28)] bg-[rgba(245,158,11,0.08)] px-3 text-xs font-medium text-warning hover:bg-[rgba(245,158,11,0.16)] dark:border-[rgba(245,158,11,0.28)] dark:bg-[rgba(245,158,11,0.12)] dark:text-warning dark:hover:bg-[rgba(245,158,11,0.16)]"
              title="View normalization warnings"
            >
              Warnings ({warnings.length})
            </button>
          ) : null}

          {normalized ? (
            <button
              type="button"
              onClick={() => setPreviewModalOpen(true)}
              disabled={busy}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-hairline bg-surface-1 px-3 text-xs font-medium text-ink hover:bg-canvas disabled:opacity-50 dark:border-hairline dark:bg-surface-1 dark:text-ink dark:hover:bg-surface-2"
              title="Open the preview form to test how users will fill it"
            >
              <Eye className="h-3.5 w-3.5" />
              Preview
            </button>
          ) : null}

          {!normalized ? (
            <button
              type="button"
              onClick={normalizeNow}
              disabled={busy}
              className="inline-flex h-9 items-center justify-center rounded-xl bg-surface-1 px-3 text-xs font-medium text-white disabled:opacity-50"
            >
              {busy ? "Normalizing…" : "Normalize"}
            </button>
          ) : (
            <button
              type="button"
              onClick={normalizeNow}
              disabled={busy}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-hairline bg-surface-1 px-3 text-xs font-medium text-ink hover:bg-canvas disabled:opacity-50 dark:border-hairline dark:bg-surface-1 dark:text-ink dark:hover:bg-surface-2"
              title="Re-run normalization (updates fonts/assets/bounds from design JSON)"
            >
              Re-normalize
            </button>
          )}

          {mode === "draft" ? (
            <>
              <button
                type="button"
                onClick={cancelAndStartOver}
                disabled={busy}
                className="inline-flex h-9 items-center justify-center rounded-xl border border-hairline bg-surface-1 px-3 text-xs font-medium text-ink hover:bg-canvas disabled:opacity-50 dark:border-hairline dark:bg-surface-1 dark:text-ink dark:hover:bg-surface-2"
                title="Discard this session and upload a new design"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveDraftAndExit}
                disabled={busy || savingConfig}
                className="inline-flex h-9 items-center justify-center rounded-xl border border-hairline bg-surface-1 px-3 text-xs font-medium text-ink hover:bg-canvas disabled:opacity-50 dark:border-hairline dark:bg-surface-1 dark:text-ink dark:hover:bg-surface-2"
                title="Save current state and return to the templates list"
              >
                Save to draft
              </button>
              <button
                type="button"
                onClick={openPublishModal}
                disabled={busy || !normalized}
                className="inline-flex h-9 items-center justify-center rounded-xl bg-[var(--accent-blue)] px-3 text-xs font-medium text-white disabled:opacity-50"
                title={!normalized ? "Normalize before publishing" : undefined}
              >
                Publish
              </button>
            </>
          ) : null}

          {mode === "published" ? (
            <>
              <button
                type="button"
                onClick={openUpdateModal}
                disabled={busy}
                className="inline-flex h-9 items-center justify-center rounded-xl bg-[var(--accent-blue)] px-3 text-xs font-medium text-white disabled:opacity-50"
              >
                Update
              </button>
              <button
                type="button"
                onClick={openUnpublishModal}
                disabled={busy}
                className="inline-flex h-9 items-center justify-center rounded-xl border border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.08)] px-3 text-xs font-medium text-danger hover:bg-[rgba(239,68,68,0.12)] disabled:opacity-50 dark:border-[rgba(239,68,68,0.28)] dark:bg-[rgba(239,68,68,0.12)] dark:text-danger dark:hover:bg-red-950/50"
              >
                Unpublish
              </button>
            </>
          ) : null}
        </div>
      </header>

      {error ? (
        <div className="rounded-xl border border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.08)] p-4 text-sm text-danger dark:border-[rgba(239,68,68,0.28)] dark:bg-red-950/40 dark:text-danger">
          {error}
        </div>
      ) : null}

      {!normalized ? (
        <div className="flex-1 p-6">
          <div className="rounded-2xl border border-[rgba(245,158,11,0.28)] bg-[rgba(245,158,11,0.08)] p-6 text-sm text-warning dark:border-[rgba(245,158,11,0.32)] dark:bg-[rgba(245,158,11,0.12)] dark:text-warning">
            <div className="font-medium">Normalization required</div>
            <div className="mt-1 text-xs">
              This template has raw design JSON but no normalized schema yet.
            </div>
            <button
              type="button"
              onClick={normalizeNow}
              disabled={busy}
              className="mt-3 inline-flex h-9 items-center justify-center rounded-xl bg-surface-1 px-3 text-xs font-medium text-white hover:bg-surface-2 disabled:opacity-50 dark:bg-surface-2 dark:text-ink dark:hover:bg-surface-1"
            >
              {busy ? "Normalizing…" : "Normalize now"}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 min-w-0">
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden p-2 lg:basis-3/4 lg:max-w-[75%]">
            <div className="h-full min-h-0 overflow-hidden rounded-2xl border border-hairline bg-surface-1 dark:border-hairline dark:bg-surface-1">
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

          <aside className="hidden h-full flex-col border-l border-hairline bg-surface-1 lg:flex lg:basis-1/4 lg:max-w-[25%] dark:border-hairline dark:bg-surface-1">
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
                templateId={mode === "draft" ? id : null}
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
            <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-hairline bg-surface-1 shadow-2xl dark:border-hairline dark:bg-surface-1">
              <div className="border-b border-hairline px-5 py-4 dark:border-hairline">
                <div className="text-sm font-semibold text-ink dark:text-ink">Upload Template Preview</div>
                <div className="mt-1 text-xs text-ink-muted dark:text-ink-muted">
                  This image will be displayed to users on the Templates page.
                </div>
              </div>

              <div className="space-y-4 px-5 py-4">
                <div>
                  <div className="text-xs font-semibold text-ink dark:text-ink">Template type</div>
                  <div className="mt-1 text-[11px] text-ink-muted dark:text-ink-muted">
                    Used for labeling and filtering on the gallery.
                  </div>
                  <div className="mt-2 grid gap-2">
                    <select
                      value={publishCategoryPreset}
                      onChange={(e) => setPublishCategoryPreset(e.target.value as TemplateCategoryPreset)}
                      disabled={publishing}
                      className="h-10 w-full rounded-xl border border-hairline bg-surface-1 px-3 text-sm text-ink shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--accent-blue-ring)] disabled:opacity-50 dark:border-hairline dark:bg-surface-1 dark:text-ink"
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
                        className="h-10 w-full rounded-xl border border-hairline bg-surface-1 px-3 text-sm text-ink shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--accent-blue-ring)] disabled:opacity-50 dark:border-hairline dark:bg-surface-1 dark:text-ink"
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

                <div className="rounded-2xl border border-hairline bg-canvas p-3 dark:border-hairline dark:bg-surface-2/30">
                  <div className="text-xs font-semibold text-ink dark:text-ink">Guidelines</div>
                  <ul className="mt-2 space-y-1 text-[11px] leading-4 text-ink-muted dark:text-ink-muted">
                    <li>Recommended formats: PNG, JPG, WebP</li>
                    <li>Suggested aspect ratio: 4:5</li>
                    <li>Minimum resolution: 1200×1500</li>
                    <li>Max file size: 5MB</li>
                  </ul>
                </div>

                {publishError ? (
                  <div className="rounded-xl border border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.08)] p-3 text-xs text-danger dark:border-[rgba(239,68,68,0.28)] dark:bg-red-950/40 dark:text-danger">
                    {publishError}
                  </div>
                ) : null}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-hairline px-5 py-4 dark:border-hairline">
                <button
                  type="button"
                  onClick={closePublishModal}
                  disabled={publishing}
                  className="inline-flex h-9 items-center justify-center rounded-xl border border-hairline bg-surface-1 px-3 text-xs font-medium text-ink hover:bg-canvas disabled:opacity-50 dark:border-hairline dark:bg-surface-1 dark:text-ink dark:hover:bg-surface-2"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmPublishWithPreview}
                  disabled={publishing || !publishFile || !resolveCategoryValue(publishCategoryPreset, publishCategoryOther)}
                  className="inline-flex h-9 items-center justify-center rounded-xl bg-[var(--accent-blue)] px-3 text-xs font-medium text-white disabled:opacity-50"
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

      <PreviewFormModal
        open={previewModalOpen}
        onClose={() => setPreviewModalOpen(false)}
        config={record.fieldConfig}
        previewTextByNodeId={previewTextByNodeId}
        previewImageByNodeId={previewImageByNodeId}
        previewColorByNodeId={previewColorByNodeId}
        onPreviewTextChange={onPreviewTextChange}
        onPreviewImageChange={onPreviewImageChange}
        onPreviewColorChange={onPreviewColorChange}
      />

      {updateModalOpen ? (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => {
              if (updating) return;
              closeUpdateModal();
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-hairline bg-surface-1 shadow-2xl dark:border-hairline dark:bg-surface-1">
              <div className="border-b border-hairline px-5 py-4 dark:border-hairline">
                <div className="text-sm font-semibold text-ink dark:text-ink">
                  Update published template
                </div>
                <div className="mt-1 text-xs text-ink-muted dark:text-ink-muted">
                  Replace the cover photo, or skip to keep the current one.
                </div>
              </div>

              <div className="space-y-4 px-5 py-4">
                <ImageUpload
                  label="Cover photo (optional)"
                  description="Drag & drop or click to choose. Skip to keep the current cover."
                  accept="image/*"
                  objectFit="contain"
                  valueUrl={updateCoverUrl ?? undefined}
                  valueName={
                    updateCoverFile
                      ? `${updateCoverFile.name} • ${Math.round(updateCoverFile.size / 1024)} KB`
                      : undefined
                  }
                  disabled={updating}
                  onPick={onPickUpdateCover}
                  onClear={
                    updating
                      ? undefined
                      : () => {
                          setUpdateCoverFile(null);
                          if (updateCoverUrl) {
                            URL.revokeObjectURL(updateCoverUrl);
                            setUpdateCoverUrl(null);
                          }
                        }
                  }
                />

                <div className="rounded-2xl border border-hairline bg-canvas p-3 text-[11px] text-ink-muted dark:border-hairline dark:bg-surface-2/30 dark:text-ink-muted">
                  Updates push silently to all users in real time. Locked images
                  cannot be replaced from this screen - unpublish and republish to
                  swap them.
                </div>

                {updateError ? (
                  <div className="rounded-xl border border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.08)] p-3 text-xs text-danger dark:border-[rgba(239,68,68,0.28)] dark:bg-red-950/40 dark:text-danger">
                    {updateError}
                  </div>
                ) : null}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-hairline px-5 py-4 dark:border-hairline">
                <button
                  type="button"
                  onClick={closeUpdateModal}
                  disabled={updating}
                  className="inline-flex h-9 items-center justify-center rounded-xl border border-hairline bg-surface-1 px-3 text-xs font-medium text-ink hover:bg-canvas disabled:opacity-50 dark:border-hairline dark:bg-surface-1 dark:text-ink dark:hover:bg-surface-2"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmUpdate}
                  disabled={updating}
                  className="inline-flex h-9 items-center justify-center rounded-xl bg-[var(--accent-blue)] px-3 text-xs font-medium text-white disabled:opacity-50"
                >
                  {updating
                    ? "Updating…"
                    : updateCoverFile
                      ? "Update with new cover"
                      : "Update (keep cover)"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {unpublishModalOpen ? (
        <div className="fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={closeUnpublishModal}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="w-full max-w-md overflow-hidden rounded-2xl border border-hairline bg-surface-1 shadow-2xl dark:border-hairline dark:bg-surface-1">
              <div className="border-b border-hairline px-5 py-4 dark:border-hairline">
                <div className="text-sm font-semibold text-danger dark:text-red-300">
                  Unpublish template
                </div>
                <div className="mt-1 text-xs text-ink-muted dark:text-ink-muted">
                  This permanently deletes the template and all its assets from
                  Cloudinary. This action cannot be undone.
                </div>
              </div>

              <div className="space-y-3 px-5 py-4">
                <div className="text-xs text-ink-muted dark:text-ink">
                  Type <span className="font-semibold">{record?.name}</span> to confirm.
                </div>
                <input
                  value={unpublishConfirmInput}
                  onChange={(e) => setUnpublishConfirmInput(e.target.value)}
                  disabled={unpublishing}
                  placeholder={record?.name ?? ""}
                  className="h-10 w-full rounded-xl border border-hairline bg-surface-1 px-3 text-sm text-ink shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-red-500/40 disabled:opacity-50 dark:border-hairline dark:bg-surface-1 dark:text-ink"
                />
                {unpublishError ? (
                  <div className="rounded-xl border border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.08)] p-3 text-xs text-danger dark:border-[rgba(239,68,68,0.28)] dark:bg-red-950/40 dark:text-danger">
                    {unpublishError}
                  </div>
                ) : null}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-hairline px-5 py-4 dark:border-hairline">
                <button
                  type="button"
                  onClick={closeUnpublishModal}
                  disabled={unpublishing}
                  className="inline-flex h-9 items-center justify-center rounded-xl border border-hairline bg-surface-1 px-3 text-xs font-medium text-ink hover:bg-canvas disabled:opacity-50 dark:border-hairline dark:bg-surface-1 dark:text-ink dark:hover:bg-surface-2"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmUnpublish}
                  disabled={
                    unpublishing ||
                    !record ||
                    unpublishConfirmInput.trim() !== record.name.trim()
                  }
                  className="inline-flex h-9 items-center justify-center rounded-xl bg-red-600 px-3 text-xs font-medium text-white disabled:opacity-50"
                >
                  {unpublishing ? "Deleting…" : "Yes, unpublish"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

