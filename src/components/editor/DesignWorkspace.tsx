"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { NormalizedDesignV1, NormalizedNode } from "@/lib/figma";
import { CanvasBackend } from "@/lib/render/engine/backends/canvasBackend";
import { renderTree } from "@/lib/render/engine/renderTree";
import { buildTextSvg } from "@/lib/render/engine/svgTextLayer";
import { hitTestNodeId } from "@/lib/render/hitTest";
import { useTemplateEditorStore } from "@/lib/stores/templateEditorStore";
import type { FieldConfig } from "@/lib/storage/types";

import { computeRenderOrder } from "./types";

type Props = {
  design: NormalizedDesignV1;
  fieldConfig: FieldConfig;
  previewTextByNodeId: Record<string, string>;
  previewImageByNodeId: Record<
    string,
    {
      url: string;
      objectFit: "cover" | "contain";
    }
  >;
  previewColorByNodeId?: Record<string, string>;
  selectedNodeId: string | null;
  showGuides?: boolean;
  enableSelection?: boolean;
  autoFitOnMount?: boolean;
  autoFitOnResize?: boolean;
  autoFitKey?: string | number;
};

export function DesignWorkspace({
  design,
  fieldConfig,
  previewTextByNodeId,
  previewImageByNodeId,
  previewColorByNodeId = {},
  selectedNodeId,
  showGuides = true,
  enableSelection = true,
  autoFitOnMount = true,
  autoFitOnResize = false,
  autoFitKey,
}: Props) {
  const zoom = useTemplateEditorStore((s) => s.zoom);
  const panX = useTemplateEditorStore((s) => s.panX);
  const panY = useTemplateEditorStore((s) => s.panY);
  const setZoom = useTemplateEditorStore((s) => s.setZoom);
  const setPan = useTemplateEditorStore((s) => s.setPan);
  const resetView = useTemplateEditorStore((s) => s.resetView);
  const setSelectedNodeId = useTemplateEditorStore((s) => s.setSelectedNodeId);

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const designRef = useRef<HTMLDivElement | null>(null);
  const isPanningRef = useRef(false);
  const rightPanActiveRef = useRef(false);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{
    startDistance: number;
    startZoom: number;
    startPanX: number;
    startPanY: number;
    pivotX: number;
    pivotY: number;
  } | null>(null);
  const [spaceDown, setSpaceDown] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [rightPanActive, setRightPanActive] = useState(false);
  const didAutoFitRef = useRef<string | null>(null);
  const userAdjustedViewRef = useRef(false);

  const ordered = useMemo(() => computeRenderOrder(design), [design]);

  // Stage CSS dimensions match the source design exactly (CSS supports
  // fractional pixels). Snapping these would distort the design when the
  // source has fractional width/height (e.g. 1024.7px). Crispness still
  // comes from the device-pixel-ratio scaling applied to the bitmap canvas.
  const canvasW = useMemo(() => Math.max(1, design.canvas.width), [design.canvas.width]);
  const canvasH = useMemo(() => Math.max(1, design.canvas.height), [design.canvas.height]);
  const devicePixelRatio = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

  const colorOverrideByNodeId = useMemo(() => {
    const next: Record<string, string> = {};
    for (const f of fieldConfig.fields) {
      if (f.kind !== "color") continue;
      if ((f.colorBehavior?.enabled ?? true) === false) continue;
      const paletteFirst = f.colorBehavior?.palette?.[0];
      const value = previewColorByNodeId[f.nodeId] ?? paletteFirst;
      if (value) next[f.nodeId] = value;
    }
    return next;
  }, [fieldConfig.fields, previewColorByNodeId]);

  const fitToViewport = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;

    // Fit-to-view with padding; center design within the viewport.
    // This matches a “Figma-ish” initial view and prevents the design from starting off-screen.
    // User workspace goal: start at 100% with the design centered (no auto “scale down”).
    // Editor workspace goal: fit-to-view (never upscale above 100%).
    if (!enableSelection) {
      const nextZoom = 1;
      setZoom(nextZoom);
      setPan(-(canvasW * nextZoom) / 2, -(canvasH * nextZoom) / 2);
      return;
    }

    const padding = 32;
    const rect = el.getBoundingClientRect();
    const availW = Math.max(1, rect.width - padding * 2);
    const availH = Math.max(1, rect.height - padding * 2);
    const scale = Math.min(
      availW / Math.max(1, canvasW),
      availH / Math.max(1, canvasH),
    );

    // Never upscale above 100% on initial fit.
    const nextZoom = Math.max(0.1, Math.min(scale, 1));
    setZoom(nextZoom);
    setPan(-(canvasW * nextZoom) / 2, -(canvasH * nextZoom) / 2);
  }, [canvasH, canvasW, enableSelection, setPan, setZoom]);

  useEffect(() => {
    if (!autoFitOnMount) return;

    const key = `${canvasW}x${canvasH}:${String(autoFitKey ?? "")}`;
    if (didAutoFitRef.current === key) return;
    didAutoFitRef.current = key;

    userAdjustedViewRef.current = false;
    const raf = requestAnimationFrame(() => fitToViewport());
    return () => cancelAnimationFrame(raf);
  }, [autoFitKey, autoFitOnMount, canvasH, canvasW, fitToViewport]);

  useEffect(() => {
    if (!autoFitOnResize) return;
    const el = wrapperRef.current;
    if (!el) return;

    let raf = 0;
    const ro = new ResizeObserver(() => {
      if (userAdjustedViewRef.current) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => fitToViewport());
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [autoFitOnResize, canvasH, canvasW, fitToViewport]);

  // Space+drag to pan.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    function onWheel(e: WheelEvent) {
      // Ctrl+wheel zoom like design tools.
      if (!e.ctrlKey) return;
      e.preventDefault();
      userAdjustedViewRef.current = true;
      const delta = -e.deltaY;
      const factor = delta > 0 ? 1.08 : 1 / 1.08;

      const nextZoom = zoom * factor;
      const rect = designRef.current?.getBoundingClientRect();
      if (!rect) {
        setZoom(nextZoom);
        return;
      }

      // Zoom to cursor: keep the design point under the cursor fixed.
      const px = (e.clientX - rect.left) / zoom;
      const py = (e.clientY - rect.top) / zoom;
      const nextPanX = panX + (zoom - nextZoom) * px;
      const nextPanY = panY + (zoom - nextZoom) * py;
      setPan(nextPanX, nextPanY);
      setZoom(nextZoom);
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [panX, panY, setPan, setZoom, zoom]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === "Space") {
        isPanningRef.current = true;
        setSpaceDown(true);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "0") {
        e.preventDefault();
        resetView();
      }
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.code === "Space") {
        isPanningRef.current = false;
        panStartRef.current = null;
        setSpaceDown(false);
        setDragging(false);
      }
    }

    function onContextMenu(e: MouseEvent) {
      // Block the native context menu to allow right-drag panning.
      e.preventDefault();
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("contextmenu", onContextMenu);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("contextmenu", onContextMenu);
    };
  }, [resetView]);

  const handToolEnabled = !enableSelection;
  const showGrabCursor = handToolEnabled || spaceDown || rightPanActive;
  const cursorClass = showGrabCursor ? (dragging ? "cursor-grabbing" : "cursor-grab") : "cursor-default";

  function updatePointer(e: React.PointerEvent<HTMLDivElement>) {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  function tryStartPinch() {
    const pts = Array.from(pointersRef.current.values());
    if (pts.length !== 2) return;
    const [a, b] = pts;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy);
    if (!Number.isFinite(dist) || dist <= 0.001) return;

    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    const rect = designRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Pivot in design-space (unscaled) so zoom keeps content under fingers fixed.
    const pivotX = (midX - rect.left) / zoom;
    const pivotY = (midY - rect.top) / zoom;

    pinchRef.current = {
      startDistance: dist,
      startZoom: zoom,
      startPanX: panX,
      startPanY: panY,
      pivotX,
      pivotY,
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // Touch interactions (pan + pinch) should work without keyboard modifiers,
    // especially for the user workspace where selection is disabled.
    updatePointer(e);

    if (e.pointerType === "touch") {
      userAdjustedViewRef.current = true;
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      if (pointersRef.current.size === 2) {
        setDragging(true);
        tryStartPinch();
        return;
      }

      // One-finger drag pans (hand tool behavior).
      setDragging(true);
      panStartRef.current = { x: e.clientX, y: e.clientY, panX, panY };
      return;
    }

    if (e.pointerType === "mouse" && e.button === 2) {
      // Right-click to pan immediately (no keyboard modifier).
      e.preventDefault();
      userAdjustedViewRef.current = true;
      isPanningRef.current = true;
      rightPanActiveRef.current = true;
      setRightPanActive(true);
      setDragging(true);
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      panStartRef.current = { x: e.clientX, y: e.clientY, panX, panY };
      return;
    }

    if (e.pointerType === "mouse" && e.button === 0 && spaceDown) {
      // Space+drag (Figma-style) even if space keydown didn't bubble before focusing the canvas.
      userAdjustedViewRef.current = true;
      isPanningRef.current = true;
      setDragging(true);
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      panStartRef.current = { x: e.clientX, y: e.clientY, panX, panY };
      return;
    }

    // Mouse: pan when space is held (Figma-style), when selection is disabled, or when holding right-click.
    if (!isPanningRef.current && !handToolEnabled) return;
    userAdjustedViewRef.current = true;
    setDragging(true);
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    panStartRef.current = { x: e.clientX, y: e.clientY, panX, panY };
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    updatePointer(e);

    // Pinch zoom (two pointers active).
    if (pinchRef.current && pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values());
      const [a, b] = pts;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const start = pinchRef.current;
      const factor = dist / Math.max(1, start.startDistance);
      const nextZoom = start.startZoom * factor;
      const nextPanX = start.startPanX + (start.startZoom - nextZoom) * start.pivotX;
      const nextPanY = start.startPanY + (start.startZoom - nextZoom) * start.pivotY;
      setPan(nextPanX, nextPanY);
      setZoom(nextZoom);
      return;
    }

    // Drag pan.
    if (!panStartRef.current) return;
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    setPan(panStartRef.current.panX + dx, panStartRef.current.panY + dy);
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) {
      pinchRef.current = null;
    }

    if (pointersRef.current.size === 0) {
      panStartRef.current = null;
      setDragging(false);
      if (rightPanActiveRef.current) {
        isPanningRef.current = false;
        rightPanActiveRef.current = false;
        setRightPanActive(false);
        panStartRef.current = null;
      }
    }
  }

  function onClickSelect(e: React.MouseEvent<HTMLDivElement>) {
    if (!enableSelection) return;
    if (isPanningRef.current) return;
    if (dragging) return;
    const rect = designRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;
    const hitId = hitTestNodeId(design, x, y);
    setSelectedNodeId(hitId);
  }

  const snappedPanX = Math.round(panX * devicePixelRatio) / devicePixelRatio;
  const snappedPanY = Math.round(panY * devicePixelRatio) / devicePixelRatio;
  const snappedZoom = Math.round(zoom * 1000) / 1000;

  const canvasStyle: React.CSSProperties = {
    width: `${canvasW}px`,
    height: `${canvasH}px`,
    transform: `translate(${snappedPanX}px, ${snappedPanY}px) scale(${snappedZoom})`,
    transformOrigin: "0 0",
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="text-xs text-zinc-600 dark:text-zinc-300">
          Zoom: <span className="font-medium text-zinc-900 dark:text-zinc-100">{Math.round(zoom * 100)}%</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              userAdjustedViewRef.current = true;
              setZoom(zoom / 1.1);
            }}
            className="inline-flex h-8 items-center justify-center rounded-lg border border-zinc-200 bg-white px-2 text-xs font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            −
          </button>
          <button
            type="button"
            onClick={() => {
              userAdjustedViewRef.current = true;
              setZoom(zoom * 1.1);
            }}
            className="inline-flex h-8 items-center justify-center rounded-lg border border-zinc-200 bg-white px-2 text-xs font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => {
              userAdjustedViewRef.current = true;
              resetView();
            }}
            className="inline-flex h-8 items-center justify-center rounded-lg border border-zinc-200 bg-white px-2 text-xs font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            title="Reset view (Ctrl/Cmd+0)"
          >
            Reset
          </button>
        </div>
      </div>

      <div
        ref={wrapperRef}
        className={"relative flex-1 overflow-hidden touch-none " + cursorClass}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
        onClick={onClickSelect}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.08)_1px,transparent_0)] bg-size-[16px_16px] dark:hidden" />
        <div className="absolute inset-0 hidden bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.10)_1px,transparent_0)] bg-size-[16px_16px] dark:block" />

        <div className="absolute left-1/2 top-1/2" style={{ transform: "translate(-50%, -50%)" }}>
          <div ref={designRef} style={canvasStyle} className="relative shadow-[0_20px_60px_rgba(0,0,0,0.12)]">
            <CanvasShapesLayer
              design={design}
              orderedNodeIds={ordered}
              colorOverrideByNodeId={colorOverrideByNodeId}
              previewImageByNodeId={previewImageByNodeId}
            />
            <SvgTextLayer
              design={design}
              fieldConfig={fieldConfig}
              previewTextByNodeId={previewTextByNodeId}
              selectedNodeId={selectedNodeId}
              showGuides={showGuides}
            />
          </div>
        </div>

        <div className="pointer-events-none absolute bottom-3 left-3 rounded-xl border border-zinc-200 bg-white/90 px-3 py-2 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/70 dark:text-zinc-200">
          {enableSelection ? (
            <>
              Pan: hold <span className="font-medium">Space</span> and drag • Zoom: <span className="font-medium">Ctrl+Wheel</span>
            </>
          ) : (
            <>
              Pan: <span className="font-medium">drag</span> • Zoom: <span className="font-medium">pinch</span> (mobile) / <span className="font-medium">Ctrl+Wheel</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}


function CanvasShapesLayer({
  design,
  colorOverrideByNodeId,
  previewImageByNodeId,
}: {
  design: NormalizedDesignV1;
  // Kept for API parity even though the unified renderer pulls the order itself.
  orderedNodeIds?: string[];
  colorOverrideByNodeId: Record<string, string>;
  previewImageByNodeId: Record<string, { url: string; objectFit: "cover" | "contain" }>;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imagesRef = useRef(new Map<string, HTMLImageElement>());
  const [imageTick, setImageTick] = useState(0);

  // Eager-load preview images into HTMLImageElements; bumps imageTick on completion
  // so the render effect picks them up.
  useEffect(() => {
    let cancelled = false;
    const ids = Object.keys(previewImageByNodeId).filter(
      (id) => previewImageByNodeId[id]?.url,
    );
    const keep = new Set(ids);
    for (const existingId of imagesRef.current.keys()) {
      if (!keep.has(existingId)) imagesRef.current.delete(existingId);
    }
    for (const id of ids) {
      const url = previewImageByNodeId[id]?.url;
      if (!url) continue;
      const existing = imagesRef.current.get(id);
      if (existing && existing.src === url && existing.complete) continue;
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      imagesRef.current.set(id, img);
      const bump = () => {
        if (cancelled) return;
        setImageTick((t) => t + 1);
      };
      img.onload = bump;
      img.onerror = bump;
      img.decode?.().then(bump).catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [previewImageByNodeId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    // Exact design dimensions for CSS sizing; only the bitmap pixels are
    // rounded (mandatory for canvas) and the transform compensates so design
    // coords map onto the bitmap exactly.
    const designW = Math.max(1, design.canvas.width);
    const designH = Math.max(1, design.canvas.height);
    canvas.width = Math.max(1, Math.round(designW * dpr));
    canvas.height = Math.max(1, Math.round(designH * dpr));
    canvas.style.width = `${designW}px`;
    canvas.style.height = `${designH}px`;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;
    // High-quality bilinear scaling for any image resampling.
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    const sx = canvas.width / designW;
    const sy = canvas.height / designH;
    ctx.setTransform(sx, 0, 0, sy, 0, 0);

    const backend = new CanvasBackend({
      ctx,
      opts: {
        previewColorByNodeId: undefined,
        skipText: true,
      },
      colorOverrideByNodeId,
      resolvePreviewImage: (id) => {
        const url = previewImageByNodeId[id]?.url;
        if (!url) return undefined;
        const img = imagesRef.current.get(id);
        if (!img || !img.complete || img.naturalWidth === 0) return undefined;
        return { source: img, objectFit: previewImageByNodeId[id].objectFit };
      },
    });

    let cancelled = false;
    void renderTree(design, backend, { skipText: true })
      .catch((err) => {
        if (!cancelled) console.error("[render] tree render failed", err);
      });
    return () => {
      cancelled = true;
    };
  }, [design, colorOverrideByNodeId, imageTick, previewImageByNodeId]);

  return <canvas ref={canvasRef} className="absolute inset-0" />;
}

function SvgTextLayer({
  design,
  fieldConfig,
  previewTextByNodeId,
  selectedNodeId,
  showGuides,
}: {
  design: NormalizedDesignV1;
  fieldConfig: FieldConfig;
  previewTextByNodeId: Record<string, string>;
  selectedNodeId: string | null;
  showGuides: boolean;
}) {
  const selected = selectedNodeId ? design.nodesById[selectedNodeId] : undefined;

  // Build the text layer SVG via the shared engine so editor and PNG export stay in lockstep.
  const svgInner = useMemo(
    () => buildTextSvg({ design, fieldConfig, previewTextByNodeId, includeGuides: showGuides }),
    [design, fieldConfig, previewTextByNodeId, showGuides],
  );

  // The shared builder returns a full <svg ...>...</svg> string with its own viewBox.
  // We inline its <defs> and body content into the React-controlled <svg> so click
  // targets and overlays from the editor compose cleanly above it.
  const innerHtml = useMemo(() => {
    const match = svgInner.match(/<svg[^>]*>([\s\S]*)<\/svg>/);
    return match ? match[1] : svgInner;
  }, [svgInner]);

  return (
    <svg
      className="absolute inset-0"
      width={design.canvas.width}
      height={design.canvas.height}
      viewBox={`0 0 ${design.canvas.width} ${design.canvas.height}`}
      dangerouslySetInnerHTML={{
        __html:
          innerHtml +
          (showGuides
            ? fieldConfig.fields
                .map((f) => {
                  const node = design.nodesById[f.nodeId] as NormalizedNode | undefined;
                  if (!node || !node.visible) return "";
                  const stroke =
                    f.kind === "text" ? "rgba(16,185,129,0.9)" : "rgba(245,158,11,0.9)";
                  return `<rect x="${node.frame.x}" y="${node.frame.y}" width="${node.frame.width}" height="${node.frame.height}" fill="none" stroke="${stroke}" stroke-width="1" stroke-dasharray="4 3"/>`;
                })
                .join("")
            : "") +
          (showGuides && selected && (selected as NormalizedNode).frame
            ? `<rect x="${(selected as NormalizedNode).frame.x}" y="${(selected as NormalizedNode).frame.y}" width="${(selected as NormalizedNode).frame.width}" height="${(selected as NormalizedNode).frame.height}" fill="none" stroke="rgba(59,130,246,0.9)" stroke-width="1"/>`
            : ""),
      }}
    />
  );
}
