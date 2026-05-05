"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minus, Plus } from "lucide-react";

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
  const setView = useTemplateEditorStore((s) => s.setView);
  const setSelectedNodeId = useTemplateEditorStore((s) => s.setSelectedNodeId);

  // Zoom limits. Mirrors the store clamp so handlers can guard before commits.
  const ZOOM_MIN = 0.05;
  const ZOOM_MAX = 8;

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
    startMidX: number;
    startMidY: number;
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

  /**
   * Convert a screen-pixel cursor position to design-space coordinates given
   * the current view. Accepts the design element's bounding rect (post-CSS-
   * transform). Used by both wheel zoom and pinch zoom so they stay anchored
   * to the cursor / pinch midpoint exactly.
   */
  const cursorToDesignSpace = useCallback(
    (rect: DOMRect, clientX: number, clientY: number, currentZoom: number) => ({
      x: (clientX - rect.left) / currentZoom,
      y: (clientY - rect.top) / currentZoom,
    }),
    [],
  );

  /**
   * Apply a new zoom level anchored to a fixed design-space pivot point
   * (so the pixel under the cursor / pinch midpoint stays put). Returns the
   * actual clamped zoom that was applied so callers can snapshot it.
   *
   * Single setView call → one render → no shimmy between zoom and pan.
   */
  const applyZoomAroundPivot = useCallback(
    (nextZoomRaw: number, pivot: { x: number; y: number }) => {
      const nextZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, nextZoomRaw));
      const nextPanX = panX + (zoom - nextZoom) * pivot.x;
      const nextPanY = panY + (zoom - nextZoom) * pivot.y;
      setView({ zoom: nextZoom, panX: nextPanX, panY: nextPanY });
      return nextZoom;
    },
    [panX, panY, setView, zoom],
  );

  /**
   * Compute the pan that centers the scaled design inside the viewport.
   *
   * Layout context:
   *   - The "centering wrapper" applies `translate(-50%, -50%)` to its own
   *     `canvasW × canvasH` box, parking the design's CSS top-left at
   *     `(viewport_center − canvasW/2, viewport_center − canvasH/2)`.
   *   - The design's `transform: translate(pan) scale(zoom)` uses
   *     `transformOrigin: 0 0`, so scaling expands from that top-left
   *     corner — at zoom < 1 the visual bounds shrink toward the upper-left.
   *
   * To re-center, we add a forward translation of `canvasW × (1 − zoom) / 2`
   * to nudge the scaled design back to the viewport center. At zoom = 1 the
   * formula yields pan = 0 (the centering wrapper already does the work).
   */
  const centeringPanFor = useCallback(
    (z: number) => ({
      panX: (canvasW * (1 - z)) / 2,
      panY: (canvasH * (1 - z)) / 2,
    }),
    [canvasH, canvasW],
  );

  // Default zoom for both initial mount and the "Fit" button. Constant across
  // surfaces (admin editor + end-user view) and viewport sizes so users get a
  // predictable starting view every time. They can zoom further in/out at
  // will via wheel / pinch / +- buttons / keyboard.
  const DEFAULT_FIT_ZOOM = 0.58;

  const fitToViewport = useCallback(() => {
    setView({ zoom: DEFAULT_FIT_ZOOM, ...centeringPanFor(DEFAULT_FIT_ZOOM) });
  }, [centeringPanFor, setView]);

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

  // Wheel zoom — Ctrl/Cmd + wheel (or pinch on trackpads, which browsers
  // synthesize with ctrlKey: true). Trackpad-aware: each event applies an
  // exponential factor proportional to deltaY magnitude, so a fast trackpad
  // pinch zooms quickly while a tiny scroll-wheel notch zooms gently.
  // Ctrl-less wheel falls through to native scrolling (no-op here since we
  // overflow-hidden, but lets future callers wire scroll panning).
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    function onWheel(e: WheelEvent) {
      // ctrlKey OR metaKey: macOS Safari uses metaKey for explicit zoom.
      // Browsers synthesize ctrlKey for trackpad pinch, so this catches both
      // intentional zoom and pinch-on-trackpad.
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      userAdjustedViewRef.current = true;

      // Smooth exponential factor — `Math.exp(deltaY * 0.005)` gives a gentle
      // ramp where small deltas (trackpad) produce small factors (~1.005)
      // and big deltas (mouse wheel notch ≈ 100) give noticeable ones (~1.65).
      // Inverted because positive deltaY means "zoom out" (scroll away).
      const factor = Math.exp(-e.deltaY * 0.005);

      const rect = designRef.current?.getBoundingClientRect();
      if (!rect) {
        setZoom(zoom * factor);
        return;
      }
      const pivot = cursorToDesignSpace(rect, e.clientX, e.clientY, zoom);
      applyZoomAroundPivot(zoom * factor, pivot);
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [applyZoomAroundPivot, cursorToDesignSpace, setZoom, zoom]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === "Space") {
        isPanningRef.current = true;
        setSpaceDown(true);
      }
      // Ctrl/Cmd + 0 → fit view. Ctrl/Cmd + +/= → zoom in. Ctrl/Cmd + - → zoom out.
      // All zoom shortcuts anchor around the design's center (no cursor
      // available for keyboard input), keeping the artboard stable.
      if (e.ctrlKey || e.metaKey) {
        if (e.key === "0") {
          e.preventDefault();
          userAdjustedViewRef.current = false;
          fitToViewport();
          return;
        }
        if (e.key === "=" || e.key === "+") {
          e.preventDefault();
          userAdjustedViewRef.current = true;
          const center = { x: canvasW / 2, y: canvasH / 2 };
          applyZoomAroundPivot(zoom * 1.2, center);
          return;
        }
        if (e.key === "-" || e.key === "_") {
          e.preventDefault();
          userAdjustedViewRef.current = true;
          const center = { x: canvasW / 2, y: canvasH / 2 };
          applyZoomAroundPivot(zoom / 1.2, center);
          return;
        }
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
  }, [applyZoomAroundPivot, canvasH, canvasW, fitToViewport, zoom]);

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
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    // Floor on the start distance — fingers very close together would produce
    // wild factors on first move. 12 px is a comfortable minimum.
    if (!Number.isFinite(dist) || dist < 12) return;

    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    const rect = designRef.current?.getBoundingClientRect();
    if (!rect) return;

    // Pivot in design-space (unscaled) — keeps content under fingers fixed
    // for the zoom component. Translation drift is handled separately via
    // startMidX/Y deltas in onPointerMove so the user can also "drag" while
    // pinching, like Maps and Figma.
    const pivot = cursorToDesignSpace(rect, midX, midY, zoom);

    pinchRef.current = {
      startDistance: dist,
      startZoom: zoom,
      startPanX: panX,
      startPanY: panY,
      pivotX: pivot.x,
      pivotY: pivot.y,
      startMidX: midX,
      startMidY: midY,
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

    // Pinch zoom (two pointers active). All zoom + pan goes through one
    // `setView` call so React commits the new view in a single render —
    // eliminates the visible "shimmy" the user sees from separate commits.
    if (pinchRef.current && pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values());
      const [a, b] = pts;
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      // Also track the pinch midpoint so the pivot drifts with the user's
      // fingers — a more natural feeling than locking the pivot at gesture start.
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const start = pinchRef.current;
      const factor = dist / Math.max(1, start.startDistance);
      const nextZoomRaw = start.startZoom * factor;
      const nextZoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, nextZoomRaw));

      // Pan is composed of (a) the cursor-anchored zoom term, plus (b) any
      // translation the pinch midpoint has done since the gesture began.
      const rect = designRef.current?.getBoundingClientRect();
      if (!rect) return;
      // Shift in screen pixels of the pinch midpoint since gesture start,
      // converted into the pre-gesture pan delta we need to apply.
      const midShiftX = midX - start.startMidX;
      const midShiftY = midY - start.startMidY;
      const nextPanX = start.startPanX + (start.startZoom - nextZoom) * start.pivotX + midShiftX;
      const nextPanY = start.startPanY + (start.startZoom - nextZoom) * start.pivotY + midShiftY;
      setView({ zoom: nextZoom, panX: nextPanX, panY: nextPanY });
      return;
    }

    // Drag pan — one finger or one mouse button.
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

  // We pass raw view values straight to the CSS transform — no rounding /
  // pixel-snap. Snapping caused visible jitter during interactive zoom
  // because every gesture frame would round to a slightly different value.
  // The bitmap canvas is already DPR-scaled by `CanvasShapesLayer`, so
  // crispness is preserved without snapping the outer transform.
  const canvasStyle: React.CSSProperties = {
    width: `${canvasW}px`,
    height: `${canvasH}px`,
    transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
    transformOrigin: "0 0",
    willChange: "transform",
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
      {/* Toolbar — segmented control style with icon buttons. Single pill on the
          right keeps the row clean; the zoom level click-target doubles as a
          quick "click to fit" affordance. */}
      <div className="flex items-center justify-between gap-3 border-b border-zinc-200/80 bg-white/95 px-3 py-2 backdrop-blur dark:border-zinc-800/80 dark:bg-zinc-900/80">
        <button
          type="button"
          onClick={() => {
            userAdjustedViewRef.current = false;
            fitToViewport();
          }}
          title="Click to fit (Ctrl/Cmd+0)"
          className="rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        >
          {Math.round(zoom * 100)}%
        </button>

        <div className="inline-flex items-center overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
          <button
            type="button"
            onClick={() => {
              userAdjustedViewRef.current = true;
              applyZoomAroundPivot(zoom / 1.2, { x: canvasW / 2, y: canvasH / 2 });
            }}
            title="Zoom out (Ctrl/Cmd+−)"
            aria-label="Zoom out"
            className="inline-flex h-8 w-8 items-center justify-center text-zinc-700 transition-colors hover:bg-zinc-50 active:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:active:bg-zinc-700"
            disabled={zoom <= ZOOM_MIN + 1e-6}
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <div className="h-5 w-px bg-zinc-200 dark:bg-zinc-800" aria-hidden />
          <button
            type="button"
            onClick={() => {
              userAdjustedViewRef.current = true;
              applyZoomAroundPivot(zoom * 1.2, { x: canvasW / 2, y: canvasH / 2 });
            }}
            title="Zoom in (Ctrl/Cmd+=)"
            aria-label="Zoom in"
            className="inline-flex h-8 w-8 items-center justify-center text-zinc-700 transition-colors hover:bg-zinc-50 active:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:active:bg-zinc-700"
            disabled={zoom >= ZOOM_MAX - 1e-6}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <div className="h-5 w-px bg-zinc-200 dark:bg-zinc-800" aria-hidden />
          <button
            type="button"
            onClick={() => {
              userAdjustedViewRef.current = false;
              fitToViewport();
            }}
            title="Fit to view (Ctrl/Cmd+0, double-click)"
            aria-label="Fit to view"
            className="inline-flex h-8 w-8 items-center justify-center text-zinc-700 transition-colors hover:bg-zinc-50 active:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800 dark:active:bg-zinc-700"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div
        ref={wrapperRef}
        className={"relative flex-1 overflow-hidden touch-none " + cursorClass}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
        onClick={onClickSelect}
        onDoubleClick={() => {
          // Double-click anywhere in the workspace fits the design back into
          // view — fastest "get me back" gesture when the user pans/zooms
          // somewhere unhelpful. Reset the user-adjusted flag so subsequent
          // resize events resume their auto-fit behaviour.
          userAdjustedViewRef.current = false;
          fitToViewport();
        }}
      >
        {/* Subtle dotted backdrop. Lower opacity than before so it reads as
            texture rather than pattern — the artboard remains the focal point.
            Two layers (light/dark) so the contrast tracks the theme. */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.05)_1px,transparent_0)] bg-size-[18px_18px] dark:hidden" />
        <div className="absolute inset-0 hidden bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.06)_1px,transparent_0)] bg-size-[18px_18px] dark:block" />
        {/* Soft inner-shadow vignette to draw the eye toward the centre and
            give the workspace edges a finished feel. Pure CSS, no DOM cost. */}
        <div className="pointer-events-none absolute inset-0 [box-shadow:inset_0_0_60px_rgba(0,0,0,0.04)] dark:[box-shadow:inset_0_0_80px_rgba(0,0,0,0.35)]" />

        <div className="absolute left-1/2 top-1/2" style={{ transform: "translate(-50%, -50%)" }}>
          {/* Layered shadow: tight contact shadow (1px) + ambient shadow (40px)
              gives the artboard depth without heaviness. The 1px ring picks
              up on light bgs where shadow alone is invisible. */}
          <div
            ref={designRef}
            style={canvasStyle}
            className="relative shadow-[0_1px_2px_rgba(0,0,0,0.08),0_24px_48px_-12px_rgba(0,0,0,0.18)] ring-1 ring-black/5 dark:ring-white/5"
          >
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

        {/* Keyboard/mouse hint — desktop-only. On touch the gestures are
            self-evident and the chip would just take up screen real estate.
            Uses real <kbd> elements for semantic + visual key-cap feel. */}
        <div className="pointer-events-none absolute bottom-3 left-3 hidden items-center gap-1.5 rounded-full border border-zinc-200/80 bg-white/85 px-2.5 py-1 text-[11px] text-zinc-600 shadow-xs backdrop-blur md:inline-flex dark:border-zinc-800/80 dark:bg-zinc-900/75 dark:text-zinc-300">
          <span>Pan</span>
          {enableSelection ? (
            <kbd className="rounded border border-zinc-300 bg-white px-1 font-mono text-[10px] font-medium text-zinc-700 shadow-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
              Space
            </kbd>
          ) : (
            <kbd className="rounded border border-zinc-300 bg-white px-1 font-mono text-[10px] font-medium text-zinc-700 shadow-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
              drag
            </kbd>
          )}
          <span className="text-zinc-300 dark:text-zinc-600" aria-hidden>
            ·
          </span>
          <span>Zoom</span>
          <kbd className="rounded border border-zinc-300 bg-white px-1 font-mono text-[10px] font-medium text-zinc-700 shadow-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
            ⌘ Wheel
          </kbd>
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
