"use client";

import { useState } from "react";
import {
  AtSign,
  Camera,
  ChevronDown,
  ChevronUp,
  FileText,
  Folder,
  Mail,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  User,
  type LucideIcon,
} from "lucide-react";

import type { FieldConfig, FieldSection } from "@/lib/storage/types";
import {
  DEFAULT_SECTION_ID,
  SECTION_PRESETS,
  makeSection,
} from "@/lib/storage/fieldSections";

const ICON_REGISTRY: Record<string, LucideIcon> = {
  User,
  Camera,
  Sparkles,
  AtSign,
  Mail,
  FileText,
  Folder,
};

export function sectionIcon(name: string | undefined): LucideIcon {
  if (name && ICON_REGISTRY[name]) return ICON_REGISTRY[name];
  return Folder;
}

type Props = {
  config: FieldConfig;
  onChange: (next: FieldConfig) => void;
};

/**
 * Inline section manager for the admin field-config panel.
 *
 * - Lists all sections with rename + delete
 * - One-click presets for common sections (Personal Details, Photos, etc.)
 * - Custom section creation via free-text input
 * - Reorder via up/down arrows (kept simple instead of drag-drop)
 *
 * When a section is deleted, fields belonging to it lose their `sectionId`
 * (they fall back to the default "Other" group rather than being orphaned
 * or silently moved).
 */
export function SectionsManager({ config, onChange }: Props) {
  const sections = (config.sections ?? []).slice().sort((a, b) => a.order - b.order);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [customLabel, setCustomLabel] = useState("");

  function addSection(init: { label: string; icon?: string }) {
    const next = makeSection(sections, init);
    onChange({ ...config, sections: [...sections, next] });
  }

  function addCustom() {
    const label = customLabel.trim();
    if (!label) return;
    addSection({ label, icon: "Folder" });
    setCustomLabel("");
  }

  function renameSection(id: string, label: string) {
    onChange({
      ...config,
      sections: sections.map((s) => (s.id === id ? { ...s, label } : s)),
    });
  }

  function deleteSection(id: string) {
    // Remove the section AND clear `sectionId` from any field that pointed to it,
    // so those fields fall into the default "Other" bucket instead of being lost.
    onChange({
      ...config,
      sections: sections.filter((s) => s.id !== id),
      fields: config.fields.map((f) =>
        f.sectionId === id ? { ...f, sectionId: undefined } : f,
      ),
    });
  }

  function move(id: string, direction: -1 | 1) {
    const idx = sections.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const target = idx + direction;
    if (target < 0 || target >= sections.length) return;
    const swapped = [...sections];
    [swapped[idx], swapped[target]] = [swapped[target], swapped[idx]];
    // Re-number `order` so it stays gap-free and stable across renames.
    const renumbered = swapped.map((s, i) => ({ ...s, order: i }));
    onChange({ ...config, sections: renumbered });
  }

  function startEditing(s: FieldSection) {
    setEditingId(s.id);
    setEditLabel(s.label);
  }

  function commitEdit() {
    if (editingId == null) return;
    const label = editLabel.trim() || "Untitled section";
    renameSection(editingId, label);
    setEditingId(null);
  }

  const usedLabels = new Set(sections.map((s) => s.label.toLowerCase()));
  const presetSuggestions = SECTION_PRESETS.filter(
    (p) => !usedLabels.has(p.label.toLowerCase()),
  );

  return (
    <div className="space-y-3">
      {sections.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-3 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/40 dark:text-zinc-300">
          No sections yet. The user form will show all fields under one
          &ldquo;Details&rdquo; group. Add sections below to break the form
          into more digestible groups.
        </div>
      ) : (
        <ul className="space-y-1">
          {sections.map((s) => {
            const Icon = sectionIcon(s.icon);
            const isEditing = editingId === s.id;
            return (
              <li
                key={s.id}
                className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <Icon className="h-4 w-4 shrink-0 text-zinc-700 dark:text-zinc-300" />
                {isEditing ? (
                  <input
                    autoFocus
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitEdit();
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="h-7 min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-2 text-xs text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => startEditing(s)}
                    className="min-w-0 flex-1 truncate text-left text-xs font-medium text-zinc-900 hover:text-zinc-700 dark:text-zinc-100 dark:hover:text-zinc-300"
                  >
                    {s.label}
                  </button>
                )}
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => move(s.id, -1)}
                    title="Move up"
                    aria-label="Move up"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100 disabled:opacity-30 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(s.id, 1)}
                    title="Move down"
                    aria-label="Move down"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100 disabled:opacity-30 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => startEditing(s)}
                    title="Rename"
                    aria-label="Rename"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteSection(s.id)}
                    title="Delete"
                    aria-label="Delete"
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {presetSuggestions.length > 0 ? (
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Quick add
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {presetSuggestions.map((p) => {
              const Icon = sectionIcon(p.icon);
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => addSection(p)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-800 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="flex gap-1.5">
        <input
          value={customLabel}
          onChange={(e) => setCustomLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addCustom();
          }}
          placeholder="Custom section name…"
          className="h-8 min-w-0 flex-1 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <button
          type="button"
          onClick={addCustom}
          disabled={!customLabel.trim()}
          className="inline-flex h-8 items-center justify-center gap-1 rounded-lg bg-zinc-900 px-2.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </button>
      </div>
    </div>
  );
}

/**
 * Compact section picker for individual fields. Renders the section as a
 * dropdown and a chip showing the current selection. Fields with no
 * sectionId default to the synthetic "Other" / "Details" bucket.
 */
export function FieldSectionPicker({
  config,
  field,
  onChange,
}: {
  config: FieldConfig;
  field: FieldConfig["fields"][number];
  onChange: (sectionId: string | undefined) => void;
}) {
  const sections = (config.sections ?? []).slice().sort((a, b) => a.order - b.order);
  const value = field.sectionId ?? DEFAULT_SECTION_ID;
  return (
    <select
      value={value}
      onChange={(e) =>
        onChange(e.target.value === DEFAULT_SECTION_ID ? undefined : e.target.value)
      }
      className="h-8 w-full rounded-lg border border-zinc-200 bg-white px-2 text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-100"
    >
      <option value={DEFAULT_SECTION_ID}>
        {sections.length ? "Other (no section)" : "Details (default)"}
      </option>
      {sections.map((s) => (
        <option key={s.id} value={s.id}>
          {s.label}
        </option>
      ))}
    </select>
  );
}
