"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { NormalizedDesignV1, NormalizedNode } from "@/lib/figma";
import { createCanvasGradient, roundRect } from "@/lib/render/canvasShapes";
import { drawImageCoverContain, drawImagePlaceholder } from "@/lib/render/drawImage";
import { hitTestNodeId } from "@/lib/render/hitTest";
import { applyTextCase, resolveEffectiveTextCase } from "@/lib/render/textCase";
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

  // Fractional canvas sizes + subpixel transforms can make a “100%” view look blurry.
  // Snap the stage size and pan to the device pixel grid for crisp rendering.
  const canvasW = useMemo(() => Math.max(1, Math.round(design.canvas.width)), [design.canvas.width]);
  const canvasH = useMemo(() => Math.max(1, Math.round(design.canvas.height)), [design.canvas.height]);
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
  orderedNodeIds,
  colorOverrideByNodeId,
  previewImageByNodeId,
}: {
  design: NormalizedDesignV1;
  orderedNodeIds: string[];
  colorOverrideByNodeId: Record<string, string>;
  previewImageByNodeId: Record<string, { url: string; objectFit: "cover" | "contain" }>;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imagesRef = useRef(new Map<string, HTMLImageElement>());
  const [imageTick, setImageTick] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const ids = orderedNodeIds.filter((id) => {
      const node = design.nodesById[id] as NormalizedNode | undefined;
      if (!node) return false;
      if (!node.visible || node.opacity <= 0) return false;
      if (node.kind !== "shape" && node.kind !== "container") return false;
      return node.fills.some((f) => f.kind === "image") && Boolean(previewImageByNodeId[id]?.url);
    });

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
      img.decode?.().then(bump).catch(() => {
        // ignore
      });
    }

    return () => {
      cancelled = true;
    };
  }, [design.nodesById, orderedNodeIds, previewImageByNodeId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = Math.max(1, Math.round(design.canvas.width));
    const cssHeight = Math.max(1, Math.round(design.canvas.height));
    const bufferWidth = Math.max(1, Math.round(cssWidth * dpr));
    const bufferHeight = Math.max(1, Math.round(cssHeight * dpr));

    canvas.width = bufferWidth;
    canvas.height = bufferHeight;
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const ctx2: CanvasRenderingContext2D = ctx;
    const scaleX = bufferWidth / cssWidth;
    const scaleY = bufferHeight / cssHeight;
    ctx2.setTransform(scaleX, 0, 0, scaleY, 0, 0);

    // Background
    ctx2.clearRect(0, 0, cssWidth, cssHeight);
    if (design.canvas.background?.css) {
      ctx2.fillStyle = design.canvas.background.css;
      ctx2.fillRect(0, 0, cssWidth, cssHeight);
    } else {
      ctx2.fillStyle = "white";
      ctx2.fillRect(0, 0, cssWidth, cssHeight);
    }

    function drawSelf(node: Exclude<NormalizedNode, { kind: "text" }>) {
      // Draw node fills/strokes in a nested save/restore so we can rotate the node itself
      // without breaking child absolute positioning.
      ctx2.save();

      const canUseMatrix = Boolean(node.transform && node.size);
      let baseTransform: DOMMatrix | null = null;
      let nodeSpaceTransform: DOMMatrix | null = null;
      if (canUseMatrix && node.transform && node.size) {
        // Render node in its own local coordinate space using the export-provided transform.
        baseTransform = ctx2.getTransform();
        ctx2.transform(node.transform.a, node.transform.b, node.transform.c, node.transform.d, node.transform.tx, node.transform.ty);
        nodeSpaceTransform = ctx2.getTransform();
      } else if (node.rotation && Math.abs(node.rotation) > 0.001) {
        const cx = node.frame.x + node.frame.width / 2;
        const cy = node.frame.y + node.frame.height / 2;
        ctx2.translate(cx, cy);
        ctx2.rotate((node.rotation * Math.PI) / 180);
        ctx2.translate(-cx, -cy);
      }

      const { x, y, width, height } = node.frame;
      const localX = 0;
      const localY = 0;
      const localW = node.size?.width ?? width;
      const localH = node.size?.height ?? height;
      const radius = node.cornerRadius;

      const overrideColor = colorOverrideByNodeId[node.id];

      // Fills
      if (overrideColor) {
        ctx2.fillStyle = overrideColor;

        if (node.kind === "shape" && node.vectorPaths?.length) {
          try {
            const p = buildCompoundVectorPath(node.vectorPaths);
            if (!p) throw new Error("No valid vector paths");
            const local = areLikelyLocalSvgPaths(node.vectorPaths, { x: 0, y: 0, width: localW, height: localH });
            if (local) {
              if (canUseMatrix) ctx2.fill(p);
              else {
                ctx2.save();
                ctx2.translate(x, y);
                ctx2.fill(p);
                ctx2.restore();
              }
            } else {
              if (canUseMatrix) {
                if (baseTransform && nodeSpaceTransform) {
                  ctx2.setTransform(baseTransform);
                  ctx2.fill(p);
                  ctx2.setTransform(nodeSpaceTransform);
                } else {
                  ctx2.fill(p);
                }
              } else ctx2.fill(p);
            }
          } catch {
            if (radius && (radius.tl || radius.tr || radius.bl || radius.br)) {
              roundRect(ctx2, canUseMatrix ? localX : x, canUseMatrix ? localY : y, canUseMatrix ? localW : width, canUseMatrix ? localH : height, radius);
              ctx2.fill();
            } else {
              ctx2.fillRect(canUseMatrix ? localX : x, canUseMatrix ? localY : y, canUseMatrix ? localW : width, canUseMatrix ? localH : height);
            }
          }
        } else if (radius && (radius.tl || radius.tr || radius.bl || radius.br)) {
          roundRect(ctx2, canUseMatrix ? localX : x, canUseMatrix ? localY : y, canUseMatrix ? localW : width, canUseMatrix ? localH : height, radius);
          ctx2.fill();
        } else {
          ctx2.fillRect(canUseMatrix ? localX : x, canUseMatrix ? localY : y, canUseMatrix ? localW : width, canUseMatrix ? localH : height);
        }
      } else {
        for (const fill of node.fills) {

          if (fill.kind === "solid") {
            ctx2.fillStyle = fill.css;
          } else if (fill.kind === "gradient") {
            const g = createCanvasGradient(ctx2, canUseMatrix ? { x: localX, y: localY, width: localW, height: localH } : node.frame, fill);
            ctx2.fillStyle = g ?? fill.cssFallback;
          } else if (fill.kind === "image") {
            const override = previewImageByNodeId[node.id];
            const img = override ? imagesRef.current.get(node.id) : undefined;
            const ready = Boolean(img && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0);

            // Always render something for IMAGE fills. If no override image is available,
            // show a default placeholder clipped to the same mask.
            ctx2.save();

            // Mask-first: clip to node geometry before drawing the image/placeholder.
            if (node.kind === "shape" && node.vectorPaths?.length) {
              try {
                const p = buildCompoundVectorPath(node.vectorPaths);
                if (!p) throw new Error("No valid vector paths");
                const local = areLikelyLocalSvgPaths(node.vectorPaths, { x: 0, y: 0, width: localW, height: localH });
                if (local) {
                  if (canUseMatrix) {
                    ctx2.clip(p);
                  } else {
                    ctx2.translate(x, y);
                    ctx2.clip(p);
                    ctx2.translate(-x, -y);
                  }
                } else {
                  if (canUseMatrix) {
                    if (baseTransform && nodeSpaceTransform) {
                      ctx2.setTransform(baseTransform);
                      ctx2.clip(p);
                      ctx2.setTransform(nodeSpaceTransform);
                    } else {
                      ctx2.clip(p);
                    }
                  } else {
                    ctx2.clip(p);
                  }
                }
              } catch {
                if (radius && (radius.tl || radius.tr || radius.bl || radius.br)) {
                  roundRect(ctx2, canUseMatrix ? localX : x, canUseMatrix ? localY : y, canUseMatrix ? localW : width, canUseMatrix ? localH : height, radius);
                  ctx2.clip();
                } else {
                  ctx2.beginPath();
                  ctx2.rect(canUseMatrix ? localX : x, canUseMatrix ? localY : y, canUseMatrix ? localW : width, canUseMatrix ? localH : height);
                  ctx2.clip();
                }
              }
            } else if (radius && (radius.tl || radius.tr || radius.bl || radius.br)) {
              roundRect(ctx2, canUseMatrix ? localX : x, canUseMatrix ? localY : y, canUseMatrix ? localW : width, canUseMatrix ? localH : height, radius);
              ctx2.clip();
            } else {
              ctx2.beginPath();
              ctx2.rect(canUseMatrix ? localX : x, canUseMatrix ? localY : y, canUseMatrix ? localW : width, canUseMatrix ? localH : height);
              ctx2.clip();
            }

            if (override && img && ready) {
              drawImageCoverContain(
                ctx2,
                img,
                canUseMatrix ? localX : x,
                canUseMatrix ? localY : y,
                canUseMatrix ? localW : width,
                canUseMatrix ? localH : height,
                override.objectFit,
              );
            } else {
              drawImagePlaceholder(
                ctx2,
                canUseMatrix ? localX : x,
                canUseMatrix ? localY : y,
                canUseMatrix ? localW : width,
                canUseMatrix ? localH : height,
                { label: "IMAGE" },
              );
            }

            ctx2.restore();
            continue;
          } else {
            continue;
          }

          if (node.kind === "shape" && node.vectorPaths?.length) {
            try {
              const p = buildCompoundVectorPath(node.vectorPaths);
              if (!p) throw new Error("No valid vector paths");
              const local = areLikelyLocalSvgPaths(node.vectorPaths, { x: 0, y: 0, width: localW, height: localH });
              if (local) {
                // If we have the matrix, it's already positioning local geometry.
                if (canUseMatrix) ctx2.fill(p);
                else {
                  ctx2.save();
                  ctx2.translate(x, y);
                  ctx2.fill(p);
                  ctx2.restore();
                }
              } else {
                // Path is likely already absolute; draw in absolute coords (matrix path would double-transform).
                if (canUseMatrix) {
                  if (baseTransform && nodeSpaceTransform) {
                    ctx2.setTransform(baseTransform);
                    ctx2.fill(p);
                    ctx2.setTransform(nodeSpaceTransform);
                  } else {
                    ctx2.fill(p);
                  }
                } else ctx2.fill(p);
              }
            } catch {
              if (radius && (radius.tl || radius.tr || radius.bl || radius.br)) {
                roundRect(ctx2, canUseMatrix ? localX : x, canUseMatrix ? localY : y, canUseMatrix ? localW : width, canUseMatrix ? localH : height, radius);
                ctx2.fill();
              } else {
                ctx2.fillRect(canUseMatrix ? localX : x, canUseMatrix ? localY : y, canUseMatrix ? localW : width, canUseMatrix ? localH : height);
              }
            }
          } else if (radius && (radius.tl || radius.tr || radius.bl || radius.br)) {
            roundRect(ctx2, canUseMatrix ? localX : x, canUseMatrix ? localY : y, canUseMatrix ? localW : width, canUseMatrix ? localH : height, radius);
            ctx2.fill();
          } else {
            ctx2.fillRect(canUseMatrix ? localX : x, canUseMatrix ? localY : y, canUseMatrix ? localW : width, canUseMatrix ? localH : height);
          }
        }
      }

      // Strokes
      for (const s of node.strokes) {
        if (s.weight <= 0) continue;
        const { x, y, width, height } = node.frame;
        const localX = 0;
        const localY = 0;
        const localW = node.size?.width ?? width;
        const localH = node.size?.height ?? height;
        const radius = node.cornerRadius;
          ctx2.strokeStyle = s.css;
          ctx2.lineWidth = s.weight;
        if (node.kind === "shape" && node.vectorPaths?.length) {
          try {
            const p = buildCompoundVectorPath(node.vectorPaths);
            if (!p) throw new Error("No valid vector paths");
            const local = areLikelyLocalSvgPaths(node.vectorPaths, { x: 0, y: 0, width: localW, height: localH });
            if (local) {
              if (canUseMatrix) ctx2.stroke(p);
              else {
                ctx2.save();
                ctx2.translate(x, y);
                ctx2.stroke(p);
                ctx2.restore();
              }
            } else {
              if (canUseMatrix) {
                if (baseTransform && nodeSpaceTransform) {
                  ctx2.setTransform(baseTransform);
                  ctx2.stroke(p);
                  ctx2.setTransform(nodeSpaceTransform);
                } else {
                  ctx2.stroke(p);
                }
              } else ctx2.stroke(p);
            }
          } catch {
            if (radius && (radius.tl || radius.tr || radius.bl || radius.br)) {
                roundRect(ctx2, canUseMatrix ? localX : x, canUseMatrix ? localY : y, canUseMatrix ? localW : width, canUseMatrix ? localH : height, radius);
                ctx2.stroke();
            } else {
                ctx2.strokeRect(canUseMatrix ? localX : x, canUseMatrix ? localY : y, canUseMatrix ? localW : width, canUseMatrix ? localH : height);
            }
          }
        } else if (radius && (radius.tl || radius.tr || radius.bl || radius.br)) {
            roundRect(ctx2, canUseMatrix ? localX : x, canUseMatrix ? localY : y, canUseMatrix ? localW : width, canUseMatrix ? localH : height, radius);
            ctx2.stroke();
        } else {
            ctx2.strokeRect(canUseMatrix ? localX : x, canUseMatrix ? localY : y, canUseMatrix ? localW : width, canUseMatrix ? localH : height);
        }
      }

      ctx2.restore();
    }

    function clipToNode(node: Extract<NormalizedNode, { kind: "container" }>) {
      const radius = node.cornerRadius;
      if (node.transform && node.size) {
        const prev = ctx2.getTransform();
        ctx2.transform(node.transform.a, node.transform.b, node.transform.c, node.transform.d, node.transform.tx, node.transform.ty);
        if (radius && (radius.tl || radius.tr || radius.bl || radius.br)) {
          roundRect(ctx2, 0, 0, node.size.width, node.size.height, radius);
          ctx2.clip();
        } else {
          ctx2.beginPath();
          ctx2.rect(0, 0, node.size.width, node.size.height);
          ctx2.clip();
        }
        ctx2.setTransform(prev);
        return;
      }

      const { x, y, width, height } = node.frame;
      if (radius && (radius.tl || radius.tr || radius.bl || radius.br)) {
        roundRect(ctx2, x, y, width, height, radius);
        ctx2.clip();
      } else {
        ctx2.beginPath();
        ctx2.rect(x, y, width, height);
        ctx2.clip();
      }
    }

    function renderNode(id: string, inheritedAlpha: number) {
      const node = design.nodesById[id] as NormalizedNode | undefined;
      if (!node) return;
      if (!node.visible) return;
      const alpha = inheritedAlpha * Math.max(0, Math.min(1, node.opacity));
      if (alpha <= 0) return;

      ctx2.save();
      ctx2.globalAlpha = alpha;

      // Apply clip on the current context so it affects all descendants.
      if (node.kind === "container" && node.clipsContent) {
        clipToNode(node);
      }

      if (node.kind !== "text") {
        drawSelf(node);
      }

      const children = design.childrenById[id] ?? [];
      for (const childId of children) renderNode(childId, alpha);

      ctx2.restore();
    }

    for (const rootId of design.rootIds) {
      renderNode(rootId, 1);
    }
  }, [design, orderedNodeIds, colorOverrideByNodeId, imageTick, previewImageByNodeId]);

  return <canvas ref={canvasRef} className="absolute inset-0" />;
}

function isLikelyLocalSvgPath(pathData: string, frame: { x: number; y: number; width: number; height: number }) {
  // Heuristic: many Figma exports provide `fillGeometry` paths in node-local coordinates.
  // If numbers look mostly within [0..maxDim], treat as local and translate by frame.x/y.
  const nums = pathData.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
  if (!nums || nums.length === 0) return false;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const n of nums) {
    const v = Number(n);
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return false;

  const maxDim = Math.max(1, Math.max(frame.width, frame.height));
  const withinLocalBand = max <= maxDim * 1.25 && min >= -maxDim * 0.25;
  const looksAbsolute = max >= maxDim * 2 || min <= -maxDim * 2;
  if (looksAbsolute) return false;
  return withinLocalBand;
}

function areLikelyLocalSvgPaths(paths: string[], frame: { x: number; y: number; width: number; height: number }) {
  // Treat a vector as local only if all sub-paths appear local.
  return paths.every((p) => isLikelyLocalSvgPath(p, frame));
}

function buildCompoundVectorPath(paths: string[]): Path2D | null {
  const compound = new Path2D();
  let added = 0;
  for (const data of paths) {
    try {
      compound.addPath(new Path2D(data));
      added++;
    } catch {
      // ignore invalid sub-paths
    }
  }
  return added > 0 ? compound : null;
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
  const configured = new Map(fieldConfig.fields.map((f) => [f.nodeId, f] as const));

  const measureCanvas = useMemo(() => document.createElement("canvas"), []);

  const defs: React.ReactNode[] = [];
  const clipIdByNodeId = new Map<string, string>();
  const textClipIdByNodeId = new Map<string, string>();
  const textLocalClipIdByNodeId = new Map<string, string>();

  function ensureClipPath(node: Extract<NormalizedNode, { kind: "container" }>) {
    const existing = clipIdByNodeId.get(node.id);
    if (existing) return existing;

    const clipId = `clip-${node.id}`;
    clipIdByNodeId.set(node.id, clipId);

    const r = node.cornerRadius;
    // Approximate clipping as a rounded rect. This matches most Frame/Rectangle masks.
    defs.push(
      <clipPath key={clipId} id={clipId}>
        <rect
          x={node.frame.x}
          y={node.frame.y}
          width={node.frame.width}
          height={node.frame.height}
          rx={r ? Math.max(r.tl, r.tr, r.bl, r.br) : 0}
          ry={r ? Math.max(r.tl, r.tr, r.bl, r.br) : 0}
        />
      </clipPath>,
    );
    return clipId;
  }

  function ensureTextClipPath(node: Extract<NormalizedNode, { kind: "text" }>) {
    const existing = textClipIdByNodeId.get(node.id);
    if (existing) return existing;

    const clipId = `clip-text-${node.id}`;
    textClipIdByNodeId.set(node.id, clipId);
    defs.push(
      <clipPath key={clipId} id={clipId} clipPathUnits="userSpaceOnUse">
        <rect x={node.frame.x} y={node.frame.y} width={node.frame.width} height={node.frame.height} />
      </clipPath>,
    );
    return clipId;
  }

  function ensureTextLocalClipPath(node: Extract<NormalizedNode, { kind: "text" }>, localW: number, localH: number) {
    const existing = textLocalClipIdByNodeId.get(node.id);
    if (existing) return existing;

    const clipId = `clip-text-local-${node.id}`;
    textLocalClipIdByNodeId.set(node.id, clipId);
    defs.push(
      <clipPath key={clipId} id={clipId} clipPathUnits="userSpaceOnUse">
        <rect x={0} y={0} width={localW} height={localH} />
      </clipPath>,
    );
    return clipId;
  }

  function clampNumber(v: unknown, min: number, max: number) {
    const n = typeof v === "number" && Number.isFinite(v) ? v : NaN;
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  function computeLineHeightPx(
    lineHeight: { unit: string; value?: number } | undefined,
    fontSize: number,
    baseFontSize: number,
  ) {
    const lh = lineHeight;
    if (!lh) return Math.round(fontSize * 1.2);
    if (lh.unit === "PIXELS" && typeof lh.value === "number") {
      // Scale pixel line-height along with font size so shrink-to-fit behaves predictably.
      const ratio = baseFontSize > 0 ? fontSize / baseFontSize : 1;
      return lh.value * ratio;
    }
    if (lh.unit === "PERCENT" && typeof lh.value === "number") return (lh.value / 100) * fontSize;
    // AUTO or unknown
    return Math.round(fontSize * 1.2);
  }

  function letterSpacingPx(letterSpacing: { unit: string; value: number } | undefined, fontSize: number) {
    const ls = letterSpacing;
    if (!ls) return 0;
    if (ls.unit === "PERCENT") return (ls.value / 100) * fontSize;
    return ls.value;
  }

  function measureTextWidth(text: string, font: string, extraLetterSpacingPx: number) {
    const ctx = measureCanvas.getContext("2d");
    if (!ctx) return text.length * 8;
    ctx.font = font;
    const w = ctx.measureText(text).width;
    const ls = text.length > 1 ? (text.length - 1) * extraLetterSpacingPx : 0;
    return w + ls;
  }

  function wrapToWidth(input: string, maxWidth: number, font: string, extraLetterSpacingPx: number) {
    const tokens = input.split(/(\s+)/);
    const out: string[] = [];
    let line = "";

    function pushLine() {
      out.push(line.trimEnd());
      line = "";
    }

    for (const t of tokens) {
      const candidate = line + t;
      if (!line) {
        line = t;
        continue;
      }
      if (measureTextWidth(candidate, font, extraLetterSpacingPx) <= maxWidth) {
        line = candidate;
        continue;
      }

      // If token alone is too big, break by characters.
      if (measureTextWidth(t, font, extraLetterSpacingPx) > maxWidth) {
        pushLine();
        let chunk = "";
        for (const ch of t) {
          const next = chunk + ch;
          if (measureTextWidth(next, font, extraLetterSpacingPx) <= maxWidth || !chunk) {
            chunk = next;
          } else {
            out.push(chunk);
            chunk = ch;
          }
        }
        line = chunk;
      } else {
        pushLine();
        line = t;
      }
    }

    if (line.trim().length) pushLine();
    return out.length ? out : [""];
  }

  function renderTextNode(node: Extract<NormalizedNode, { kind: "text" }>) {
    const field = configured.get(node.id);
    const override = previewTextByNodeId[node.id];
    const isOverridden = Object.prototype.hasOwnProperty.call(previewTextByNodeId, node.id);
    const maxChars = field?.kind === "text" ? field.maxChars : undefined;
    const charactersRaw = override ?? node.text.characters;
    const characters =
      typeof maxChars === "number" && maxChars > 0
        ? charactersRaw.slice(0, maxChars)
        : charactersRaw;

    const fill = node.fills[0];
    const fillCss = fill?.kind === "solid" ? fill.css : "#000";

    const resolvedText = {
      fontSize: node.text.fontSize ?? 12,
      fontWeight: node.text.fontWeight ?? 400,
      fontFamily: node.text.fontFamily ?? "system-ui, -apple-system, Segoe UI, Roboto, Arial",
      fontStyle: node.text.fontStyle ?? "normal",
      lineHeight: node.text.lineHeight,
      letterSpacing: node.text.letterSpacing,
      textAlignHorizontal: node.text.textAlignHorizontal ?? "LEFT",
      textAlignVertical: node.text.textAlignVertical ?? "TOP",
      textCase: node.text.textCase,
      textDecoration: node.text.textDecoration ?? "none",
    };

    const anchor =
      resolvedText.textAlignHorizontal === "CENTER"
        ? "middle"
        : resolvedText.textAlignHorizontal === "RIGHT"
          ? "end"
          : "start";

    const localW = node.size?.width ?? node.frame.width;
    const localH = node.size?.height ?? node.frame.height;
    const m = node.transform;
    const useMatrixForOverriddenText = Boolean(isOverridden && m && localW > 0 && localH > 0);

    const x =
      useMatrixForOverriddenText
        ? anchor === "middle"
          ? localW / 2
          : anchor === "end"
            ? localW
            : 0
        : anchor === "middle"
          ? node.frame.x + node.frame.width / 2
          : anchor === "end"
            ? node.frame.x + node.frame.width
            : node.frame.x;

    const fontFamily = resolvedText.fontFamily;
    const fontStyle = resolvedText.fontStyle;
    const textDecoration = resolvedText.textDecoration;

    const outlinePaths = node.text.outlinePaths;
    if (!isOverridden && outlinePaths?.length) {
      const sizeW = node.size?.width ?? node.frame.width;
      const sizeH = node.size?.height ?? node.frame.height;
      const local = isLikelyLocalSvgPath(outlinePaths[0], { x: 0, y: 0, width: sizeW, height: sizeH });
      const m = node.transform;
      if (local && m) {
        const matrix = `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.tx} ${m.ty})`;
        return (
          <g key={node.id} transform={matrix} style={{ pointerEvents: "none" }}>
            {outlinePaths.map((d, idx) => (
              <path key={`${node.id}-ol-${idx}`} d={d} fill={fillCss} />
            ))}
          </g>
        );
      }

      // Fallback: previous translate-by-frame behavior
      const translate = local ? `translate(${node.frame.x} ${node.frame.y})` : undefined;
      return (
        <g key={node.id} transform={translate} style={{ pointerEvents: "none" }}>
          {outlinePaths.map((d, idx) => (
            <path key={`${node.id}-ol-${idx}`} d={d} fill={fillCss} />
          ))}
        </g>
      );
    }

    const effectiveTextCase = resolveEffectiveTextCase(resolvedText.textCase, field?.kind === "text" ? field.textBehavior?.case : undefined);
    const displayed = applyTextCase(characters, effectiveTextCase);

    const baseFontSize = resolvedText.fontSize;
    const behavior = field?.kind === "text"
      ? {
          autoScale: field.textBehavior?.autoScale ?? true,
          minFontSize: field.textBehavior?.minFontSize ?? baseFontSize,
          maxFontSize: field.textBehavior?.maxFontSize ?? baseFontSize,
          overflow: field.textBehavior?.overflow ?? "shrink",
        }
      : null;

    function layoutAt(fontSizeCandidate: number) {
      const lineHeightPx2 = computeLineHeightPx(resolvedText.lineHeight, fontSizeCandidate, baseFontSize);
      const lsPx = letterSpacingPx(resolvedText.letterSpacing, fontSizeCandidate);
      const font = `${fontStyle} ${resolvedText.fontWeight} ${fontSizeCandidate}px ${fontFamily}`;

      const layoutW = useMatrixForOverriddenText ? localW : node.frame.width;
      const layoutH = useMatrixForOverriddenText ? localH : node.frame.height;

      let lines: string[];
      if (behavior?.overflow === "wrap") {
        const paras = displayed.split("\n");
        lines = paras.flatMap((p) => wrapToWidth(p, Math.max(1, layoutW), font, lsPx));
      } else {
        lines = displayed.split("\n");
      }

      const maxW = lines.reduce(
        (m, line) => Math.max(m, measureTextWidth(line, font, lsPx)),
        0,
      );
      const h = lines.length * lineHeightPx2;
      return { fontSize: fontSizeCandidate, lineHeightPx: lineHeightPx2, lines, maxW, h, layoutW, layoutH };
    }

    let layout = layoutAt(baseFontSize);
    const shouldConstrain = Boolean(behavior);
    if (behavior?.autoScale || behavior?.overflow === "shrink") {
      const minFs = clampNumber(behavior.minFontSize, 1, 512);
      const maxFs = clampNumber(behavior.maxFontSize, minFs, 512);

      // Binary search for largest font size that fits.
      let lo = minFs;
      let hi = maxFs;
      let best = layoutAt(lo);
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2;
        const cand = layoutAt(mid);
        const fits = cand.maxW <= cand.layoutW + 0.25 && cand.h <= cand.layoutH + 0.25;
        if (fits) {
          best = cand;
          lo = mid;
        } else {
          hi = mid;
        }
      }
      layout = best;
    }

    const textBlockHeight = layout.lines.length * layout.lineHeightPx;
    const y =
      useMatrixForOverriddenText
        ? resolvedText.textAlignVertical === "CENTER"
          ? (localH - textBlockHeight) / 2
          : resolvedText.textAlignVertical === "BOTTOM"
            ? localH - textBlockHeight
            : 0
        : resolvedText.textAlignVertical === "CENTER"
          ? node.frame.y + (node.frame.height - textBlockHeight) / 2
          : resolvedText.textAlignVertical === "BOTTOM"
            ? node.frame.y + node.frame.height - textBlockHeight
            : node.frame.y;

    const rotated = !useMatrixForOverriddenText && node.rotation && Math.abs(node.rotation) > 0.001;
    const cx = node.frame.x + node.frame.width / 2;
    const cy = node.frame.y + node.frame.height / 2;
    const textTransform = rotated ? `rotate(${node.rotation} ${cx} ${cy})` : undefined;

    const outerTransform = useMatrixForOverriddenText && m
      ? `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.tx} ${m.ty})`
      : undefined;
    const clipPath = shouldConstrain
      ? useMatrixForOverriddenText
        ? `url(#${ensureTextLocalClipPath(node, localW, localH)})`
        : `url(#${ensureTextClipPath(node)})`
      : undefined;

    return (
      <g key={node.id} transform={outerTransform} clipPath={clipPath} style={{ pointerEvents: "none" }}>
        <text
          x={x}
          y={y}
          fill={fillCss}
          fontSize={layout.fontSize}
          fontWeight={resolvedText.fontWeight}
          fontStyle={fontStyle}
          textDecoration={textDecoration}
          textAnchor={anchor}
          dominantBaseline="hanging"
          xmlSpace="preserve"
          transform={textTransform}
          style={{
            fontFamily,
            letterSpacing:
              resolvedText.letterSpacing?.unit === "PERCENT"
                ? `${(resolvedText.letterSpacing.value / 100) * layout.fontSize}px`
                : `${resolvedText.letterSpacing?.value ?? 0}px`,
          }}
        >
          {layout.lines.map((line, idx) => (
            <tspan key={`${node.id}-${idx}`} x={x} dy={idx === 0 ? 0 : layout.lineHeightPx}>
              {line}
            </tspan>
          ))}
        </text>
      </g>
    );
  }

  function renderGroup(id: string): React.ReactNode {
    const node = design.nodesById[id] as NormalizedNode | undefined;
    if (!node) return null;
    if (!node.visible) return null;
    if (node.opacity <= 0) return null;

    const children = design.childrenById[id] ?? [];
    const renderedChildren = children.map((childId) => renderGroup(childId));

    const self = node.kind === "text" ? renderTextNode(node) : null;

    if (!self && renderedChildren.every((c) => c == null)) return null;

    const clipPath = node.kind === "container" && node.clipsContent ? `url(#${ensureClipPath(node)})` : undefined;

    return (
      <g key={`g-${id}`} opacity={node.opacity} clipPath={clipPath}>
        {self}
        {renderedChildren}
      </g>
    );
  }

  return (
    <svg
      className="absolute inset-0"
      width={design.canvas.width}
      height={design.canvas.height}
      viewBox={`0 0 ${design.canvas.width} ${design.canvas.height}`}
    >
      {defs.length ? <defs>{defs}</defs> : null}

      {design.rootIds.map((rootId) => renderGroup(rootId))}

      {showGuides
        ? fieldConfig.fields.map((f) => {
        const node = design.nodesById[f.nodeId] as NormalizedNode | undefined;
        if (!node) return null;
        if (!node.visible) return null;
        return (
          <rect
            key={`field-${f.id}`}
            x={node.frame.x}
            y={node.frame.y}
            width={node.frame.width}
            height={node.frame.height}
            fill="none"
            stroke={f.kind === "text" ? "rgba(16,185,129,0.9)" : "rgba(245,158,11,0.9)"}
            strokeWidth={1}
            strokeDasharray="4 3"
          />
        );
      })
        : null}

      {showGuides && selected && (selected as NormalizedNode).frame ? (
        <rect
          x={(selected as NormalizedNode).frame.x}
          y={(selected as NormalizedNode).frame.y}
          width={(selected as NormalizedNode).frame.width}
          height={(selected as NormalizedNode).frame.height}
          fill="none"
          stroke="rgba(59,130,246,0.9)"
          strokeWidth={1}
        />
      ) : null}
    </svg>
  );
}

