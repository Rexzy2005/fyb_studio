"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowLeft, ChevronLeft, ChevronRight, Menu, X } from "lucide-react";

import type { NormalizedDesignV1 } from "@/lib/figma";
import { composeImageMap } from "@/lib/render/composeImageMap";
import { usePluginImages } from "@/lib/render/usePluginImages";
import { exportTemplatePng } from "@/lib/render/exportPng";
import { useRemoteDesignAssets } from "@/lib/render/useRemoteDesignAssets";
import { useTemplateEditorStore } from "@/lib/stores/templateEditorStore";
import type { FieldConfig, UserDesignRecord } from "@/lib/storage/types";
import { groupFieldsBySection } from "@/lib/storage/fieldSections";
import { sectionIcon } from "@/components/editor/SectionsManager";
import { FormField } from "@/components/editor/FormField";
import {
  createInProgressDesign,
  findInProgressByTemplate,
  getUserDesign,
  markDownloaded,
  saveInputs,
} from "@/lib/storage/userDesignRepo";
import {
  fetchPublicTemplate,
  type PublicTemplateLockBlock,
} from "@/lib/api/publicTemplates";
import { LockedAccessModal } from "@/components/templates/LockedAccessModal";

import { DesignWorkspace } from "@/components/editor/DesignWorkspace";
import { useGoogleFonts } from "@/components/editor/useGoogleFonts";
import { ImageUpload, inferFileMeta } from "@/components/forms/ImageUpload";
import { PaymentModal } from "@/components/payment/PaymentModal";
import { ProgressModal } from "@/components/ui/ProgressModal";
import { useSimulatedProgress } from "@/components/ui/useSimulatedProgress";
import { fetchActiveGrant, recordDownload } from "@/lib/api/payments";
import {
  clearPendingDownload,
  listPendingDownloads,
} from "@/lib/payment/pendingDownloads";

function deriveCategoryLabel(name: string, explicit: string | null): string {
  const e = explicit?.trim();
  if (e) return e;
  const n = name.toLowerCase();
  if (/(sign\s*-?\s*out|signed\s*out)/.test(n)) return "Sign-out";
  return "FYB";
}


/**
 * Standard export scale for every download. 2× hits the modern HD sweet spot:
 *   - Sharp on retina/4K phones and laptops
 *   - Within Instagram and WhatsApp's preserved-quality ceilings
 *   - Crisp enough for small-format prints (~7×9 inches at 300 dpi)
 *
 * One quality preset = one consistent, professional output. No size pickers,
 * no risk of users accidentally exporting a low-resolution file.
 */
const STANDARD_EXPORT_SCALE = 2;

export default function UseTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: templateId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedDesignId = searchParams.get("userDesignId");
  const { data: session } = useSession();
  const isHead = Boolean(session?.user?.isDepartmentHead);

  const [userDesign, setUserDesign] = useState<UserDesignRecord | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lockBlock, setLockBlock] = useState<PublicTemplateLockBlock | null>(null);
  const [refetchTrigger, setRefetchTrigger] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportStage, setExportStage] = useState<string>("");
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [autoFitNonce, setAutoFitNonce] = useState(0);
  const [mobileFormPage, setMobileFormPage] = useState(0);
  const mobileFormScrollRef = useRef<HTMLDivElement | null>(null);

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [previewTextByNodeId, setPreviewTextByNodeId] = useState<Record<string, string>>({});
  const [previewImageByNodeId, setPreviewImageByNodeId] = useState<Record<
    string,
    { url: string; blob: Blob; objectFit: "cover" | "contain"; _revoke?: boolean }
  >>({});
  const [previewColorByNodeId, setPreviewColorByNodeId] = useState<Record<string, string>>({});
  const previewImagesRef = useRef(previewImageByNodeId);
  const resetView = useTemplateEditorStore((s) => s.resetView);
  const exportProgress = useSimulatedProgress(exporting);

  const userDesignId = userDesign?.id ?? null;
  const fieldConfig = userDesign?.fieldConfig ?? null;
  const normalized = (userDesign?.normalized as NormalizedDesignV1 | undefined) ?? undefined;

  const remoteAssetUrls = useMemo(
    () => userDesign?.assetUrlsByNodeId ?? {},
    [userDesign]
  );
  const { designAssetImageByNodeId } = useRemoteDesignAssets(remoteAssetUrls);

  const pluginImageByNodeId = usePluginImages(normalized);

  const renderImageByNodeId = useMemo(
    () =>
      composeImageMap(
        previewImageByNodeId,
        designAssetImageByNodeId,
        fieldConfig,
        pluginImageByNodeId,
      ),
    [previewImageByNodeId, designAssetImageByNodeId, fieldConfig, pluginImageByNodeId]
  );

  const pageLoading = !userDesign && !loadError;
  const pageProgress = useSimulatedProgress(pageLoading, { start: 0.12, cap: 0.96 });

  useGoogleFonts(["Ms Madi", ...(normalized?.assets.fonts ?? [])]);

  useEffect(() => {
    previewImagesRef.current = previewImageByNodeId;
  }, [previewImageByNodeId]);

  useEffect(() => {
    return () => {
      for (const v of Object.values(previewImagesRef.current)) {
        if (v._revoke) URL.revokeObjectURL(v.url);
      }
    };
  }, []);

  // Load or create the user-design working copy. Always hits the server first
  // to enforce the lock state — even if an IDB record exists.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const remote = await fetchPublicTemplate(templateId);
        if (cancelled) return;

        if (remote.kind === "not-found") {
          setLoadError("Template not found or no longer available.");
          return;
        }

        if (remote.kind === "locked") {
          setLockBlock(remote.lock);
          setUserDesign(null);
          return;
        }

        setLockBlock(null);

        let record: UserDesignRecord | null = null;
        if (requestedDesignId) {
          record = await getUserDesign(requestedDesignId);
        } else {
          record = await findInProgressByTemplate(templateId);
        }

        if (!record) {
          const assetUrlsByNodeId: Record<string, string> = {};
          for (const a of remote.template.designAssets) {
            assetUrlsByNodeId[a.nodeId] = a.url;
          }
          record = await createInProgressDesign({
            templateId: remote.template.id,
            name: remote.template.name,
            categoryLabel: deriveCategoryLabel(
              remote.template.name,
              remote.template.category
            ),
            designJson: remote.template.designJson,
            normalized: remote.template.normalized,
            fieldConfig: remote.template.fieldConfig as FieldConfig,
            assetUrlsByNodeId,
          });
        }

        if (cancelled) return;
        setUserDesign(record);

        // Hydrate workspace state from saved inputs.
        setPreviewTextByNodeId({ ...record.inputs.textByNodeId });
        setPreviewColorByNodeId({ ...record.inputs.colorByNodeId });

        const hydrated: Record<
          string,
          { url: string; blob: Blob; objectFit: "cover" | "contain"; _revoke?: boolean }
        > = {};
        for (const [nodeId, entry] of Object.entries(record.inputs.imageBlobsByNodeId)) {
          const url = URL.createObjectURL(entry.blob);
          hydrated[nodeId] = {
            url,
            blob: entry.blob,
            objectFit: entry.objectFit,
            _revoke: true,
          };
        }
        setPreviewImageByNodeId(hydrated);
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Failed to load template");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [templateId, requestedDesignId, refetchTrigger]);

  useEffect(() => {
    const v = window.localStorage.getItem("fyb:use:sidebar") === "collapsed";
    setSidebarCollapsed(v);
  }, []);

  // Debounced persistence of text/color/image inputs to IDB.
  const persistTimer = useRef<number | null>(null);
  const schedulePersist = useCallback(() => {
    if (!userDesignId) return;
    if (persistTimer.current) window.clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(() => {
      const imageBlobsByNodeId: Record<
        string,
        { blob: Blob; mime: string; objectFit: "cover" | "contain" }
      > = {};
      for (const [nodeId, v] of Object.entries(previewImagesRef.current)) {
        imageBlobsByNodeId[nodeId] = {
          blob: v.blob,
          mime: v.blob.type || "image/png",
          objectFit: v.objectFit,
        };
      }
      void saveInputs(userDesignId, {
        textByNodeId: previewTextByNodeId,
        colorByNodeId: previewColorByNodeId,
        imageBlobsByNodeId,
      });
    }, 300);
  }, [userDesignId, previewTextByNodeId, previewColorByNodeId]);

  useEffect(() => {
    schedulePersist();
    return () => {
      if (persistTimer.current) window.clearTimeout(persistTimer.current);
    };
  }, [schedulePersist, previewImageByNodeId]);

  const hasEdits =
    Object.keys(previewTextByNodeId).length > 0 ||
    Object.keys(previewImageByNodeId).length > 0 ||
    Object.keys(previewColorByNodeId).length > 0;

  // Build the user-form data once and reuse for both desktop sidebar (grouped
  // accordion) and mobile bottom-sheet wizard (one section per screen).
  // Filters out admin-only design-asset images and disabled colour fields so
  // the user never sees slots they can't act on.
  const userFormGroups = useMemo(() => {
    if (!fieldConfig) return [];
    const filtered: FieldConfig = {
      ...fieldConfig,
      fields: fieldConfig.fields.filter((f) => {
        if (f.kind === "image" && f.imageSource === "design_asset") return false;
        if (f.kind === "color" && (f.colorBehavior?.enabled ?? true) === false) return false;
        return true;
      }),
    };
    return groupFieldsBySection(filtered);
  }, [fieldConfig]);

  const desktopGroups = userFormGroups;
  const mobileSections = userFormGroups;
  const mobileSectionCount = Math.max(1, mobileSections.length);
  const currentMobileSection = mobileSections[
    Math.min(mobileFormPage, mobileSections.length - 1)
  ];

  useEffect(() => {
    if (!mobileDetailsOpen) return;
    setMobileFormPage(0);
    const raf = requestAnimationFrame(() => mobileFormScrollRef.current?.scrollTo({ top: 0 }));
    return () => cancelAnimationFrame(raf);
  }, [mobileDetailsOpen]);

  if (loadError) {
    return (
      <div className="min-h-screen bg-zinc-50 p-6 dark:bg-zinc-950">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
          {loadError}
        </div>
      </div>
    );
  }

  if (lockBlock) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
        <LockedAccessModal
          open
          variant={lockBlock.fromSameDept ? "passcode-required" : "blocked"}
          templateId={lockBlock.templateId}
          departmentName={lockBlock.departmentName}
          onClose={() => router.push("/templates")}
          onUnlocked={() => {
            setLockBlock(null);
            setRefetchTrigger((n) => n + 1);
          }}
        />
      </div>
    );
  }

  if (pageLoading || !userDesign || !fieldConfig || !normalized) {
    return (
      <div className="min-h-dvh bg-zinc-50 dark:bg-zinc-950">
        <ProgressModal
          open
          title="Loading template"
          subtitle={
            pageProgress < 0.25
              ? "Fetching template data"
              : pageProgress < 0.65
                ? "Preparing workspace"
                : "Almost ready"
          }
          percent={Math.round(pageProgress * 100)}
          hint="This runs locally in your browser."
        />
      </div>
    );
  }

  const recordName = userDesign.name;

  function onPreviewTextChange(nodeId: string, value: string) {
    const field = fieldConfig?.fields.find(
      (f): f is Extract<typeof f, { kind: "text" }> => f.nodeId === nodeId && f.kind === "text"
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

      const imageField = fieldConfig?.fields.find(
        (f): f is Extract<typeof f, { kind: "image" }> => f.nodeId === nodeId && f.kind === "image"
      );

      if (imageField?.imageBehavior?.allowReplace === false) {
        return prev;
      }

      const url = URL.createObjectURL(file);
      const fit =
        imageField?.imageBehavior?.fit ?? (imageField?.cropRule === "contain" ? "contain" : "cover");

      return {
        ...prev,
        [nodeId]: {
          url,
          blob: file,
          objectFit: fit,
          _revoke: true,
        },
      };
    });
  }

  async function doExportPng(scale: 1 | 2 | 3) {
    if (!userDesign || !normalized || !fieldConfig) return;
    setExporting(true);
    setExportStage("Preparing images");
    try {
      const imageBlobs: Record<string, { blob: Blob; objectFit: "cover" | "contain" }> = {};
      for (const [nodeId, v] of Object.entries(previewImageByNodeId)) {
        imageBlobs[nodeId] = { blob: v.blob, objectFit: v.objectFit };
      }
      for (const f of fieldConfig.fields) {
        if (f.kind !== "image") continue;
        if (f.imageSource !== "design_asset") continue;
        const asset = designAssetImageByNodeId[f.nodeId];
        if (asset) {
          imageBlobs[f.nodeId] = {
            blob: asset.blob,
            objectFit: f.imageBehavior?.fit ?? f.cropRule ?? "cover",
          };
        } else {
          delete imageBlobs[f.nodeId];
        }
      }

      setExportStage("Rendering design");
      const {
        blob,
        width: exportWidth,
        height: exportHeight,
      } = await exportTemplatePng({
        design: normalized,
        fieldConfig,
        previewTextByNodeId,
        previewImageByNodeId: imageBlobs,
        previewColorByNodeId,
        scale,
      });

      setExportStage("Preparing download");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${recordName.replaceAll(/[^a-z0-9-_ ]/gi, "").trim() || "template"}.png`;
      a.click();
      URL.revokeObjectURL(url);

      // Save a thumbnail at scale 1 for the dashboard recents.
      let thumbnail: { blob: Blob; mime: string; width: number; height: number } | null = null;
      try {
        if (scale === 1) {
          thumbnail = {
            blob,
            mime: blob.type || "image/png",
            // Use the bitmap dimensions returned by the exporter — those are
            // already the integer pixel size of the actual PNG. We never
            // re-derive them from the design canvas (which carries fractional
            // values that should not be rounded independently).
            width: exportWidth,
            height: exportHeight,
          };
        } else {
          const {
            blob: thumbBlob,
            width: thumbWidth,
            height: thumbHeight,
          } = await exportTemplatePng({
            design: normalized,
            fieldConfig,
            previewTextByNodeId,
            previewImageByNodeId: imageBlobs,
            previewColorByNodeId,
            scale: 1,
          });
          thumbnail = {
            blob: thumbBlob,
            mime: thumbBlob.type || "image/png",
            width: thumbWidth,
            height: thumbHeight,
          };
        }
      } catch (err) {
        console.warn("[use] thumbnail render failed", err);
      }

      await markDownloaded(userDesign.id, thumbnail);

      // Server-side log + grant consumption. Done AFTER the user has the
      // file so a transient API hiccup doesn't block the download itself;
      // failures are logged but non-fatal. The local pending marker is
      // ALSO cleared on success so the dashboard hides the "Resume" tile.
      try {
        await recordDownload({
          templateId: userDesign.templateId,
          userDesignId: userDesign.id,
          scale,
        });
        // Best effort: drop every local marker for this design (we may not
        // know the exact paystackReference at this layer).
        const markers = listPendingDownloads().filter(
          (p) =>
            p.templateId === userDesign.templateId &&
            (p.userDesignId ?? null) === (userDesign.id ?? null),
        );
        for (const m of markers) clearPendingDownload(m.reference);
      } catch (err) {
        console.warn("[use] recordDownload failed", err);
      }

      // ?justDownloaded=1 nudges the dashboard's FeedbackLauncher to open
      // the survey modal automatically — peak honesty moment. The launcher
      // respects the same "recently submitted" cooldown so heavy users
      // don't get badgered every download.
      router.push("/dashboard?justDownloaded=1");
    } catch (err) {
      console.error("[use] export failed after payment", err);
      // The grant is still active server-side because recordDownload
      // didn't run, AND the local marker is still set. Send the user to
      // the dashboard so they can resume — and never throw the file away.
      router.push("/dashboard?resumePayment=1");
    } finally {
      setExporting(false);
      setExportStage("");
    }
  }

  // One-click HD export, gated by a per-design payment.
  // Flow:
  //   1. Silently check the server for an unconsumed grant (no progress
  //      modal flash — that was creating a confusing "modal twice" UX).
  //   2. If grant exists → start export.
  //   3. Otherwise → open the payment modal; on success its `onPaid`
  //      callback runs the export.
  async function startExport() {
    if (exporting) return;
    if (!userDesign) return;
    let hasGrant = false;
    try {
      const info = await fetchActiveGrant({
        templateId: userDesign.templateId,
        userDesignId: userDesign.id,
      });
      hasGrant = Boolean(info.grant);
    } catch (err) {
      // Transient grant-check failures fall through to the payment modal.
      // The verify endpoint will detect the existing grant if there is one
      // and refund/short-circuit there — better UX than blocking the click.
      console.error("[use] grant check failed", err);
    }
    if (hasGrant) {
      void doExportPng(STANDARD_EXPORT_SCALE);
      return;
    }
    setPaymentModalOpen(true);
  }

  function resetUserWorkspace() {
    for (const v of Object.values(previewImagesRef.current)) {
      if (v._revoke) URL.revokeObjectURL(v.url);
    }
    setPreviewTextByNodeId({});
    setPreviewColorByNodeId({});
    setPreviewImageByNodeId({});
    resetView();
    setAutoFitNonce((n) => n + 1);
  }

  return (
    <div className="flex h-dvh min-w-0 flex-col bg-zinc-50 dark:bg-zinc-950">
      <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-zinc-200 bg-white/90 px-3 py-2 backdrop-blur lg:hidden dark:border-zinc-800 dark:bg-zinc-900/80">
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0 text-center">
          <div className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-100">
            {recordName}
          </div>
          <div className="truncate text-[11px] text-zinc-600 dark:text-zinc-300">Workspace</div>
        </div>
        <button
          type="button"
          onClick={() => setMobileDetailsOpen(true)}
          className="inline-flex h-9 items-center justify-center rounded-xl bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          Details
        </button>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1">
        <aside
          className={
            "hidden h-full flex-col border-r border-zinc-200 bg-white lg:flex dark:border-zinc-800 dark:bg-zinc-900 " +
            (sidebarCollapsed ? "w-18" : "w-65")
          }
        >
          <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-3 py-3 dark:border-zinc-800">
            <div className={"min-w-0 " + (sidebarCollapsed ? "sr-only" : "")}>
              <div className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-100">
                {recordName}
              </div>
              <div className="truncate text-xs text-zinc-600 dark:text-zinc-300">Template</div>
            </div>
            <button
              type="button"
              onClick={() =>
                setSidebarCollapsed((v) => {
                  const next = !v;
                  window.localStorage.setItem("fyb:use:sidebar", next ? "collapsed" : "expanded");
                  return next;
                })
              }
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              title={sidebarCollapsed ? "Expand" : "Collapse"}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          </div>

          <nav className="flex-1 space-y-1 p-3 text-sm">
            <Link
              href="/templates"
              className="block rounded-xl px-3 py-2 text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800/60"
              title="Back to templates"
            >
              <span className={sidebarCollapsed ? "sr-only" : ""}>Back</span>
            </Link>
            {isHead ? (
              <Link
                href={`/templates/${templateId}/preview`}
                className="block rounded-xl px-3 py-2 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-900/20"
                title="Preview & lock for your department"
              >
                <span className={sidebarCollapsed ? "sr-only" : ""}>Preview & lock</span>
              </Link>
            ) : null}
            <div className="mt-2 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/40">
              <div
                className={
                  "text-xs font-medium text-zinc-900 dark:text-zinc-100 " +
                  (sidebarCollapsed ? "sr-only" : "")
                }
              >
                Tips
              </div>
              <div
                className={
                  "mt-1 text-xs text-zinc-600 dark:text-zinc-300 " +
                  (sidebarCollapsed ? "sr-only" : "")
                }
              >
                Pan: Space + drag • Zoom: Ctrl+Wheel
              </div>
            </div>
          </nav>
        </aside>

        <main className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
          <div className="hidden items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 lg:flex dark:border-zinc-800 dark:bg-zinc-900">
            <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">Workspace</div>
            {/* <div className="text-xs text-zinc-600 dark:text-zinc-300">Read-only canvas</div> */}
          </div>

          <div className="flex-1 overflow-hidden p-0 sm:p-2 lg:p-2 xl:p-2">
            <div className="h-full min-h-0 w-full overflow-hidden bg-white sm:rounded-2xl sm:border sm:border-zinc-200 dark:bg-zinc-900 dark:sm:border-zinc-800">
              <DesignWorkspace
                design={normalized}
                fieldConfig={fieldConfig}
                previewTextByNodeId={previewTextByNodeId}
                previewImageByNodeId={renderImageByNodeId}
                selectedNodeId={null}
                previewColorByNodeId={previewColorByNodeId}
                showGuides={false}
                enableSelection={false}
                autoFitOnMount
                autoFitOnResize
                autoFitKey={autoFitNonce}
              />
            </div>
          </div>
        </main>

        <aside className="hidden h-full w-80 flex-col border-l border-zinc-200 bg-white lg:flex xl:w-95 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 px-4 py-2.5 dark:border-zinc-800">
            <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">Your details</div>
            <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
              Generated from admin configuration.
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3 xl:p-4">
            <div className="space-y-3">
              {desktopGroups.map(({ section, fields }) => {
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
                          density="compact"
                        />
                      ))}
                    </div>
                  </details>
                );
              })}
            </div>
          </div>

          <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={exporting || !hasEdits}
                onClick={resetUserWorkspace}
                className="inline-flex h-9 flex-1 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                Reset
              </button>
              <button
                type="button"
                disabled={exporting}
                onClick={startExport}
                className="inline-flex h-9 flex-1 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                {exporting ? "Exporting…" : "Download PNG"}
              </button>
            </div>
          </div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white/90 p-3 backdrop-blur lg:hidden dark:border-zinc-800 dark:bg-zinc-900/80 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
        <div className="mx-auto flex w-full max-w-xl items-center gap-2">
          <button
            type="button"
            disabled={exporting || !hasEdits}
            onClick={resetUserWorkspace}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Reset
          </button>
          <button
            type="button"
            disabled={exporting}
            onClick={startExport}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-2xl bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            {exporting ? "Exporting…" : "Download PNG"}
          </button>
        </div>
      </div>

      {mobileDetailsOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close details"
            onClick={() => setMobileDetailsOpen(false)}
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[82dvh] overflow-hidden rounded-t-3xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {currentMobileSection
                    ? (() => {
                        const Icon = sectionIcon(currentMobileSection.section.icon);
                        return <Icon className="h-4 w-4 shrink-0 text-zinc-700 dark:text-zinc-300" />;
                      })()
                    : null}
                  <div className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-100">
                    {currentMobileSection?.section.label ?? "Your details"}
                  </div>
                </div>
                <div className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-300">
                  Section {Math.min(mobileFormPage + 1, mobileSectionCount)} of {mobileSectionCount}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileDetailsOpen(false)}
                className="inline-flex h-9 items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                Close
              </button>
            </div>

            {/* Section progress dots — tappable for direct jump. */}
            {mobileSectionCount > 1 ? (
              <div className="flex items-center justify-center gap-1.5 border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
                {mobileSections.map((g, idx) => {
                  const active = idx === mobileFormPage;
                  return (
                    <button
                      key={g.section.id}
                      type="button"
                      onClick={() => {
                        setMobileFormPage(idx);
                        requestAnimationFrame(() =>
                          mobileFormScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })
                        );
                      }}
                      aria-label={`Go to section ${g.section.label}`}
                      className={
                        "h-1.5 rounded-full transition-all " +
                        (active
                          ? "w-6 bg-zinc-900 dark:bg-zinc-100"
                          : "w-1.5 bg-zinc-300 dark:bg-zinc-700")
                      }
                    />
                  );
                })}
              </div>
            ) : null}

            <div
              ref={mobileFormScrollRef}
              className="max-h-[calc(82dvh-56px-56px)] overflow-y-auto px-4 py-4"
            >
              <div className="space-y-3">
                {(currentMobileSection?.fields ?? []).map((f) => (
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
            </div>

            <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-800 pb-[calc(env(safe-area-inset-bottom)+72px)]">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={mobileFormPage <= 0}
                  onClick={() => {
                    setMobileFormPage((p) => Math.max(0, p - 1));
                    requestAnimationFrame(() =>
                      mobileFormScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })
                    );
                  }}
                  className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </button>
                {mobileFormPage >= mobileSectionCount - 1 ? (
                  <button
                    type="button"
                    onClick={() => setMobileDetailsOpen(false)}
                    className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                  >
                    Done
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileFormPage((p) => Math.min(mobileSectionCount - 1, p + 1));
                      requestAnimationFrame(() =>
                        mobileFormScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })
                      );
                    }}
                    className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-zinc-900 px-4 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="mt-2 text-center text-[11px] text-zinc-600 dark:text-zinc-300">
                Tap dots above to jump between sections.
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close menu"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="absolute left-0 top-0 h-full w-[86vw] max-w-sm border-r border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-100">
                  {recordName}
                </div>
                <div className="truncate text-xs text-zinc-600 dark:text-zinc-300">Menu</div>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="p-3">
              <Link
                href="/templates"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:text-zinc-100 dark:hover:bg-zinc-800/60"
              >
                <ArrowLeft className="h-5 w-5" />
                Back to templates
              </Link>

              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setMobileDetailsOpen(true);
                }}
                className="mt-1 flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:text-zinc-100 dark:hover:bg-zinc-800/60"
              >
                <ChevronRight className="h-5 w-5" />
                Open details form
              </button>

              <div className="mt-4 rounded-2xl bg-zinc-50 p-3 text-xs text-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-200">
                <div className="font-semibold text-zinc-950 dark:text-zinc-100">Tips</div>
                <div className="mt-1">Pan: hold Space and drag</div>
                <div>Zoom: Ctrl+Wheel</div>
              </div>
            </nav>
          </div>
        </div>
      ) : null}

      <ProgressModal
        open={exporting}
        title="Exporting"
        subtitle={exportStage || (exportProgress < 0.6 ? "Rendering PNG" : "Finalizing")}
        percent={Math.round(exportProgress * 100)}
        hint="Larger designs and custom fonts can take a moment."
      />

      <PaymentModal
        open={paymentModalOpen}
        templateId={userDesign.templateId}
        templateName={recordName}
        userDesignId={userDesign.id}
        customerEmail={session?.user?.email ?? null}
        onClose={() => setPaymentModalOpen(false)}
        onPaid={async () => {
          setPaymentModalOpen(false);
          // Run the actual export now that the user has an active grant.
          await doExportPng(STANDARD_EXPORT_SCALE);
        }}
      />
    </div>
  );
}

