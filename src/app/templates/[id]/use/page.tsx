"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, CreditCard, Eye, GraduationCap, Menu, X } from "lucide-react";
import imageCompression from "browser-image-compression";

import type { NormalizedDesignV1 } from "@/lib/figma";
import { composeImageMap } from "@/lib/render/composeImageMap";
import { usePluginImages } from "@/lib/render/usePluginImages";
import { exportTemplatePng } from "@/lib/render/exportPng";
import { buildUserDesignExportImages } from "@/lib/render/exportUserDesign";
import { useRemoteDesignAssets } from "@/lib/render/useRemoteDesignAssets";
import { useTemplateEditorStore } from "@/lib/stores/templateEditorStore";
import type { FieldConfig, UserDesignRecord } from "@/lib/storage/types";
import { downloadBlob, safePngFilename } from "@/lib/download/browserDownload";
import { groupFieldsBySection } from "@/lib/storage/fieldSections";
import { sectionIcon } from "@/components/editor/SectionsManager";
import { FormField } from "@/components/editor/FormField";
import {
  createInProgressDesign,
  findInProgressByTemplate,
  getUserDesign,
  markDownloaded,
  refreshUserDesignTemplateSnapshot,
  saveInputs,
} from "@/lib/storage/userDesignRepo";
import {
  fetchPublicTemplate,
  type PublicTemplateLockBlock,
} from "@/lib/api/publicTemplates";
import { LockedAccessModal } from "@/components/templates/LockedAccessModal";
import { ShareButton } from "@/components/templates/ShareButton";

import { DesignWorkspace } from "@/components/editor/DesignWorkspace";
import { WorkspaceTour } from "@/components/editor/WorkspaceTour";
import { useGoogleFonts } from "@/components/editor/useGoogleFonts";
import { ProgressModal } from "@/components/ui/ProgressModal";
import { CurtainOpen } from "@/components/ui/CurtainOpen";
import { useSimulatedProgress } from "@/components/ui/useSimulatedProgress";
import {
  fetchActiveGrant,
  initializePayment,
  loadPaystackScript,
  openPaystackPopup,
  recordDownload,
  recordPaymentEvent,
  verifyPayment,
} from "@/lib/api/payments";
import {
  clearPendingDownload,
  listPendingDownloads,
  recordPendingDownload,
} from "@/lib/payment/pendingDownloads";
import {
  clearPaymentAttempt,
  findPaymentAttemptForDesign,
  recordPaymentAttempt,
} from "@/lib/payment/paymentAttempts";

function deriveCategoryLabel(name: string, explicit: string | null): string {
  const e = explicit?.trim();
  if (e) return e;
  const n = name.toLowerCase();
  if (/(sign\s*-?\s*out|signed\s*out)/.test(n)) return "Sign-out";
  return "FYB";
}


/**
 * Standard export scale for capable devices. 2× hits the modern HD sweet spot:
 *   - Sharp on retina/4K phones and laptops
 *   - Within Instagram and WhatsApp's preserved-quality ceilings
 *   - Crisp enough for small-format prints (~7×9 inches at 300 dpi)
 *
 * One quality preset = one consistent, professional output. No size pickers,
 * no risk of users accidentally exporting a low-resolution file.
 */
const STANDARD_EXPORT_SCALE = 2;
const PAYMENT_GRANT_POLL_MS = 2000;
const PAYMENT_VERIFY_FALLBACK_MS = 8000;
const PAYSTACK_CHECKOUT_TIMEOUT_MS = 30 * 60 * 1000;
type WorkspacePaymentStage = "checking" | "opening" | "paying" | "verifying";

function isPaymentStillProcessingMessage(message: string): boolean {
  return /not successful|pending|ongoing|processing|queued|still processing|duplicate transaction reference/i.test(
    message
  );
}

function isSlowPaymentNetworkMessage(message: string): boolean {
  return /timed out|too long|failed to load paystack|network|fetch failed|could not reach paystack/i.test(
    message
  );
}

// Mobile devices (particularly iOS) have stricter canvas memory limits.
// Use 1× on small screens so large canvases don't OOM the tab.
function getExportScale(): 1 | 2 {
  if (typeof window !== "undefined" && window.innerWidth < 768) return 1;
  return STANDARD_EXPORT_SCALE;
}

export default function UseTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: templateId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedDesignId = searchParams.get("userDesignId");
  const resumeRequested = searchParams.get("resume") === "1";
  const resumeReference = searchParams.get("reference") ?? searchParams.get("trxref");
  const currentQuery = searchParams.toString();
  const viaShare = searchParams.get("via") === "share";
  const { data: session, status: sessionStatus } = useSession();
  const isHead = Boolean(session?.user?.isDepartmentHead);

  // Auth gate: unauthenticated visitors get redirected to sign-in with a
  // callback back to this exact template URL. Honors the loading state so
  // we don't redirect on the initial render.
  useEffect(() => {
    if (sessionStatus !== "unauthenticated") return;
    const here = `/templates/${templateId}/use${currentQuery ? `?${currentQuery}` : ""}`;
    const target = `/signin?from=${encodeURIComponent(here)}`;
    router.replace(target);
  }, [sessionStatus, templateId, currentQuery, router]);

  // Track whether the "shared with you" banner is showing (dismissible).
  const [shareBannerOpen, setShareBannerOpen] = useState(viaShare);

  const [userDesign, setUserDesign] = useState<UserDesignRecord | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lockBlock, setLockBlock] = useState<PublicTemplateLockBlock | null>(null);
  const refetchTrigger = 0;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportStage, setExportStage] = useState<string>("");
  const [downloadChecking, setDownloadChecking] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileReadyToPay, setMobileReadyToPay] = useState(false);
  const [mobilePaymentError, setMobilePaymentError] = useState<string | null>(null);
  const [slowPaymentModalOpen, setSlowPaymentModalOpen] = useState(false);
  const [workspacePaymentStage, setWorkspacePaymentStage] =
    useState<WorkspacePaymentStage | null>(null);
  const [autoFitNonce, setAutoFitNonce] = useState(0);
  const [mobileFormPage, setMobileFormPage] = useState(0);
  const mobileFormScrollRef = useRef<HTMLDivElement | null>(null);
  const [desktopFormPage, setDesktopFormPage] = useState(0);
  const desktopFormScrollRef = useRef<HTMLDivElement | null>(null);
  const resumeCheckoutRef = useRef(false);
  const resumePollingOnlyRef = useRef<string | null>(null);

  const [previewTextByNodeId, setPreviewTextByNodeId] = useState<Record<string, string>>({});
  const [previewImageByNodeId, setPreviewImageByNodeId] = useState<Record<
    string,
    { url: string; blob: Blob; objectFit: "cover" | "contain"; _revoke?: boolean }
  >>({});
  const [imageLoadingByNodeId, setImageLoadingByNodeId] = useState<Record<string, boolean>>({});
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

  // Load or create the user-design working copy.
  // IDB lookup and server lock-check run concurrently so returning users see
  // their cached design immediately while the auth/lock response is in-flight.
  useEffect(() => {
    let cancelled = false;

    function hydrateRecord(record: UserDesignRecord) {
      setUserDesign(record);
      setPreviewTextByNodeId({ ...record.inputs.textByNodeId });
      setPreviewColorByNodeId({ ...record.inputs.colorByNodeId });
      const hydrated: Record<
        string,
        { url: string; blob: Blob; objectFit: "cover" | "contain"; _revoke?: boolean }
      > = {};
      for (const [nodeId, entry] of Object.entries(record.inputs.imageBlobsByNodeId)) {
        const url = URL.createObjectURL(entry.blob);
        hydrated[nodeId] = { url, blob: entry.blob, objectFit: entry.objectFit, _revoke: true };
      }
      setPreviewImageByNodeId(hydrated);
    }

    function templateAssetUrls(
      assets: Array<{ nodeId: string; url: string }>
    ): Record<string, string> {
      const assetUrlsByNodeId: Record<string, string> = {};
      for (const asset of assets) {
        assetUrlsByNodeId[asset.nodeId] = asset.url;
      }
      return assetUrlsByNodeId;
    }

    (async () => {
      try {
        // Kick off both operations simultaneously.
        const idbPromise = requestedDesignId
          ? getUserDesign(requestedDesignId)
          : findInProgressByTemplate(templateId);
        const serverPromise = fetchPublicTemplate(templateId);

        // Show cached design immediately if available - no waiting for the server.
        const cachedRecord = await idbPromise;
        if (cachedRecord && !cancelled) {
          hydrateRecord(cachedRecord);
        }

        // Wait for the server response to enforce lock/auth state.
        const remote = await serverPromise;
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

        const assetUrlsByNodeId = templateAssetUrls(remote.template.designAssets);
        const categoryLabel = deriveCategoryLabel(
          remote.template.name,
          remote.template.category
        );

        if (cachedRecord) {
          const refreshed = await refreshUserDesignTemplateSnapshot(cachedRecord.id, {
            name: remote.template.name,
            categoryLabel,
            designJson: remote.template.designJson,
            normalized: remote.template.normalized,
            fieldConfig: remote.template.fieldConfig as FieldConfig,
            assetUrlsByNodeId,
          });
          if (!cancelled && refreshed) hydrateRecord(refreshed);
          return;
        }

        // First visit: create a fresh IDB record from the server template.
        const record = await createInProgressDesign({
          id: requestedDesignId ?? undefined,
          templateId: remote.template.id,
          name: remote.template.name,
          categoryLabel,
          designJson: remote.template.designJson,
          normalized: remote.template.normalized,
          fieldConfig: remote.template.fieldConfig as FieldConfig,
          assetUrlsByNodeId,
        });

        if (cancelled) return;
        hydrateRecord(record);
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

  const collectImageInputs = useCallback((): UserDesignRecord["inputs"]["imageBlobsByNodeId"] => {
    const imageBlobsByNodeId: UserDesignRecord["inputs"]["imageBlobsByNodeId"] = {};
    for (const [nodeId, v] of Object.entries(previewImagesRef.current)) {
      imageBlobsByNodeId[nodeId] = {
        blob: v.blob,
        mime: v.blob.type || "image/png",
        objectFit: v.objectFit,
      };
    }
    return imageBlobsByNodeId;
  }, []);

  // Debounced persistence of text/color/image inputs to IDB.
  const persistTimer = useRef<number | null>(null);
  const schedulePersist = useCallback(() => {
    if (!userDesignId) return;
    if (persistTimer.current) window.clearTimeout(persistTimer.current);
    persistTimer.current = window.setTimeout(() => {
      void saveInputs(userDesignId, {
        textByNodeId: previewTextByNodeId,
        colorByNodeId: previewColorByNodeId,
        imageBlobsByNodeId: collectImageInputs(),
      });
    }, 300);
  }, [userDesignId, previewTextByNodeId, previewColorByNodeId, collectImageInputs]);

  useEffect(() => {
    schedulePersist();
    return () => {
      if (persistTimer.current) window.clearTimeout(persistTimer.current);
    };
  }, [schedulePersist, previewImageByNodeId]);

  const persistInputsNow = useCallback(async () => {
    if (!userDesignId) return;
    if (persistTimer.current) {
      window.clearTimeout(persistTimer.current);
      persistTimer.current = null;
    }
    await saveInputs(userDesignId, {
      textByNodeId: previewTextByNodeId,
      colorByNodeId: previewColorByNodeId,
      imageBlobsByNodeId: collectImageInputs(),
    });
  }, [userDesignId, previewTextByNodeId, previewColorByNodeId, collectImageInputs]);

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
  const desktopReviewStep = desktopGroups.length;
  const desktopFlowStepCount = Math.max(1, desktopGroups.length + 1);
  const isDesktopReviewStep = desktopFormPage >= desktopReviewStep;
  const currentDesktopSection = desktopGroups[
    Math.min(desktopFormPage, desktopGroups.length - 1)
  ];
  const mobileSections = userFormGroups;
  const mobileReviewStep = mobileSections.length;
  const mobileFlowStepCount = Math.max(1, mobileSections.length + 1);
  const isMobileReviewStep = mobileFormPage >= mobileReviewStep;
  const currentMobileSection = mobileSections[
    Math.min(mobileFormPage, mobileSections.length - 1)
  ];

  // Clamp desktop page if section count changes
  useEffect(() => {
    if (desktopFormPage >= desktopFlowStepCount) {
      setDesktopFormPage(Math.max(0, desktopFlowStepCount - 1));
    }
  }, [desktopFlowStepCount, desktopFormPage]);

  useEffect(() => {
    if (!mobileDetailsOpen) return;
    setMobileFormPage(0);
    const raf = requestAnimationFrame(() => mobileFormScrollRef.current?.scrollTo({ top: 0 }));
    return () => cancelAnimationFrame(raf);
  }, [mobileDetailsOpen]);

  useEffect(() => {
    if (mobileFormPage >= mobileFlowStepCount) {
      setMobileFormPage(Math.max(0, mobileFlowStepCount - 1));
    }
  }, [mobileFlowStepCount, mobileFormPage]);

  useEffect(() => {
    if (!resumeRequested || !userDesign) return;
    setMobileReadyToPay(true);
    setMobileDetailsOpen(false);
    setDesktopFormPage(Math.max(0, desktopFlowStepCount - 1));
  }, [resumeRequested, userDesign, desktopFlowStepCount]);

  useEffect(() => {
    if (!userDesign || !session?.user?.email) return;
    if (resumeCheckoutRef.current || workspacePaymentStage || exporting || downloadChecking) {
      return;
    }

    const attempt = findPaymentAttemptForDesign(userDesign.templateId, userDesign.id);
    if (!attempt) return;
    if (resumePollingOnlyRef.current === attempt.reference) return;

    resumeCheckoutRef.current = true;
    setMobilePaymentError(null);

    void (async () => {
      const activeReference = attempt.reference;
      try {
        const remainingMs =
          PAYSTACK_CHECKOUT_TIMEOUT_MS - (Date.now() - attempt.initializedAt);
        if (remainingMs <= 0) {
          clearPaymentAttempt(attempt.reference);
          setMobilePaymentError("Payment session expired. Please start payment again.");
          return;
        }

        if (!attempt.accessCode || !attempt.publicKey || !attempt.amountKobo) {
          clearPaymentAttempt(attempt.reference);
          setMobilePaymentError(
            "This checkout session cannot be restored. Please start payment again."
          );
          return;
        }

        setWorkspacePaymentStage("verifying");
        try {
          const verified = await verifyPayment(attempt.reference);
          recordPendingDownload({
            reference: verified.grant.paystackReference,
            templateId: verified.grant.templateId,
            templateName: userDesign.name,
            userDesignId: verified.grant.userDesignId,
            paidAt: Date.now(),
          });
          clearPaymentAttempt(verified.grant.paystackReference);

          const params = new URLSearchParams({
            autoDownload: "1",
            reference: verified.grant.paystackReference,
          });
          if (verified.grant.userDesignId) {
            params.set("userDesignId", verified.grant.userDesignId);
          }
          router.push(`/dashboard?${params.toString()}`);
          return;
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Payment recovery check failed";
          if (!isPaymentStillProcessingMessage(message)) {
            throw err;
          }
        }

        await loadPaystackScript();
        setWorkspacePaymentStage("paying");
        const reference = await openPaystackPopup({
          publicKey: attempt.publicKey,
          reference: attempt.reference,
          accessCode: attempt.accessCode,
          amountKobo: attempt.amountKobo,
          email: session.user.email,
          timeoutMs: remainingMs,
          onSuccess: () => {},
          onCancel: () => {
            clearPaymentAttempt(attempt.reference);
            void recordPaymentEvent({
              reference: attempt.reference,
              event: "cancelled",
            }).catch((err) => {
              console.error("[payment] cancel event failed", err);
            });
          },
        });

        setWorkspacePaymentStage("verifying");
        const verified = await verifyPayment(reference);
        recordPendingDownload({
          reference: verified.grant.paystackReference,
          templateId: verified.grant.templateId,
          templateName: userDesign.name,
          userDesignId: verified.grant.userDesignId,
          paidAt: Date.now(),
        });
        clearPaymentAttempt(verified.grant.paystackReference);

        const params = new URLSearchParams({
          autoDownload: "1",
          reference: verified.grant.paystackReference,
        });
        if (verified.grant.userDesignId) {
          params.set("userDesignId", verified.grant.userDesignId);
        }
        router.push(`/dashboard?${params.toString()}`);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Payment could not be completed. Please try again.";
        if (message === "Payment was cancelled") {
          clearPaymentAttempt(activeReference);
          setMobilePaymentError("Payment cancelled. You can try again when you're ready.");
        } else if (isPaymentStillProcessingMessage(message)) {
          resumePollingOnlyRef.current = activeReference;
          setMobilePaymentError(
            "Payment is still processing. Keep this page open; download will start once Paystack confirms it."
          );
        } else if (isSlowPaymentNetworkMessage(message)) {
          clearPaymentAttempt(activeReference);
          setMobilePaymentError(null);
          setSlowPaymentModalOpen(true);
        } else {
          clearPaymentAttempt(activeReference);
          setMobilePaymentError(message);
        }
      } finally {
        resumeCheckoutRef.current = false;
        setWorkspacePaymentStage(null);
      }
    })();
  }, [
    userDesign,
    session?.user?.email,
    workspacePaymentStage,
    exporting,
    downloadChecking,
    router,
  ]);

  // While the auth-gate effect is redirecting an unauthenticated user, show
  // a quiet loading state instead of flashing the workspace UI.
  if (sessionStatus === "unauthenticated" || sessionStatus === "loading") {
    return (
      <div className="min-h-dvh bg-canvas dark:bg-canvas">
        <ProgressModal
          open
          title={sessionStatus === "unauthenticated" ? "Redirecting to sign in" : "Loading your session"}
          subtitle={viaShare ? "Someone shared this design with you" : "One moment"}
          hint="Sign in once and FYB Studio remembers you on this device."
        />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-canvas p-6 dark:bg-canvas">
        <div className="rounded-2xl border border-hairline bg-surface-1 p-6 text-sm text-ink-muted dark:border-hairline dark:bg-surface-1 dark:text-ink">
          {loadError}
        </div>
      </div>
    );
  }

  if (lockBlock) {
    return (
      <div className="min-h-screen bg-canvas dark:bg-canvas">
        <LockedAccessModal
          open
          templateId={lockBlock.templateId}
          departmentName={lockBlock.departmentName}
          onClose={() => router.push("/templates")}
        />
      </div>
    );
  }

  if (pageLoading || !userDesign || !fieldConfig || !normalized) {
    return (
      <div className="min-h-dvh bg-canvas dark:bg-canvas">
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
  const paymentBusy = Boolean(workspacePaymentStage);
  const workspacePaymentLabel =
    workspacePaymentStage === "checking"
      ? "Checking..."
      : workspacePaymentStage === "opening"
        ? "Opening Paystack..."
        : workspacePaymentStage === "paying"
          ? "Waiting for payment..."
          : workspacePaymentStage === "verifying"
            ? "Confirming payment..."
            : null;

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

  async function onPreviewImageChange(nodeId: string, file: File | null) {
    const imageField = fieldConfig?.fields.find(
      (f): f is Extract<typeof f, { kind: "image" }> => f.nodeId === nodeId && f.kind === "image"
    );

    if (imageField?.imageBehavior?.allowReplace === false) return;

    setImageLoadingByNodeId((prev) => ({ ...prev, [nodeId]: Boolean(file) }));

    try {
      setPreviewImageByNodeId((prev) => {
        const existing = prev[nodeId];
        if (existing?._revoke) URL.revokeObjectURL(existing.url);
        if (!file) {
          const next = { ...prev };
          delete next[nodeId];
          return next;
        }
        return prev;
      });

      if (!file) return;

      const fit =
        imageField?.imageBehavior?.fit ?? (imageField?.cropRule === "contain" ? "contain" : "cover");

      const maxBytes = 2 * 1024 * 1024;
      let finalFile: File = file;

      if (file.size > maxBytes) {
        const compressPromise: Promise<Blob> = imageCompression(file, {
          maxSizeMB: 2,
          maxWidthOrHeight: 3000,
          initialQuality: 0.93,
          alwaysKeepResolution: true,
          useWebWorker: true,
          fileType: "image/jpeg",
        });

        const timeoutPromise = new Promise<null>((resolve) => {
          window.setTimeout(() => resolve(null), 15000);
        });

        const compressed = (await Promise.race([compressPromise, timeoutPromise])) as
          | Blob
          | null;
        if (compressed && compressed instanceof Blob) {
          finalFile =
            compressed instanceof File
              ? compressed
              : new File([compressed], file.name, { type: compressed.type || "image/jpeg" });
        }
      }

      const url = URL.createObjectURL(finalFile);
      setPreviewImageByNodeId((prev) => ({
        ...prev,
        [nodeId]: {
          url,
          blob: finalFile,
          objectFit: fit,
          _revoke: true,
        },
      }));
    } catch {
      if (file) {
        const url = URL.createObjectURL(file);
        const fit =
          imageField?.imageBehavior?.fit ?? (imageField?.cropRule === "contain" ? "contain" : "cover");
        setPreviewImageByNodeId((prev) => ({
          ...prev,
          [nodeId]: {
            url,
            blob: file,
            objectFit: fit,
            _revoke: true,
          },
        }));
      }
    } finally {
      setImageLoadingByNodeId((prev) => ({ ...prev, [nodeId]: false }));
    }
  }

  async function doExportPng(scale: 1 | 2 | 3) {
    if (!userDesign || !normalized || !fieldConfig) return;
    setExporting(true);
    setExportStage("Preparing images");
    try {
      // Image precedence (lowest to highest) — must match composeImageMap so
      // the export is pixel-identical to the editor preview:
      //   1. Plugin-original images baked into the Figma design
      //   2. User-uploaded preview overrides
      //   3. Admin design assets (only when the field is bound to one)
      //
      // The export was previously missing layer 1, so any node whose photo
      // was supplied by the plugin (logos, decorative imagery, default
      // portraits) rendered as a transparent placeholder in the PNG even
      // though the editor showed it correctly.
      const imageBlobs = await buildUserDesignExportImages({
        design: normalized,
        fieldConfig,
        userImagesByNodeId: Object.fromEntries(
          Object.entries(previewImagesRef.current).map(([nodeId, entry]) => [
            nodeId,
            { blob: entry.blob, objectFit: entry.objectFit },
          ]),
        ),
        designAssetImagesByNodeId: designAssetImageByNodeId,
      });

      // 1. Plugin originals - these may be data URLs, blob URLs, or
      // Cloudinary URLs; fetch them into Blobs for the export renderer.
      

      // 2. User-uploaded previews override plugin originals.
      

      // 3. Admin design assets — overrides per field.imageSource setting.
      

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
      // System-controlled download — we drive the file save end-to-end
      // instead of letting the browser hijack it:
      //   - Build the blob URL.
      //   - Mount the <a> in the DOM (some browsers ignore .click() on a
      //     detached anchor; Safari requires the element to be in the tree).
      //   - Fire a synthesised click event so the popup-blocker doesn't
      //     classify it as an unprompted navigation.
      //   - Defer the URL revoke long enough for the download to commit
      //     (Safari occasionally races the revoke and produces a 0-byte
      //     file otherwise).
      const filename = safePngFilename(recordName);
      downloadBlob(blob, filename);

      // Save a thumbnail at scale 1 for the dashboard recents.
      let thumbnail: { blob: Blob; mime: string; width: number; height: number } | null = null;
      try {
        if (scale === 1) {
          thumbnail = {
            blob,
            mime: blob.type || "image/png",
            // Use the bitmap dimensions returned by the exporter - those are
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

      const paidReference =
        listPendingDownloads().find(
          (p) =>
            p.templateId === userDesign.templateId &&
            (p.userDesignId ?? null) === (userDesign.id ?? null),
        )?.reference ?? null;

      await markDownloaded(userDesign.id, {
        thumbnail,
        paidReference,
        exportFile: {
          blob,
          mime: blob.type || "image/png",
          width: exportWidth,
          height: exportHeight,
          scale,
          filename,
        },
      });

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

      // Show celebration screen instead of auto-redirecting
      setDownloadSuccess(true);
    } catch (err) {
      console.error("[use] export failed after payment", err);
      // Grant is still active server-side; dashboard will show a resume tile.
      router.push("/dashboard?resumePayment=1");
    } finally {
      setExporting(false);
      setExportStage("");
    }
  }

  async function startWorkspaceDownload() {
    if (exporting || downloadChecking || paymentBusy) return;
    if (!userDesign) return;
    if (!session?.user?.email) {
      setMobilePaymentError("No email found on your account. Sign out and back in, then retry.");
      return;
    }

    setMobilePaymentError(null);
    let activeReference: string | null = null;
    try {
      await persistInputsNow();
      setWorkspacePaymentStage("checking");
      const info = await fetchActiveGrant(
        {
          templateId: userDesign.templateId,
          userDesignId: userDesign.id,
        },
        { timeoutMs: 8000 }
      );
      if (info.grant) {
        await doExportPng(getExportScale());
        return;
      }

      setWorkspacePaymentStage("opening");
      const init = await initializePayment({
        templateId: userDesign.templateId,
        userDesignId: userDesign.id,
      });
      activeReference = init.reference;
      recordPaymentAttempt({
        reference: init.reference,
        accessCode: init.accessCode,
        publicKey: init.publicKey,
        amountKobo: init.amountKobo,
        templateId: userDesign.templateId,
        templateName: recordName,
        userDesignId: userDesign.id,
        amountNgn: init.amountNgn,
        initializedAt: Date.now(),
      });

      await loadPaystackScript();

      setWorkspacePaymentStage("paying");
      const reference = await openPaystackPopup({
        publicKey: init.publicKey,
        reference: init.reference,
        accessCode: init.accessCode,
        amountKobo: init.amountKobo,
        email: session.user.email,
        timeoutMs: PAYSTACK_CHECKOUT_TIMEOUT_MS,
        onSuccess: () => {},
        onCancel: () => {
          clearPaymentAttempt(init.reference);
          void recordPaymentEvent({
            reference: init.reference,
            event: "cancelled",
          }).catch((err) => {
            console.error("[payment] cancel event failed", err);
          });
        },
      });

      setWorkspacePaymentStage("verifying");
      const verified = await verifyPayment(reference);
      recordPendingDownload({
        reference: verified.grant.paystackReference,
        templateId: verified.grant.templateId,
        templateName: recordName,
        userDesignId: verified.grant.userDesignId,
        paidAt: Date.now(),
      });
      clearPaymentAttempt(verified.grant.paystackReference);
      const params = new URLSearchParams({
        autoDownload: "1",
        reference: verified.grant.paystackReference,
      });
      if (verified.grant.userDesignId) {
        params.set("userDesignId", verified.grant.userDesignId);
      }
      router.push(`/dashboard?${params.toString()}`);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Payment could not be completed. Please try again.";
      if (message === "Payment was cancelled") {
        if (activeReference) clearPaymentAttempt(activeReference);
        setMobilePaymentError("Payment cancelled. You can try again when you're ready.");
      } else if (isPaymentStillProcessingMessage(message)) {
        if (activeReference) resumePollingOnlyRef.current = activeReference;
        setMobilePaymentError(
          "Payment is still processing. Keep this page open; download will start once Paystack confirms it."
        );
      } else if (isSlowPaymentNetworkMessage(message)) {
        if (activeReference) clearPaymentAttempt(activeReference);
        setMobilePaymentError(null);
        setSlowPaymentModalOpen(true);
      } else {
        if (activeReference) clearPaymentAttempt(activeReference);
        setMobilePaymentError(message);
      }
    } finally {
      setWorkspacePaymentStage(null);
    }
  }

  async function returnToMobileCanvasPreview() {
    await persistInputsNow();
    setMobileDetailsOpen(false);
    setMobileReadyToPay(true);
    setMobilePaymentError(null);
    setAutoFitNonce((n) => n + 1);
  }

  function resetUserWorkspace() {
    for (const v of Object.values(previewImagesRef.current)) {
      if (v._revoke) URL.revokeObjectURL(v.url);
    }
    setPreviewTextByNodeId({});
    setPreviewColorByNodeId({});
    setPreviewImageByNodeId({});
    setMobileReadyToPay(false);
    setMobilePaymentError(null);
    resetView();
    setAutoFitNonce((n) => n + 1);
  }

  function openMobileDetailsFlow() {
    setMobileReadyToPay(false);
    setMobilePaymentError(null);
    setMobileFormPage(0);
    setMobileDetailsOpen(true);
  }

  return (
    <div className="flex h-dvh min-w-0 flex-col bg-canvas dark:bg-canvas">
      {/* Cinematic transition - plays once the workspace is ready */}
      <CurtainOpen brand="WORKSPACE READY" />
      {/* Shared-with-you banner - only when ?via=share and dismissible */}
      {shareBannerOpen && (
        <div
          className="flex items-center justify-between gap-3 px-4 py-2.5"
          style={{
            background: "linear-gradient(90deg, rgba(255,215,0,0.12), rgba(255,140,66,0.06))",
            borderBottom: "1px solid rgba(255,215,0,0.25)",
          }}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              aria-hidden
              style={{
                display: "inline-flex",
                width: 24, height: 24,
                borderRadius: 6,
                background: "rgba(255,215,0,0.18)",
                border: "1px solid rgba(255,215,0,0.35)",
                alignItems: "center", justifyContent: "center",
                color: "#FFD700",
                flexShrink: 0,
              }}
            >
              ✦
            </span>
            <div className="min-w-0">
              <div
                className="text-xs font-bold text-white truncate"
                style={{ letterSpacing: "-0.01em" }}
              >
                Someone shared this design with you
              </div>
              <div
                className="text-[10px] truncate"
                style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  letterSpacing: "0.14em",
                  color: "rgba(255,215,0,0.7)",
                  textTransform: "uppercase",
                  marginTop: 1,
                }}
              >
                Fill in your details · 5 min · ₦1,000 to export
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShareBannerOpen(false)}
            aria-label="Dismiss"
            className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full transition active:scale-95"
            style={{
              background: "rgba(0,0,0,0.3)",
              color: "rgba(255,215,0,0.7)",
              border: "1px solid rgba(255,215,0,0.2)",
            }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div
        className="sticky top-0 z-20 flex items-center justify-between gap-3 px-3 py-2 backdrop-blur lg:hidden"
        style={{
          background: "rgba(9,9,9,0.92)",
          borderBottom: "1px solid rgba(255,215,0,0.14)",
          boxShadow: "0 1px 0 rgba(255,215,0,0.06)",
        }}
      >
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl"
          style={{
            border: "1px solid rgba(255,215,0,0.22)",
            background: "rgba(255,215,0,0.05)",
            color: "#FFD700",
          }}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0 text-center flex flex-col items-center gap-0.5">
          <div className="flex items-center gap-1.5">
            <span
              aria-hidden
              style={{ width: 5, height: 5, borderRadius: "50%", background: "#FFD700", boxShadow: "0 0 8px rgba(255,215,0,0.6)" }}
            />
            <div className="truncate text-sm font-semibold text-ink dark:text-ink">
              {recordName}
            </div>
          </div>
          <div className="truncate text-[10px] font-medium uppercase" style={{ color: "rgba(255,215,0,0.6)", letterSpacing: "0.16em" }}>
            FYB · Workspace
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ShareButton
            templateId={userDesign.templateId}
            templateName={recordName}
            variant="icon"
            size={36}
          />
          <button
            type="button"
            onClick={openMobileDetailsFlow}
            data-workspace-tour="mobile-details"
            className="inline-flex h-9 items-center justify-center rounded-xl px-3 text-xs font-semibold transition active:scale-95"
            style={{
              background: "#FFD700",
              color: "#000",
              letterSpacing: "0.02em",
            }}
          >
            Edit
          </button>
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1">
        <aside
          className={
            "hidden h-full flex-col border-r border-hairline bg-surface-1 lg:flex dark:border-hairline dark:bg-surface-1 " +
            (sidebarCollapsed ? "w-18" : "w-65")
          }
        >
          <div
            className="flex items-center justify-between gap-2 px-3 py-3"
            style={{ borderBottom: "1px solid rgba(255,215,0,0.12)" }}
          >
            <div className={"min-w-0 " + (sidebarCollapsed ? "sr-only" : "")}>
              <div className="flex items-center gap-1.5 mb-0.5">
                <span
                  aria-hidden
                  style={{ width: 5, height: 5, borderRadius: "50%", background: "#FFD700", boxShadow: "0 0 8px rgba(255,215,0,0.6)" }}
                />
                <div className="text-[10px] font-semibold uppercase" style={{ color: "rgba(255,215,0,0.7)", letterSpacing: "0.18em" }}>
                  Template
                </div>
              </div>
              <div className="truncate text-sm font-semibold text-ink dark:text-ink">
                {recordName}
              </div>
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
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-sm font-medium transition"
              style={{
                border: "1px solid rgba(255,215,0,0.22)",
                background: "rgba(255,215,0,0.05)",
                color: "#FFD700",
              }}
              title={sidebarCollapsed ? "Expand" : "Collapse"}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          </div>

          <nav className="flex-1 space-y-1 p-3 text-sm">
            <Link
              href="/templates"
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-ink-muted transition hover:bg-surface-2/40 hover:text-ink"
              title="Back to templates"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" />
              <span className={sidebarCollapsed ? "sr-only" : ""}>Back to templates</span>
            </Link>
            {isHead ? (
              <Link
                href={`/templates/${templateId}/preview`}
                className="flex items-center gap-2 rounded-xl px-3 py-2 font-medium transition"
                style={{
                  color: "#FFD700",
                  background: "rgba(255,215,0,0.06)",
                  border: "1px solid rgba(255,215,0,0.18)",
                }}
                title="Preview & reserve for your department"
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,215,0,0.12)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255,215,0,0.06)";
                }}
              >
                {/* <BookmarkCheck className="h-4 w-4 shrink-0" /> */}
                <span className={sidebarCollapsed ? "sr-only" : ""}>Preview & reserve</span>
              </Link>
            ) : null}
            <div
              className="mt-2 rounded-xl p-3"
              style={{
                background: "linear-gradient(160deg, rgba(255,215,0,0.05), rgba(255,140,66,0.02))",
                border: "1px solid rgba(255,215,0,0.12)",
              }}
            >
              <div
                className={
                  "flex items-center gap-1.5 mb-1 " +
                  (sidebarCollapsed ? "sr-only" : "")
                }
              >
                <span
                  aria-hidden
                  style={{ width: 5, height: 5, borderRadius: "50%", background: "#FFD700" }}
                />
                <div
                  className="text-[10px] font-semibold uppercase"
                  style={{ color: "rgba(255,215,0,0.7)", letterSpacing: "0.18em" }}
                >
                  Tips
                </div>
              </div>
              <div
                className={
                  "text-xs text-ink-muted dark:text-ink-muted " +
                  (sidebarCollapsed ? "sr-only" : "")
                }
              >
                Pan: Space + drag<br />Zoom: Ctrl+Wheel
              </div>
            </div>
          </nav>
        </aside>

        <main className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
          {/* Workspace top bar - hosts Reset + Download for prominence */}
          <div
            className="hidden items-center justify-between gap-4 px-4 py-2.5 lg:flex"
            style={{
              background: "rgba(9,9,9,0.85)",
              borderBottom: "1px solid rgba(255,215,0,0.14)",
              backdropFilter: "blur(12px)",
            }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                aria-hidden
                className="relative inline-flex shrink-0"
                style={{ width: 6, height: 6 }}
              >
                <span
                  className="nv-pulse-ring absolute inset-0"
                  style={{ border: "1.5px solid rgba(255,215,0,0.5)", borderRadius: "50%" }}
                />
                <span
                  style={{ width: 6, height: 6, borderRadius: "50%", background: "#FFD700" }}
                />
              </span>
              <div
                className="text-[10px] font-semibold uppercase truncate"
                style={{ color: "rgba(255,215,0,0.75)", letterSpacing: "0.22em" }}
              >
                Live Preview
              </div>
              <span style={{ opacity: 0.35, color: "rgba(255,215,0,0.5)" }}>·</span>
              <div
                className="text-[10px] font-medium uppercase truncate"
                style={{ color: "rgba(255,255,255,0.45)", letterSpacing: "0.16em" }}
              >
                ₦1,000 to export
              </div>
            </div>

            {/* Reset + Share + Download action cluster */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={exporting || !hasEdits}
                onClick={resetUserWorkspace}
                className="inline-flex h-9 items-center justify-center rounded-xl px-3 text-xs font-semibold uppercase transition disabled:opacity-30"
                style={{
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.04)",
                  color: "rgba(255,255,255,0.7)",
                  letterSpacing: "0.06em",
                }}
                title="Clear all your edits"
              >
                Reset
              </button>
              <ShareButton
                templateId={userDesign.templateId}
                templateName={recordName}
                variant="pill"
                size={36}
              />
            </div>
          </div>

          <div className="flex-1 overflow-hidden p-0 sm:p-2 lg:p-2 xl:p-2">
            <div className="h-full min-h-0 w-full overflow-hidden bg-surface-1 sm:rounded-2xl sm:border sm:border-hairline dark:bg-surface-1 dark:sm:border-hairline">
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
                autoFitOnResize={false}
                autoFitKey={autoFitNonce}
                showWatermark
              />
            </div>
          </div>
        </main>

        <aside
          data-workspace-tour="desktop-details"
          className="hidden h-full w-80 flex-col bg-surface-1 lg:flex xl:w-95"
          style={{ borderLeft: "1px solid rgba(255,215,0,0.12)" }}
        >
          {/* Header - title + section indicator */}
          <div
            className="px-4 py-3"
            style={{ borderBottom: "1px solid rgba(255,215,0,0.12)" }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <span
                aria-hidden
                style={{ width: 5, height: 5, borderRadius: "50%", background: "#FFD700", boxShadow: "0 0 8px rgba(255,215,0,0.6)" }}
              />
              <div
                className="text-[10px] font-semibold uppercase"
                style={{ color: "rgba(255,215,0,0.7)", letterSpacing: "0.18em" }}
              >
                Personalize
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex items-center gap-2">
                {isDesktopReviewStep ? (
                  <span
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-lg"
                    style={{ background: "rgba(255,215,0,0.1)", border: "1px solid rgba(255,215,0,0.2)" }}
                  >
                    <CreditCard className="h-3.5 w-3.5" style={{ color: "#FFD700" }} />
                  </span>
                ) : currentDesktopSection ? (() => {
                  const Icon = sectionIcon(currentDesktopSection.section.icon);
                  return (
                    <span
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-lg"
                      style={{ background: "rgba(255,215,0,0.1)", border: "1px solid rgba(255,215,0,0.2)" }}
                    >
                      <Icon className="h-3.5 w-3.5" style={{ color: "#FFD700" }} />
                    </span>
                  );
                })() : null}
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-ink dark:text-ink">
                    {isDesktopReviewStep ? "Preview and payment" : currentDesktopSection?.section.label ?? "Your details"}
                  </div>
                  <div className="text-[10px] uppercase" style={{ color: "rgba(255,255,255,0.4)", letterSpacing: "0.14em" }}>
                    Section {Math.min(desktopFormPage + 1, desktopFlowStepCount)} of {desktopFlowStepCount}
                  </div>
                </div>
              </div>
              <span
                className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{ background: "rgba(255,215,0,0.08)", color: "rgba(255,215,0,0.7)", letterSpacing: "0.05em" }}
              >
                {isDesktopReviewStep ? "Pay" : currentDesktopSection?.fields.length ?? 0}
              </span>
            </div>
            {/* Section dots - tappable */}
            {desktopFlowStepCount > 1 && (
              <div className="mt-3 flex items-center gap-1.5">
                {Array.from({ length: desktopFlowStepCount }).map((_, idx) => {
                  const active = idx === desktopFormPage;
                  const label =
                    idx === desktopReviewStep
                      ? "Preview and payment"
                      : desktopGroups[idx]?.section.label ?? `Step ${idx + 1}`;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setDesktopFormPage(idx);
                        requestAnimationFrame(() =>
                          desktopFormScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })
                        );
                      }}
                      aria-label={`Go to ${label}`}
                      className="rounded-full transition-all"
                      style={{
                        height: 4,
                        width: active ? 18 : 4,
                        background: active ? "#FFD700" : "rgba(255,255,255,0.18)",
                      }}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Scrollable section content */}
          <div ref={desktopFormScrollRef} className="min-h-0 flex-1 overflow-y-auto p-3 xl:p-4">
            {isDesktopReviewStep ? (
              <div className="space-y-3">
                <section
                  className="overflow-hidden rounded-2xl"
                  style={{
                    border: "1px solid rgba(255,215,0,0.18)",
                    background: "linear-gradient(180deg, rgba(255,215,0,0.08), rgba(255,255,255,0.025))",
                  }}
                >
                  <div className="px-4 py-4">
                    <div
                      className="mb-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-bold uppercase"
                      style={{
                        background: "rgba(255,215,0,0.1)",
                        color: "#FFD700",
                        letterSpacing: "0.16em",
                      }}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Ready to export
                    </div>
                    <h2 className="text-lg font-bold tracking-tight text-ink dark:text-ink">
                      Review and pay for your final design.
                    </h2>
                  </div>
                </section>

                <section
                  className="overflow-hidden rounded-2xl"
                  style={{
                    border: "1px solid rgba(255,215,0,0.18)",
                    background: "rgba(255,255,255,0.025)",
                  }}
                >
                  <div className="border-b border-hairline px-4 py-3 dark:border-hairline">
                    <div
                      className="text-[10px] font-bold uppercase"
                      style={{ color: "rgba(255,215,0,0.75)", letterSpacing: "0.18em" }}
                    >
                      Payment breakdown
                    </div>
                    <div className="mt-1 truncate text-sm font-semibold text-ink dark:text-ink">
                      {recordName}
                    </div>
                  </div>
                  <div className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="text-ink-muted dark:text-ink-muted">Print-ready PNG</span>
                      <span className="font-semibold text-ink dark:text-ink">NGN 1,000</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="text-ink-muted dark:text-ink-muted">Template editing</span>
                      <span className="font-semibold text-ink dark:text-ink">Included</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 border-t border-dashed border-hairline pt-4 dark:border-hairline">
                      <span
                        className="text-[10px] font-bold uppercase"
                        style={{ color: "rgba(255,215,0,0.75)", letterSpacing: "0.18em" }}
                      >
                        Total due
                      </span>
                      <span className="text-2xl font-black tracking-tight text-ink dark:text-ink">
                        NGN 1,000
                      </span>
                    </div>
                  </div>
                </section>

                {mobilePaymentError ? (
                  <div
                    className="rounded-2xl px-3 py-2 text-xs"
                    style={{
                      background: "rgba(239,68,68,0.12)",
                      border: "1px solid rgba(239,68,68,0.28)",
                      color: "#fca5a5",
                    }}
                  >
                    {mobilePaymentError}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-2">
                {(currentDesktopSection?.fields ?? []).map((f) => (
                  <FormField
                    key={f.id}
                    field={f}
                    previewTextByNodeId={previewTextByNodeId}
                    previewImageByNodeId={previewImageByNodeId}
                    imageLoadingByNodeId={imageLoadingByNodeId}
                    previewColorByNodeId={previewColorByNodeId}
                    onPreviewTextChange={onPreviewTextChange}
                    onPreviewImageChange={onPreviewImageChange}
                    onPreviewColorChange={onPreviewColorChange}
                    density="compact"
                  />
                ))}
              </div>
            )}
          </div>

          {/* Back / Next pager */}
          {desktopFlowStepCount > 1 && (
            <div
              className="px-4 py-2.5"
              style={{ borderTop: "1px solid rgba(255,215,0,0.1)" }}
            >
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={desktopFormPage <= 0}
                  onClick={() => {
                    setDesktopFormPage((p) => Math.max(0, p - 1));
                    requestAnimationFrame(() =>
                      desktopFormScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })
                    );
                  }}
                  className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-semibold uppercase transition disabled:opacity-30"
                  style={{
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: "rgba(255,255,255,0.03)",
                    color: "rgba(255,255,255,0.7)",
                    letterSpacing: "0.06em",
                  }}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Back
                </button>
                <button
                  type="button"
                  disabled={downloadChecking || paymentBusy}
                  onClick={() => {
                    if (isDesktopReviewStep) {
                      void startWorkspaceDownload();
                      return;
                    }
                    setDesktopFormPage((p) => Math.min(desktopFlowStepCount - 1, p + 1));
                    requestAnimationFrame(() =>
                      desktopFormScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })
                    );
                  }}
                  className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-semibold uppercase transition disabled:opacity-30"
                  style={{
                    background: downloadChecking || paymentBusy ? "rgba(255,255,255,0.05)" : "#FFD700",
                    color: downloadChecking || paymentBusy ? "rgba(255,255,255,0.5)" : "#000",
                    letterSpacing: "0.06em",
                  }}
                >
                  {workspacePaymentLabel ? (
                    <><span className="fyb-dots"><span /><span /><span /></span> {workspacePaymentLabel}</>
                  ) : isDesktopReviewStep ? (
                    <><CreditCard className="h-3.5 w-3.5" /> Download</>
                  ) : (
                    <>
                      Next
                      <ChevronRight className="h-3.5 w-3.5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

        </aside>
      </div>

      <div
        className="fixed inset-x-0 bottom-0 z-30 p-3 backdrop-blur lg:hidden pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
        style={{
          background: "rgba(9,9,9,0.92)",
          borderTop: "1px solid rgba(255,215,0,0.18)",
          boxShadow: "0 -8px 24px rgba(0,0,0,0.4)",
        }}
      >
        <div className="mx-auto flex w-full max-w-xl flex-col gap-2">
          {mobilePaymentError ? (
            <div
              className="rounded-2xl px-3 py-2 text-xs"
              style={{
                background: "rgba(239,68,68,0.12)",
                border: "1px solid rgba(239,68,68,0.28)",
                color: "#fca5a5",
              }}
            >
              {mobilePaymentError}
            </div>
          ) : null}
          <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={exporting || downloadChecking || paymentBusy || !hasEdits}
            onClick={resetUserWorkspace}
            className="inline-flex h-11 flex-1 items-center justify-center rounded-2xl px-4 text-sm font-semibold transition disabled:opacity-40 active:scale-95"
            style={{
              border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(255,255,255,0.04)",
              color: "rgba(255,255,255,0.7)",
            }}
          >
            Reset
          </button>
          <button
            type="button"
            disabled={exporting || downloadChecking || paymentBusy}
            onClick={mobileReadyToPay ? startWorkspaceDownload : openMobileDetailsFlow}
            data-workspace-tour="mobile-download"
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-bold transition active:scale-95 disabled:opacity-60"
            style={{
              background: downloadChecking || exporting || paymentBusy ? "var(--surface-2)" : "#FFD700",
              color: downloadChecking || exporting || paymentBusy ? "var(--ink-muted)" : "#000",
              boxShadow: downloadChecking || exporting || paymentBusy ? "none" : "0 8px 24px rgba(255,180,0,0.32)",
            }}
          >
            {workspacePaymentLabel ? (
              <><span className="fyb-dots"><span /><span /><span /></span> {workspacePaymentLabel}</>
            ) : exporting ? (
              "Exporting..."
            ) : mobileReadyToPay ? (
              <><CreditCard className="h-4 w-4" /> Download</>
            ) : (
              <><ChevronRight className="h-4 w-4" /> Fill details</>
            )}
          </button>
          </div>
        </div>
      </div>

      {mobileDetailsOpen ? (
        <div
          className="fixed inset-0 z-40 flex flex-col bg-canvas lg:hidden dark:bg-canvas"
          style={{ height: "100dvh" }}
        >
          <header
            className="shrink-0 px-4 py-3"
            style={{
              background: "rgba(9,9,9,0.96)",
              borderBottom: "1px solid rgba(255,215,0,0.14)",
              boxShadow: "0 1px 0 rgba(255,215,0,0.06)",
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setMobileDetailsOpen(false)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl transition active:scale-95"
                style={{
                  border: "1px solid rgba(255,215,0,0.22)",
                  background: "rgba(255,215,0,0.05)",
                  color: "#FFD700",
                }}
                aria-label="Back to canvas"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>

              <div className="min-w-0 flex-1 text-center">
                <div
                  className="truncate text-[10px] font-semibold uppercase"
                  style={{ color: "rgba(255,215,0,0.7)", letterSpacing: "0.18em" }}
                >
                  Details flow
                </div>
                <div className="mt-0.5 truncate text-sm font-semibold text-ink dark:text-ink">
                  {isMobileReviewStep
                    ? "Preview and payment"
                    : currentMobileSection?.section.label ?? "Your details"}
                </div>
              </div>

              <div
                className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-xs font-bold"
                style={{
                  border: "1px solid rgba(255,215,0,0.22)",
                  background: "rgba(255,215,0,0.08)",
                  color: "#FFD700",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {Math.min(mobileFormPage + 1, mobileFlowStepCount)}
              </div>
            </div>

            <div className="mt-3 flex items-center gap-1.5">
              {Array.from({ length: mobileFlowStepCount }).map((_, idx) => {
                const active = idx === mobileFormPage;
                const label =
                  idx === mobileReviewStep
                    ? "Preview and payment"
                    : mobileSections[idx]?.section.label ?? `Step ${idx + 1}`;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setMobileFormPage(idx);
                      requestAnimationFrame(() =>
                        mobileFormScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })
                      );
                    }}
                    aria-label={`Go to ${label}`}
                    className="h-1.5 rounded-full transition-all"
                    style={{
                      width: active ? 28 : 7,
                      background: active ? "#FFD700" : "rgba(255,255,255,0.18)",
                    }}
                  />
                );
              })}
            </div>
          </header>

          <main
            ref={mobileFormScrollRef}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {isMobileReviewStep ? (
              <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
                <section
                  className="overflow-hidden rounded-3xl"
                  style={{
                    border: "1px solid rgba(255,215,0,0.18)",
                    background: "linear-gradient(180deg, rgba(255,215,0,0.08), rgba(255,255,255,0.025))",
                  }}
                >
                  <div className="px-4 py-4">
                    <div
                      className="mb-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] font-bold uppercase"
                      style={{
                        background: "rgba(255,215,0,0.1)",
                        color: "#FFD700",
                        letterSpacing: "0.16em",
                      }}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Ready to preview
                    </div>
                    <h2 className="text-xl font-bold tracking-tight text-ink dark:text-ink">
                      Review your design on the canvas before payment.
                    </h2>
                  </div>
                </section>

                <section
                  className="overflow-hidden rounded-3xl"
                  style={{
                    border: "1px solid rgba(255,215,0,0.18)",
                    background: "rgba(255,255,255,0.025)",
                  }}
                >
                  <div className="border-b border-hairline px-4 py-3 dark:border-hairline">
                    <div
                      className="text-[10px] font-bold uppercase"
                      style={{ color: "rgba(255,215,0,0.75)", letterSpacing: "0.18em" }}
                    >
                      Payment breakdown
                    </div>
                    <div className="mt-1 truncate text-sm font-semibold text-ink dark:text-ink">
                      {recordName}
                    </div>
                  </div>
                  <div className="px-4 py-3">
                    <div className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="text-ink-muted dark:text-ink-muted">Print-ready PNG</span>
                      <span className="font-semibold text-ink dark:text-ink">NGN 1,000</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="text-ink-muted dark:text-ink-muted">Template editing</span>
                      <span className="font-semibold text-ink dark:text-ink">Included</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 border-t border-dashed border-hairline pt-4 dark:border-hairline">
                      <span
                        className="text-[10px] font-bold uppercase"
                        style={{ color: "rgba(255,215,0,0.75)", letterSpacing: "0.18em" }}
                      >
                        Total due
                      </span>
                      <span className="text-2xl font-black tracking-tight text-ink dark:text-ink">
                        NGN 1,000
                      </span>
                    </div>
                  </div>
                </section>
              </div>
            ) : (
              <div className="mx-auto w-full max-w-xl">
                <div className="mb-4 flex items-center gap-3">
                  {currentMobileSection
                    ? (() => {
                        const Icon = sectionIcon(currentMobileSection.section.icon);
                        return (
                          <span
                            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl"
                            style={{
                              background: "rgba(255,215,0,0.1)",
                              border: "1px solid rgba(255,215,0,0.2)",
                            }}
                          >
                            <Icon className="h-5 w-5" style={{ color: "#FFD700" }} />
                          </span>
                        );
                      })()
                    : null}
                  <div className="min-w-0">
                    <div className="truncate text-lg font-bold text-ink dark:text-ink">
                      {currentMobileSection?.section.label ?? "Your details"}
                    </div>
                    <div className="text-xs text-ink-muted dark:text-ink-muted">
                      Section {Math.min(mobileFormPage + 1, mobileFlowStepCount)} of {mobileFlowStepCount}
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {(currentMobileSection?.fields ?? []).map((f) => (
                    <FormField
                      key={f.id}
                      field={f}
                      previewTextByNodeId={previewTextByNodeId}
                      previewImageByNodeId={previewImageByNodeId}
                      imageLoadingByNodeId={imageLoadingByNodeId}
                      previewColorByNodeId={previewColorByNodeId}
                      onPreviewTextChange={onPreviewTextChange}
                      onPreviewImageChange={onPreviewImageChange}
                      onPreviewColorChange={onPreviewColorChange}
                      density="comfortable"
                    />
                  ))}
                  <div aria-hidden style={{ height: 12 }} />
                </div>
              </div>
            )}
          </main>

          <footer
            className="shrink-0 border-t border-hairline px-4 pt-3 dark:border-hairline"
            style={{
              paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)",
              background: "rgba(9,9,9,0.96)",
            }}
          >
            <div className="mx-auto flex w-full max-w-xl items-center gap-2">
              <button
                type="button"
                disabled={mobileFormPage <= 0}
                onClick={() => {
                  setMobileFormPage((p) => Math.max(0, p - 1));
                  requestAnimationFrame(() =>
                    mobileFormScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })
                  );
                }}
                className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold transition disabled:opacity-40 active:scale-95"
                style={{
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.04)",
                  color: "rgba(255,255,255,0.7)",
                }}
              >
                <ChevronLeft className="h-4 w-4" />
                Back
              </button>
              {isMobileReviewStep ? (
                <button
                  type="button"
                  onClick={returnToMobileCanvasPreview}
                  className="inline-flex h-12 flex-[1.35] items-center justify-center gap-2 rounded-2xl px-4 text-sm font-bold transition active:scale-95"
                  style={{
                    background: "#FFD700",
                    color: "#000",
                    boxShadow: "0 8px 22px rgba(255,180,0,0.3)",
                  }}
                >
                  <Eye className="h-4 w-4" />
                  Preview design
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setMobileFormPage((p) => Math.min(mobileFlowStepCount - 1, p + 1));
                    requestAnimationFrame(() =>
                      mobileFormScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" })
                    );
                  }}
                  className="inline-flex h-12 flex-[1.35] items-center justify-center gap-2 rounded-2xl px-4 text-sm font-bold transition active:scale-95"
                  style={{
                    background: "#FFD700",
                    color: "#000",
                    boxShadow: "0 8px 22px rgba(255,180,0,0.3)",
                  }}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>
          </footer>
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
          <div className="absolute left-0 top-0 h-full w-[86vw] max-w-sm border-r border-hairline bg-surface-1 shadow-2xl dark:border-hairline dark:bg-surface-1">
            <div className="flex items-center justify-between border-b border-hairline px-4 py-3 dark:border-hairline">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-ink dark:text-ink">
                  {recordName}
                </div>
                <div className="truncate text-xs text-ink-muted dark:text-ink-muted">Menu</div>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-hairline bg-surface-1 text-ink hover:bg-canvas dark:border-hairline dark:bg-surface-1 dark:text-ink dark:hover:bg-surface-2"
                aria-label="Close menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="p-3">
              <Link
                href="/templates"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium text-ink hover:bg-canvas dark:text-ink dark:hover:bg-surface-2/60"
              >
                <ArrowLeft className="h-5 w-5" />
                Back to templates
              </Link>

              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  openMobileDetailsFlow();
                }}
                className="mt-1 flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-sm font-medium text-ink hover:bg-canvas dark:text-ink dark:hover:bg-surface-2/60"
              >
                <ChevronRight className="h-5 w-5" />
                Open details form
              </button>

              <div className="mt-4 rounded-2xl bg-canvas p-3 text-xs text-ink-muted dark:bg-surface-2/40 dark:text-ink">
                <div className="font-semibold text-ink dark:text-ink">Tips</div>
                <div className="mt-1">Pan: hold Space and drag</div>
                <div>Zoom: Ctrl+Wheel</div>
              </div>
            </nav>
          </div>
        </div>
      ) : null}

      <WorkspaceTour />

      <ProgressModal
        open={exporting}
        title="Exporting your design"
        subtitle={exportStage || (exportProgress < 0.6 ? "Rendering PNG" : "Finalizing")}
        percent={Math.round(exportProgress * 100)}
        hint="Larger designs and custom fonts can take a moment. Keep this tab open."
      />

      {slowPaymentModalOpen ? (
        <SlowPaymentNetworkModal
          retrying={paymentBusy || downloadChecking || exporting}
          onClose={() => setSlowPaymentModalOpen(false)}
          onTryAgain={() => {
            setSlowPaymentModalOpen(false);
            void startWorkspaceDownload();
          }}
        />
      ) : null}

      <PaymentRecoveryController
        templateId={userDesign.templateId}
        templateName={recordName}
        userDesignId={userDesign.id}
        resumeRequested={resumeRequested}
        resumeReference={resumeReference}
        exporting={exporting}
        downloadChecking={downloadChecking}
        checkoutActive={paymentBusy}
        onCheckingChange={setDownloadChecking}
        onExport={() => doExportPng(getExportScale())}
      />

      {downloadSuccess && (
        <DownloadSuccessModal
          onContinue={() => router.push("/dashboard?justDownloaded=1")}
        />
      )}
    </div>
  );
}

function DownloadSuccessModal({
  onContinue,
}: {
  onContinue: () => void;
}) {
  const puffCanvasRef = useRef<HTMLCanvasElement>(null);

  // Fire a canvas-based confetti puff from the center the instant the
  // modal mounts. Same physics as the landing-page cinematic — gravity +
  // drag + colour mix — so the celebration feels brand-consistent.
  useEffect(() => {
    const cleanup = firePuff(puffCanvasRef.current);
    return cleanup;
  }, []);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(10px)" }}
    >
      {/* Canvas confetti puff — covers the full viewport so the burst
          spans the whole celebration, not just behind the card. */}
      <canvas
        ref={puffCanvasRef}
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />

      <div
        className="relative w-full max-w-sm overflow-hidden text-center"
        style={{
          background: "var(--canvas)",
          border: "1px solid var(--hairline)",
          borderRadius: 28,
          boxShadow: "0 40px 100px rgba(0,0,0,0.7)",
          zIndex: 2,
        }}
      >
        {/* Gold top bar */}
        <div
          className="absolute inset-x-0 top-0 h-[3px]"
          style={{ background: "linear-gradient(90deg,#FFD700,#F97316,#A855F7)" }}
        />

        <div className="px-6 pt-9 pb-7">
          {/* Icon */}
          <div className="relative mx-auto mb-5 flex h-20 w-20 items-center justify-center">
            {/* Pulse rings */}
            <div
              className="absolute inset-0 animate-ping rounded-full"
              style={{ background: "rgba(255,215,0,0.15)", animationDuration: "1.5s" }}
            />
            <div
              className="absolute inset-0 animate-ping rounded-full"
              style={{ background: "rgba(255,215,0,0.08)", animationDuration: "2s" }}
            />
            <div
              className="grid h-20 w-20 place-items-center rounded-full"
              style={{ background: "rgba(255,215,0,0.12)" }}
            >
              <GraduationCap size={36} style={{ color: "#FFD700" }} strokeWidth={1.5} />
            </div>
            <CheckCircle2
              size={22}
              className="absolute -right-1 -top-1"
              style={{ color: "#22c55e", background: "var(--canvas)", borderRadius: "50%" }}
            />
          </div>

          <h2
            className="text-xl font-bold"
            style={{ color: "var(--ink)", letterSpacing: "-0.025em" }}
          >
            Download complete!
          </h2>
          <p
            className="mt-2 text-sm"
            style={{ color: "var(--ink-muted)", lineHeight: 1.6 }}
          >
            Your masterpiece is ready.
          </p>

          <div
            className="mt-5 flex items-center justify-center gap-1.5 text-xs"
            style={{ color: "var(--ink-faint)" }}
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "#FFD700" }} />
            Powered by FYB Studio
          </div>

          <button
            type="button"
            onClick={onContinue}
            className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-semibold transition active:scale-[0.97]"
            style={{ background: "#FFD700", color: "#000" }}
          >
            Continue to dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

function SlowPaymentNetworkModal({
  retrying,
  onClose,
  onTryAgain,
}: {
  retrying: boolean;
  onClose: () => void;
  onTryAgain: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="slow-payment-title"
      style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(12px)" }}
    >
      <div
        className="w-full max-w-sm overflow-hidden text-center"
        style={{
          background: "var(--canvas)",
          border: "1px solid rgba(255,215,0,0.28)",
          borderRadius: 24,
          boxShadow: "0 34px 90px rgba(0,0,0,0.62)",
        }}
      >
        <div
          className="h-1"
          style={{ background: "linear-gradient(90deg,#FFD700,#FF8C42,#A855F7)" }}
        />
        <div className="px-6 py-7">
          <div
            className="mx-auto grid h-14 w-14 place-items-center rounded-2xl"
            style={{ background: "rgba(255,215,0,0.12)", color: "#FFD700" }}
          >
            <CreditCard className="h-7 w-7" />
          </div>
          <h2 id="slow-payment-title" className="mt-5 text-xl font-bold text-ink">
            Slow network detected
          </h2>
          <p className="mt-2 text-sm leading-6 text-ink-muted">
            Paystack is taking too long to start. Check your connection and try again.
          </p>
          <div className="mt-6 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={retrying}
              className="inline-flex h-12 flex-1 items-center justify-center rounded-2xl text-sm font-semibold transition disabled:opacity-50"
              style={{
                border: "1px solid var(--hairline)",
                color: "var(--ink)",
                background: "var(--surface-1)",
              }}
            >
              Close
            </button>
            <button
              type="button"
              onClick={onTryAgain}
              disabled={retrying}
              className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl text-sm font-bold transition disabled:opacity-60"
              style={{ background: "#FFD700", color: "#000" }}
            >
              {retrying ? (
                <><span className="fyb-dots"><span /><span /><span /></span> Trying...</>
              ) : (
                "Try again"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PaymentRecoveryController({
  templateId,
  templateName,
  userDesignId,
  resumeRequested,
  resumeReference,
  exporting,
  downloadChecking,
  checkoutActive,
  onCheckingChange,
  onExport,
}: {
  templateId: string;
  templateName: string;
  userDesignId: string;
  resumeRequested: boolean;
  resumeReference: string | null;
  exporting: boolean;
  downloadChecking: boolean;
  checkoutActive: boolean;
  onCheckingChange: (checking: boolean) => void;
  onExport: () => Promise<void> | void;
}) {
  const [tick, setTick] = useState(0);
  const inFlightRef = useRef(false);
  const resumeOnlyCheckedRef = useRef(false);
  const lastVerifyAtRef = useRef(0);
  const stopRecoveryRef = useRef(false);
  const lastReferenceRef = useRef<string | null>(null);
  const onCheckingChangeRef = useRef(onCheckingChange);
  const onExportRef = useRef(onExport);

  useEffect(() => {
    onCheckingChangeRef.current = onCheckingChange;
    onExportRef.current = onExport;
  }, [onCheckingChange, onExport]);

  useEffect(() => {
    const bump = () => setTick((value) => value + 1);
    const onVisibility = () => {
      if (document.visibilityState === "visible") bump();
    };
    window.addEventListener("focus", bump);
    document.addEventListener("visibilitychange", onVisibility);
    const interval = window.setInterval(bump, PAYMENT_GRANT_POLL_MS);
    return () => {
      window.removeEventListener("focus", bump);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const attempt = findPaymentAttemptForDesign(templateId, userDesignId);
    const reference = attempt?.reference ?? resumeReference;
    const activeReference = reference ?? null;
    if (activeReference !== lastReferenceRef.current) {
      lastReferenceRef.current = activeReference;
      stopRecoveryRef.current = false;
    }
    if (!resumeRequested && !attempt && !reference) return;
    if (
      resumeRequested &&
      !attempt &&
      !reference &&
      resumeOnlyCheckedRef.current
    ) {
      return;
    }
    if (stopRecoveryRef.current) return;
    if (exporting || downloadChecking || checkoutActive || inFlightRef.current) return;

    let cancelled = false;
    inFlightRef.current = true;

    const timer = window.setTimeout(() => {
      void (async () => {
        onCheckingChangeRef.current(true);
        try {
          const active = await fetchActiveGrant({ templateId, userDesignId });
          if (cancelled) return;

          if (active.grant) {
            if (reference) {
              recordPendingDownload({
                reference,
                templateId,
                templateName,
                userDesignId,
                paidAt: Date.now(),
              });
            }
            if (attempt) {
              clearPaymentAttempt(attempt.reference);
            }
            await onExportRef.current();
            return;
          }

          if (!reference) {
            resumeOnlyCheckedRef.current = true;
            return;
          }

          const now = Date.now();
          if (now - lastVerifyAtRef.current < PAYMENT_VERIFY_FALLBACK_MS) {
            return;
          }
          lastVerifyAtRef.current = now;

          const verified = await verifyPayment(reference);
          if (cancelled) return;
          recordPendingDownload({
            reference: verified.grant.paystackReference,
            templateId: verified.grant.templateId,
            templateName,
            userDesignId: verified.grant.userDesignId,
            paidAt: Date.now(),
          });
          clearPaymentAttempt(verified.grant.paystackReference);
          await onExportRef.current();
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Payment recovery check failed";
          if (
            attempt &&
            /(cancelled|canceled|expired|failed|abandoned|reversed|not found)/i.test(
              message
            )
          ) {
            clearPaymentAttempt(attempt.reference);
            stopRecoveryRef.current = true;
          }
          if (!/not successful|pending|ongoing|processing|queued/i.test(message)) {
            console.warn("[payment] recovery check failed", err);
          }
        } finally {
          if (!cancelled) onCheckingChangeRef.current(false);
          inFlightRef.current = false;
        }
      })();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      inFlightRef.current = false;
    };
  }, [
    tick,
    templateId,
    templateName,
    userDesignId,
    resumeRequested,
    resumeReference,
    exporting,
    downloadChecking,
    checkoutActive,
  ]);

  return null;
}

/* ─── Confetti puff (download celebration) ─────────────── */

const SUCCESS_PUFF_COLORS = [
  "#FFD700", "#FFED4A", "#FF8C42", "#FF6B6B",
  "#4ECDC4", "#A855F7", "#84CC16", "#06B6D4", "#EC4899",
];

const SUCCESS_PUFF_SEEDS = Array.from({ length: 110 }).map((_, i) => {
  // Deterministic seeds so React 19's strict mode (which double-invokes
  // effects) doesn't see drifting positions and complain.
  const a = Math.sin(i * 12.9898) * 43758.5453;
  const b = Math.sin(i * 78.233) * 43758.5453;
  const c = Math.sin(i * 39.346) * 43758.5453;
  const ra = a - Math.floor(a);
  const rb = b - Math.floor(b);
  const rc = c - Math.floor(c);
  const angle = ra * Math.PI * 2;
  const speed = 6 + rb * 18;
  return {
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed - 5, // upward bias for a celebratory rise
    rotV: (rc - 0.5) * 0.45,
    color: SUCCESS_PUFF_COLORS[i % SUCCESS_PUFF_COLORS.length],
    w: 5 + rb * 8,
    h: 7 + ra * 10,
    shape: (["rect", "rect", "circle", "ribbon"] as const)[i % 4],
  };
});

function firePuff(canvas: HTMLCanvasElement | null): (() => void) | void {
  if (!canvas) return;
  const W = canvas.clientWidth || window.innerWidth;
  const H = canvas.clientHeight || window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);

  const cx = W / 2;
  const cy = H / 2;
  const particles = SUCCESS_PUFF_SEEDS.map((p) => ({
    x: cx,
    y: cy,
    vx: p.vx,
    vy: p.vy,
    rot: 0,
    rotV: p.rotV,
    w: p.w,
    h: p.h,
    color: p.color,
    shape: p.shape,
    opacity: 1,
  }));

  let lastTime = performance.now();
  let raf = 0;
  const draw = (now: number) => {
    const dt = now - lastTime;
    lastTime = now;
    ctx.clearRect(0, 0, W, H);
    let alive = false;
    for (const p of particles) {
      if (p.opacity <= 0) continue;
      alive = true;
      const f = dt / 16;
      p.x += p.vx * f;
      p.y += p.vy * f;
      p.vy += 0.4 * f;
      p.vx *= Math.pow(0.985, f);
      p.rot += p.rotV * f;
      if (p.y > H * 0.65) p.opacity = Math.max(0, p.opacity - 0.02 * f);

      ctx.save();
      ctx.globalAlpha = p.opacity;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      if (p.shape === "circle") {
        ctx.beginPath();
        ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === "ribbon") {
        ctx.beginPath();
        ctx.moveTo(-p.w / 2, -p.h / 5);
        ctx.quadraticCurveTo(0, -p.h * 0.6, p.w / 2, -p.h / 5);
        ctx.quadraticCurveTo(0, p.h * 0.6, -p.w / 2, p.h / 5);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
      ctx.restore();
    }
    if (alive) raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);
  return () => cancelAnimationFrame(raf);
}

/* ─── Download + image helpers ─────────────────────────── */

