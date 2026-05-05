import { create } from "zustand";

/**
 * Cross-cutting "is the workspace dirty?" state shared between the template
 * editor (writer) and the admin shell (reader/intercepter).
 *
 * The editor sets `dirty = true` on every change and clears it back to false
 * once the debounced save lands. It also registers a `flushSave` callback
 * the shell can invoke to force-flush pending writes synchronously when the
 * admin chooses "Save & continue" from the unsaved-changes prompt.
 *
 * Both fields reset on workspace unmount so the prompt never fires from a
 * stale dirty flag after the editor has already navigated away.
 */
interface EditorDirtyState {
  dirty: boolean;
  flushSave: (() => Promise<void>) | null;
  setDirty: (v: boolean) => void;
  setFlushSave: (fn: (() => Promise<void>) | null) => void;
  reset: () => void;
}

export const useEditorDirty = create<EditorDirtyState>((set) => ({
  dirty: false,
  flushSave: null,
  setDirty: (v) => set({ dirty: v }),
  setFlushSave: (fn) => set({ flushSave: fn }),
  reset: () => set({ dirty: false, flushSave: null }),
}));
