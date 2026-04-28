import { create } from "zustand";

export type EditorViewportState = {
  zoom: number;
  panX: number;
  panY: number;
  setZoom: (zoom: number) => void;
  setPan: (panX: number, panY: number) => void;
  resetView: () => void;
};

export type EditorSelectionState = {
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
};

export type TemplateEditorState = EditorViewportState & EditorSelectionState;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export const useTemplateEditorStore = create<TemplateEditorState>((set) => ({
  zoom: 1,
  panX: 0,
  panY: 0,
  setZoom: (zoom) => set({ zoom: clamp(zoom, 0.1, 8) }),
  setPan: (panX, panY) => set({ panX, panY }),
  resetView: () => set({ zoom: 1, panX: 0, panY: 0 }),

  selectedNodeId: null,
  setSelectedNodeId: (id) => set({ selectedNodeId: id }),
}));
