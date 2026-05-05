import { create } from "zustand";

export type EditorViewportState = {
  zoom: number;
  panX: number;
  panY: number;
  setZoom: (zoom: number) => void;
  setPan: (panX: number, panY: number) => void;
  /**
   * Atomic update of zoom + pan in a single store transaction. Prefer this
   * over separate `setZoom` + `setPan` calls during interactive gestures
   * (wheel zoom, pinch zoom, programmatic fit) — it produces one render per
   * frame instead of two, which eliminates the visible "shimmy" the user
   * sees when zoom and pan land on different commits.
   */
  setView: (next: { zoom: number; panX: number; panY: number }) => void;
  resetView: () => void;
};

export type EditorSelectionState = {
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
};

export type TemplateEditorState = EditorViewportState & EditorSelectionState;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

// Zoom is clamped to a sane range. 5% lower bound lets users zoom out to see
// huge artboards in full; 800% upper bound is the cap most design tools use
// for pixel-level inspection without losing layout coherence.
const ZOOM_MIN = 0.05;
const ZOOM_MAX = 8;

export const useTemplateEditorStore = create<TemplateEditorState>((set) => ({
  zoom: 1,
  panX: 0,
  panY: 0,
  setZoom: (zoom) => set({ zoom: clamp(zoom, ZOOM_MIN, ZOOM_MAX) }),
  setPan: (panX, panY) => set({ panX, panY }),
  setView: ({ zoom, panX, panY }) =>
    set({ zoom: clamp(zoom, ZOOM_MIN, ZOOM_MAX), panX, panY }),
  resetView: () => set({ zoom: 1, panX: 0, panY: 0 }),

  selectedNodeId: null,
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
}));
