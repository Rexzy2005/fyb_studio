"use client";

import { nanoid } from "nanoid";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Image as ImageIcon,
  Layers,
  Palette,
  Search,
  Type,
  X,
} from "lucide-react";

import type { NormalizedDesignV1, NormalizedNode } from "@/lib/figma";
import type { FieldConfig } from "@/lib/storage/types";
import { ImageUpload } from "@/components/forms/ImageUpload";

import { FieldSectionPicker, SectionsManager } from "@/components/editor/SectionsManager";

const SECTIONS_PANEL_KEY = "fyb:admin:sections-panel-open";

type Props = {
  design: NormalizedDesignV1;
  config: FieldConfig;
  onChange: (next: FieldConfig) => void;
  selectedNodeId: string | null;
  onSelectNodeId: (nodeId: string | null) => void;
  previewTextByNodeId: Record<string, string>;
  onPreviewTextChange: (nodeId: string, value: string) => void;
  onPreviewImageChange: (nodeId: string, file: File | null) => void;
  previewColorByNodeId: Record<string, string>;
  onPreviewColorChange: (nodeId: string, value: string) => void;
  /** Required for design-asset uploads (admin-only image slots). May be null while the page is hydrating. */
  templateId?: string | null;
  /** Notifies the parent page that a design-asset blob was saved or removed, so the renderer can refetch. */
  onDesignAssetsChanged?: () => void;
};

type CandidateKind = "text" | "image" | "color";

const KIND_META: Record<CandidateKind, { Icon: typeof Type; label: string; chipClass: string }> = {
  text: {
    Icon: Type,
    label: "Text",
    chipClass: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  },
  image: {
    Icon: ImageIcon,
    label: "Image",
    chipClass: "bg-[rgba(245,158,11,0.08)] text-warning dark:bg-[rgba(245,158,11,0.16)] dark:text-warning",
  },
  color: {
    Icon: Palette,
    label: "Color",
    chipClass: "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  },
};

type Candidate = {
  id: string;
  name: string;
  kinds: CandidateKind[];
  node: NormalizedNode;
};

function getCandidateKinds(node: NormalizedNode): CandidateKind[] {
  const kinds: CandidateKind[] = [];
  if (node.kind === "text") kinds.push("text");

  if (node.kind === "shape" || node.kind === "container") {
    const hasImageFill = node.fills.some((f) => f.kind === "image");
    const hasColorFill = node.fills.some((f) => f.kind === "solid" || f.kind === "gradient");
    if (hasImageFill) kinds.push("image");
    if (hasColorFill) kinds.push("color");
  }

  return kinds;
}

export function FieldConfigPanel({
  design,
  config,
  onChange,
  selectedNodeId,
  onSelectNodeId,
  previewTextByNodeId,
  onPreviewTextChange,
  onPreviewImageChange,
  previewColorByNodeId,
  onPreviewColorChange,
  templateId = null,
  onDesignAssetsChanged,
}: Props) {
  type TextField = Extract<FieldConfig["fields"][number], { kind: "text" }>;
  type ImageField = Extract<FieldConfig["fields"][number], { kind: "image" }>;
  type ColorField = Extract<FieldConfig["fields"][number], { kind: "color" }>;

  const [query, setQuery] = useState("");

  // Form-sections panel collapse: defaults closed so the node list gets full
  // vertical real-estate. Choice persists across navigations.
  const [sectionsPanelOpen, setSectionsPanelOpen] = useState(false);
  useEffect(() => {
    const v = window.localStorage.getItem(SECTIONS_PANEL_KEY);
    if (v === "true") setSectionsPanelOpen(true);
  }, []);
  function toggleSectionsPanel() {
    setSectionsPanelOpen((v) => {
      const next = !v;
      window.localStorage.setItem(SECTIONS_PANEL_KEY, String(next));
      return next;
    });
  }

  const selectedNode = selectedNodeId ? design.nodesById[selectedNodeId] : undefined;
  const selectedField = selectedNodeId ? config.fields.find((f) => f.nodeId === selectedNodeId) : undefined;
  const sectionCount = config.sections?.length ?? 0;

  const selectedNodeKinds = selectedNode ? getCandidateKinds(selectedNode) : [];
  const canAddText = Boolean(selectedNodeId && selectedNodeKinds.includes("text"));
  const canAddImage = Boolean(selectedNodeId && selectedNodeKinds.includes("image"));
  const canAddColor = Boolean(selectedNodeId && selectedNodeKinds.includes("color"));

  const candidates: Candidate[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.values(design.nodesById)
      .filter((n) => n.visible)
      .map((node) => {
        const name = (node.name ?? node.id).trim() || node.id;
        return { id: node.id, name, kinds: getCandidateKinds(node), node } as Candidate;
      })
      .filter((c) => c.kinds.length > 0)
      .filter((c) => {
        if (!q) return true;
        return c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q);
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [design.nodesById, query]);

  function updateFields(nextFields: FieldConfig["fields"]) {
    onChange({ ...config, fields: nextFields });
  }

  function upsertFieldForNode(nodeId: string, nextField: FieldConfig["fields"][number]) {
    updateFields([...config.fields.filter((f) => f.nodeId !== nodeId), nextField]);
  }

  function removeFieldForNode(nodeId: string) {
    updateFields(config.fields.filter((f) => f.nodeId !== nodeId));
  }

  function addTextField(nodeId: string) {
    const node = design.nodesById[nodeId];
    if (!node || node.kind !== "text") return;
    const next: TextField = {
      id: nanoid(),
      nodeId,
      kind: "text",
      label: node.name?.trim() || "Text",
      editable: true,
      maxChars: 64,
      lockTypography: true,
      lockColor: true,
      lockAlignment: true,
      textBehavior: {
        autoScale: true,
        overflow: "shrink",
        minFontSize: 8,
      },
    };
    upsertFieldForNode(nodeId, next);
  }

  function addImageField(nodeId: string) {
    const node = design.nodesById[nodeId];
    if (!node || (node.kind !== "shape" && node.kind !== "container")) return;
    const next: ImageField = {
      id: nanoid(),
      nodeId,
      kind: "image",
      label: node.name?.trim() || "Image",
      editable: true,
      role: "user_photo",
      cropRule: "cover",
      imageBehavior: {
        fit: "cover",
        lockAspectRatio: true,
        allowReplace: true,
      },
    };
    upsertFieldForNode(nodeId, next);
  }

  function addColorField(nodeId: string) {
    const node = design.nodesById[nodeId];
    if (!node || (node.kind !== "shape" && node.kind !== "container")) return;
    const next: ColorField = {
      id: nanoid(),
      nodeId,
      kind: "color",
      label: node.name?.trim() || "Color",
      editable: true,
      role: "accent",
      colorBehavior: { enabled: true },
    };
    upsertFieldForNode(nodeId, next);
  }

  function updateTextField(id: string, patch: Partial<TextField>) {
    updateFields(config.fields.map((f) => (f.id === id && f.kind === "text" ? ({ ...f, ...patch } as TextField) : f)));
  }

  function updateImageField(id: string, patch: Partial<ImageField>) {
    updateFields(
      config.fields.map((f) => (f.id === id && f.kind === "image" ? ({ ...f, ...patch } as ImageField) : f)),
    );
  }

  function updateColorField(id: string, patch: Partial<ColorField>) {
    updateFields(
      config.fields.map((f) => (f.id === id && f.kind === "color" ? ({ ...f, ...patch } as ColorField) : f)),
    );
  }

  const configuredNodeIds = useMemo(() => new Set(config.fields.map((f) => f.nodeId)), [config.fields]);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-hairline bg-surface-1 dark:border-hairline dark:bg-surface-1">
      {/* Compact header - only one line, leaves more room for content. */}
      <div className="flex items-center justify-between gap-2 border-b border-hairline px-3 py-2.5 dark:border-hairline">
        <div className="flex min-w-0 items-center gap-2">
          <Layers className="h-4 w-4 shrink-0 text-ink-faint dark:text-ink-faint" />
          <div className="truncate text-sm font-semibold text-ink dark:text-ink">
            Fields
          </div>
        </div>
        <span
          className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-muted dark:bg-surface-2 dark:text-ink-muted"
          title={`${config.fields.length} configured field${config.fields.length === 1 ? "" : "s"}`}
        >
          {config.fields.length}
        </span>
      </div>

      {selectedNodeId === null ? (
        <>
          {/* Form-sections panel - collapsible header + body. State persists. */}
          <div className="border-b border-hairline dark:border-hairline">
            <button
              type="button"
              onClick={toggleSectionsPanel}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-semibold text-ink hover:bg-canvas dark:text-ink dark:hover:bg-surface-2/60"
              aria-expanded={sectionsPanelOpen}
              aria-controls="sections-panel-body"
            >
              <span className="flex items-center gap-2">
                <ChevronDown
                  className={
                    "h-3.5 w-3.5 text-ink-faint transition-transform duration-150 " +
                    (sectionsPanelOpen ? "" : "-rotate-90")
                  }
                />
                Form sections
              </span>
              <span className="text-[11px] font-normal text-ink-muted dark:text-ink-faint">
                {sectionCount === 0
                  ? "Default group"
                  : `${sectionCount} configured`}
              </span>
            </button>
            {sectionsPanelOpen ? (
              <div
                id="sections-panel-body"
                className="border-t border-hairline bg-canvas/60 p-3 dark:border-hairline dark:bg-surface-2/20"
              >
                <SectionsManager config={config} onChange={onChange} />
              </div>
            ) : null}
          </div>

          {/* Search with leading icon + clear button. */}
          <div className="border-b border-hairline p-3 dark:border-hairline">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search nodes…"
                className="h-9 w-full rounded-xl border border-hairline bg-surface-1 pl-8 pr-8 text-sm text-ink placeholder:text-ink-faint focus:border-accent-blue focus:outline-none dark:border-hairline dark:bg-surface-1 dark:text-ink dark:focus:border-accent-blue"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-1.5 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-ink-faint hover:bg-surface-2 hover:text-ink-muted dark:hover:bg-surface-2 dark:hover:text-ink"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {candidates.length === 0 ? (
              <div className="p-6 text-center text-xs text-ink-muted dark:text-ink-faint">
                {query
                  ? "No nodes match your search."
                  : "No editable nodes detected in this design."}
              </div>
            ) : (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {candidates.map((c) => {
                  const configured = configuredNodeIds.has(c.id);
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => onSelectNodeId(c.id)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-canvas dark:hover:bg-surface-2/60"
                      >
                        {/* Stack of kind badges (one per editable kind). */}
                        <div className="flex shrink-0 items-center gap-1">
                          {c.kinds.map((k) => {
                            const meta = KIND_META[k];
                            const Icon = meta.Icon;
                            return (
                              <span
                                key={k}
                                title={meta.label}
                                className={
                                  "inline-flex h-6 w-6 items-center justify-center rounded-md " +
                                  meta.chipClass
                                }
                              >
                                <Icon className="h-3.5 w-3.5" />
                              </span>
                            );
                          })}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-ink dark:text-ink">
                            {c.name}
                          </div>
                          <div className="truncate text-[11px] text-ink-faint dark:text-ink-faint">
                            {c.kinds.map((k) => KIND_META[k].label).join(" · ")}
                          </div>
                        </div>

                        {configured ? (
                          <span
                            title="Configured as a field"
                            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--accent-blue-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent-blue)] dark:bg-[var(--accent-blue-soft)] dark:text-[var(--accent-blue)]"
                          >
                            <Check className="h-2.5 w-2.5" />
                            Set
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {/* Refined breadcrumb: single back action with the node name as the title. */}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => onSelectNodeId(null)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-ink-muted hover:bg-surface-2 dark:text-ink dark:hover:bg-surface-2"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </button>
            <div
              className="min-w-0 flex-1 truncate text-right text-xs font-medium text-ink-muted dark:text-ink-muted"
              title={selectedNode?.name ?? selectedNodeId}
            >
              {selectedNode?.name ?? selectedNodeId}
            </div>
          </div>

          <div className="mt-3 space-y-4">
            <div className="rounded-xl border border-hairline bg-canvas p-3 dark:border-hairline dark:bg-surface-2/30">
              <div className="text-xs font-semibold text-ink dark:text-ink">Node</div>
              <div className="mt-1 break-all text-xs text-ink-muted dark:text-ink">{selectedNodeId}</div>
            </div>

            <div className="flex flex-wrap gap-2">
              {selectedField ? (
                <button
                  type="button"
                  onClick={() => removeFieldForNode(selectedNodeId)}
                  className="inline-flex h-9 items-center justify-center rounded-xl border border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.08)] px-3 text-xs font-medium text-danger hover:bg-[rgba(239,68,68,0.12)] dark:border-[rgba(239,68,68,0.28)] dark:bg-red-950/40 dark:text-danger dark:hover:bg-red-900/30"
                >
                  Remove field
                </button>
              ) : (
                <>
                  {canAddText ? (
                    <button
                      type="button"
                      onClick={() => addTextField(selectedNodeId)}
                      className="inline-flex h-9 items-center justify-center rounded-xl bg-surface-1 px-3 text-xs font-medium text-white hover:bg-surface-2 dark:bg-surface-2 dark:text-ink dark:hover:bg-surface-1"
                    >
                      Mark as text
                    </button>
                  ) : null}

                  {canAddImage ? (
                    <button
                      type="button"
                      onClick={() => addImageField(selectedNodeId)}
                      className="inline-flex h-9 items-center justify-center rounded-xl bg-surface-1 px-3 text-xs font-medium text-white hover:bg-surface-2 dark:bg-surface-2 dark:text-ink dark:hover:bg-surface-1"
                    >
                      Mark as image
                    </button>
                  ) : null}

                  {canAddColor ? (
                    <button
                      type="button"
                      onClick={() => addColorField(selectedNodeId)}
                      className="inline-flex h-9 items-center justify-center rounded-xl bg-surface-1 px-3 text-xs font-medium text-white hover:bg-surface-2 dark:bg-surface-2 dark:text-ink dark:hover:bg-surface-1"
                    >
                      Mark as color
                    </button>
                  ) : null}
                </>
              )}
            </div>

            {selectedField ? (
              <div className="space-y-3">
                <label className="grid gap-1">
                  <span className="text-xs font-medium text-ink dark:text-ink">Label</span>
                  <input
                    value={selectedField.label}
                    onChange={(e) => {
                      if (selectedField.kind === "text") updateTextField(selectedField.id, { label: e.target.value });
                      if (selectedField.kind === "image") updateImageField(selectedField.id, { label: e.target.value });
                      if (selectedField.kind === "color") updateColorField(selectedField.id, { label: e.target.value });
                    }}
                    className="h-9 rounded-xl border border-hairline bg-surface-1 px-3 text-sm text-ink dark:border-hairline dark:bg-surface-1 dark:text-ink"
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-xs font-medium text-ink dark:text-ink">Section</span>
                  <FieldSectionPicker
                    config={config}
                    field={selectedField}
                    onChange={(sectionId) => {
                      if (selectedField.kind === "text") updateTextField(selectedField.id, { sectionId });
                      if (selectedField.kind === "image") updateImageField(selectedField.id, { sectionId });
                      if (selectedField.kind === "color") updateColorField(selectedField.id, { sectionId });
                    }}
                  />
                </label>

                {selectedField.kind === "text" ? (
                  <>
                    <label className="grid gap-1">
                      <span className="text-xs font-medium text-ink dark:text-ink">Placeholder text</span>
                      <input
                        type="text"
                        value={selectedField.placeholder ?? ""}
                        placeholder="e.g. Enter your full name"
                        onChange={(e) => updateTextField(selectedField.id, { placeholder: e.target.value || undefined })}
                        className="h-9 rounded-xl border border-hairline bg-surface-1 px-3 text-sm text-ink dark:border-hairline dark:bg-surface-1 dark:text-ink"
                      />
                    </label>

                    <label className="grid gap-1">
                      <span className="text-xs font-medium text-ink dark:text-ink">Max characters</span>
                      <input
                        type="number"
                        min={1}
                        value={selectedField.maxChars ?? 64}
                        onChange={(e) => updateTextField(selectedField.id, { maxChars: Number(e.target.value) })}
                        className="h-9 rounded-xl border border-hairline bg-surface-1 px-3 text-sm text-ink dark:border-hairline dark:bg-surface-1 dark:text-ink"
                      />
                    </label>

                    <div className="rounded-2xl border border-hairline bg-canvas p-3 dark:border-hairline dark:bg-surface-2/30">
                      <div className="text-xs font-semibold text-ink dark:text-ink">Behavior</div>

                      <label className="mt-3 flex items-center justify-between gap-3">
                        <span className="text-xs font-medium text-ink dark:text-ink">Auto-scale to fit</span>
                        <input
                          type="checkbox"
                          checked={selectedField.textBehavior?.autoScale ?? true}
                          onChange={(e) =>
                            updateTextField(selectedField.id, {
                              textBehavior: {
                                autoScale: e.target.checked,
                                overflow: selectedField.textBehavior?.overflow ?? "shrink",
                                minFontSize: selectedField.textBehavior?.minFontSize,
                                maxFontSize: selectedField.textBehavior?.maxFontSize,
                                case: selectedField.textBehavior?.case,
                              },
                            })
                          }
                        />
                      </label>

                      <label className="mt-3 grid gap-1">
                        <span className="text-xs font-medium text-ink dark:text-ink">Text case</span>
                        <select
                          value={selectedField.textBehavior?.case ?? "as_design"}
                          onChange={(e) =>
                            updateTextField(selectedField.id, {
                              textBehavior: {
                                autoScale: selectedField.textBehavior?.autoScale ?? true,
                                overflow: selectedField.textBehavior?.overflow ?? "shrink",
                                minFontSize: selectedField.textBehavior?.minFontSize,
                                maxFontSize: selectedField.textBehavior?.maxFontSize,
                                case:
                                  e.target.value === "upper"
                                    ? "upper"
                                    : e.target.value === "lower"
                                      ? "lower"
                                      : e.target.value === "title"
                                        ? "title"
                                        : "as_design",
                              },
                            })
                          }
                          className="h-9 rounded-xl border border-hairline bg-surface-1 px-3 text-sm text-ink dark:border-hairline dark:bg-surface-1 dark:text-ink"
                        >
                          <option value="as_design">As designed</option>
                          <option value="upper">UPPERCASE</option>
                          <option value="lower">lowercase</option>
                          <option value="title">Title Case</option>
                        </select>
                      </label>

                      <label className="mt-3 grid gap-1">
                        <span className="text-xs font-medium text-ink dark:text-ink">Overflow</span>
                        <select
                          value={selectedField.textBehavior?.overflow ?? "shrink"}
                          onChange={(e) =>
                            updateTextField(selectedField.id, {
                              textBehavior: {
                                autoScale: selectedField.textBehavior?.autoScale ?? true,
                                overflow: e.target.value === "wrap" ? "wrap" : e.target.value === "clip" ? "clip" : "shrink",
                                minFontSize: selectedField.textBehavior?.minFontSize,
                                maxFontSize: selectedField.textBehavior?.maxFontSize,
                                case: selectedField.textBehavior?.case,
                              },
                            })
                          }
                          className="h-9 rounded-xl border border-hairline bg-surface-1 px-3 text-sm text-ink dark:border-hairline dark:bg-surface-1 dark:text-ink"
                        >
                          <option value="shrink">Shrink</option>
                          <option value="wrap">Wrap</option>
                          <option value="clip">Clip</option>
                        </select>
                      </label>

                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <label className="grid min-w-0 gap-1">
                          <span className="text-xs font-medium text-ink dark:text-ink">Min font</span>
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={selectedField.textBehavior?.minFontSize ?? 8}
                            onChange={(e) =>
                              updateTextField(selectedField.id, {
                                textBehavior: (() => {
                                  const nextMin = Number(e.target.value);
                                  const currentMax = selectedField.textBehavior?.maxFontSize;
                                  const clampedMax =
                                    typeof currentMax === "number" && Number.isFinite(currentMax)
                                      ? Math.max(nextMin, currentMax)
                                      : currentMax;
                                  return {
                                    autoScale: selectedField.textBehavior?.autoScale ?? true,
                                    overflow: selectedField.textBehavior?.overflow ?? "shrink",
                                    minFontSize: nextMin,
                                    maxFontSize: clampedMax,
                                    case: selectedField.textBehavior?.case,
                                  };
                                })(),
                              })
                            }
                            className="h-9 w-full rounded-xl border border-hairline bg-surface-1 px-3 text-sm text-ink dark:border-hairline dark:bg-surface-1 dark:text-ink"
                          />
                        </label>

                        <label className="grid min-w-0 gap-1">
                          <span className="text-xs font-medium text-ink dark:text-ink">Max font</span>
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={
                              selectedField.textBehavior?.maxFontSize ??
                              (selectedNode && selectedNode.kind === "text" ? selectedNode.text.fontSize ?? 12 : 12)
                            }
                            onChange={(e) =>
                              updateTextField(selectedField.id, {
                                textBehavior: (() => {
                                  const nextMax = Number(e.target.value);
                                  const currentMin = selectedField.textBehavior?.minFontSize;
                                  const clampedMin =
                                    typeof currentMin === "number" && Number.isFinite(currentMin)
                                      ? Math.min(currentMin, nextMax)
                                      : currentMin;
                                  return {
                                    autoScale: selectedField.textBehavior?.autoScale ?? true,
                                    overflow: selectedField.textBehavior?.overflow ?? "shrink",
                                    minFontSize: clampedMin,
                                    maxFontSize: nextMax,
                                    case: selectedField.textBehavior?.case,
                                  };
                                })(),
                              })
                            }
                            className="h-9 w-full rounded-xl border border-hairline bg-surface-1 px-3 text-sm text-ink dark:border-hairline dark:bg-surface-1 dark:text-ink"
                          />
                        </label>
                      </div>
                    </div>
                  </>
                ) : null}

                {selectedField.kind === "image" ? (
                  <>
                  <div className="rounded-2xl border border-hairline bg-canvas p-3 dark:border-hairline dark:bg-surface-2/30">
                    <div className="text-xs font-semibold text-ink dark:text-ink">Behavior</div>

                    <div className="mt-2 text-[11px] text-ink-muted dark:text-ink-muted">
                      Overflow is always clipped to the original placeholder shape.
                    </div>

                    <label className="mt-3 grid gap-1">
                      <span className="text-xs font-medium text-ink dark:text-ink">Fit</span>
                      <select
                        value={selectedField.imageBehavior?.fit ?? (selectedField.cropRule === "contain" ? "contain" : "cover")}
                        onChange={(e) => {
                          const fit = e.target.value === "contain" ? "contain" : "cover";
                          updateImageField(selectedField.id, {
                            cropRule: fit,
                            imageBehavior: {
                              fit,
                              lockAspectRatio: selectedField.imageBehavior?.lockAspectRatio ?? true,
                              allowReplace: selectedField.imageBehavior?.allowReplace ?? true,
                            },
                          });
                        }}
                        className="h-9 rounded-xl border border-hairline bg-surface-1 px-3 text-sm text-ink dark:border-hairline dark:bg-surface-1 dark:text-ink"
                      >
                        <option value="cover">Cover</option>
                        <option value="contain">Contain</option>
                      </select>
                    </label>

                    <label className="mt-3 flex items-center justify-between gap-3">
                      <span className="text-xs font-medium text-ink dark:text-ink">Lock aspect ratio</span>
                      <input
                        type="checkbox"
                        checked={selectedField.imageBehavior?.lockAspectRatio ?? true}
                        onChange={(e) =>
                          updateImageField(selectedField.id, {
                            imageBehavior: {
                              fit: selectedField.imageBehavior?.fit ?? (selectedField.cropRule === "contain" ? "contain" : "cover"),
                              lockAspectRatio: e.target.checked,
                              allowReplace: selectedField.imageBehavior?.allowReplace ?? true,
                            },
                          })
                        }
                      />
                    </label>

                    <label className="mt-3 flex items-center justify-between gap-3">
                      <span className="text-xs font-medium text-ink dark:text-ink">Allow replace</span>
                      <input
                        type="checkbox"
                        checked={selectedField.imageBehavior?.allowReplace ?? true}
                        onChange={(e) =>
                          updateImageField(selectedField.id, {
                            imageBehavior: {
                              fit: selectedField.imageBehavior?.fit ?? (selectedField.cropRule === "contain" ? "contain" : "cover"),
                              lockAspectRatio: selectedField.imageBehavior?.lockAspectRatio ?? true,
                              allowReplace: e.target.checked,
                            },
                          })
                        }
                      />
                    </label>
                  </div>
                  </>
                ) : null}

                {selectedField.kind === "color" ? (
                  <div className="rounded-2xl border border-hairline bg-canvas p-3 dark:border-hairline dark:bg-surface-2/30">
                    <div className="text-xs font-semibold text-ink dark:text-ink">Behavior</div>

                    <label className="mt-3 flex items-center justify-between gap-3">
                      <span className="text-xs font-medium text-ink dark:text-ink">Enabled</span>
                      <input
                        type="checkbox"
                        checked={selectedField.colorBehavior?.enabled ?? true}
                        onChange={(e) =>
                          updateColorField(selectedField.id, {
                            colorBehavior: {
                              enabled: e.target.checked,
                              palette: selectedField.colorBehavior?.palette,
                            },
                          })
                        }
                      />
                    </label>

                    <label className="mt-3 grid gap-1">
                      <span className="text-xs font-medium text-ink dark:text-ink">Palette (comma-separated hex)</span>
                      <input
                        value={(selectedField.colorBehavior?.palette ?? []).join(",")}
                        onChange={(e) => {
                          const palette = e.target.value
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean);
                          updateColorField(selectedField.id, {
                            colorBehavior: {
                              enabled: selectedField.colorBehavior?.enabled ?? true,
                              palette,
                            },
                          });
                        }}
                        placeholder="#000000,#FFFFFF"
                        className="h-9 rounded-xl border border-hairline bg-surface-1 px-3 text-sm text-ink placeholder:text-ink-faint dark:border-hairline dark:bg-surface-1 dark:text-ink"
                      />
                    </label>
                  </div>
                ) : null}
              </div>
            ) : null}

            {config.fields.length ? (
              <div className="rounded-2xl border border-dashed border-hairline bg-canvas p-3 text-xs text-ink-muted dark:border-hairline dark:bg-surface-2/40 dark:text-ink-muted">
                Use the <span className="font-medium">Preview</span> button at
                the top of the workspace to fill the form as a user would and
                watch the design update live.
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

/* Legacy cleanup pending
                          <span className="text-xs font-medium text-ink dark:text-ink">Role</span>
                          <select
                            value={selectedField.role}
                            onChange={(e) =>
                              updateImageField(selectedField.id, {
                                role: e.target.value === "logo" ? "logo" : "user_photo",
                              })
                            }
                            className="h-9 rounded-xl border border-hairline px-3 text-sm dark:border-hairline"
                          >
                            <option value="user_photo">User photo</option>
                            <option value="logo">Logo</option>
                          </select>
                        </label>

                        <div className="rounded-2xl border border-hairline bg-canvas p-3 dark:border-hairline dark:bg-surface-2/30">
                          <div className="text-xs font-semibold text-ink dark:text-ink">Behavior</div>
                          <div className="mt-1 text-[11px] text-ink-muted dark:text-ink-muted">Constraints applied at preview/export time.</div>

                          <label className="mt-3 grid gap-1">
                            <span className="text-xs font-medium text-ink dark:text-ink">Fit</span>
                            <select
                              value={selectedField.imageBehavior?.fit ?? (selectedField.cropRule ?? "cover")}
                              onChange={(e) => {
                                const fit = e.target.value === "contain" ? "contain" : "cover";
                                updateImageField(selectedField.id, {
                                  cropRule: fit,
                                  imageBehavior: {
                                    fit,
                                    lockAspectRatio: selectedField.imageBehavior?.lockAspectRatio ?? true,
                                    allowReplace: selectedField.imageBehavior?.allowReplace ?? true,
                                  },
                                });
                              }}
                              className="h-9 rounded-xl border border-hairline px-3 text-sm dark:border-hairline"
                            >
                              <option value="cover">Cover</option>
                              <option value="contain">Contain</option>
                            </select>
                          </label>

                          <label className="mt-3 flex items-center justify-between gap-3">
                            <span className="text-xs font-medium text-ink dark:text-ink">Lock aspect ratio</span>
                            <input
                              type="checkbox"
                              checked={selectedField.imageBehavior?.lockAspectRatio ?? true}
                              onChange={(e) =>
                                updateImageField(selectedField.id, {
                                  imageBehavior: {
                                    fit: selectedField.imageBehavior?.fit ?? (selectedField.cropRule ?? "cover"),
                                    lockAspectRatio: e.target.checked,
                                    allowReplace: selectedField.imageBehavior?.allowReplace ?? true,
                                  },
                                })
                              }
                            />
                          </label>

                          <label className="mt-3 flex items-center justify-between gap-3">
                            <span className="text-xs font-medium text-ink dark:text-ink">Allow user replace</span>
                            <input
                              type="checkbox"
                              checked={selectedField.imageBehavior?.allowReplace ?? true}
                              onChange={(e) =>
                                updateImageField(selectedField.id, {
                                  imageBehavior: {
                                    fit: selectedField.imageBehavior?.fit ?? (selectedField.cropRule ?? "cover"),
                                    lockAspectRatio: selectedField.imageBehavior?.lockAspectRatio ?? true,
                                    allowReplace: e.target.checked,
                                  },
                                })
                              }
                            />
                          </label>
                        </div>
                      </>
                    ) : null}

                    {selectedField.kind === "color" ? (
                      <>
                        <label className="grid gap-1">
                          <span className="text-xs font-medium text-ink dark:text-ink">Role</span>
                          <select
                            value={selectedField.role}
                            onChange={(e) =>
                              updateColorField(selectedField.id, {
                                role: e.target.value === "background" ? "background" : "accent",
                              })
                            }
                            className="h-9 rounded-xl border border-hairline px-3 text-sm dark:border-hairline"
                          >
                            <option value="accent">Accent</option>
                            <option value="background">Background</option>
                          </select>
                        </label>

                        <div className="rounded-2xl border border-hairline bg-canvas p-3 dark:border-hairline dark:bg-surface-2/30">
                          <div className="text-xs font-semibold text-ink dark:text-ink">Behavior</div>
                          <div className="mt-1 text-[11px] text-ink-muted dark:text-ink-muted">Controls whether users can change this color.</div>

                          <label className="mt-3 flex items-center justify-between gap-3">
                            <span className="text-xs font-medium text-ink dark:text-ink">Enable user color edit</span>
                            <input
                              type="checkbox"
                              checked={selectedField.colorBehavior?.enabled ?? true}
                              onChange={(e) =>
                                updateColorField(selectedField.id, {
                                  colorBehavior: {
                                    enabled: e.target.checked,
                                    palette: selectedField.colorBehavior?.palette,
                                  },
                                })
                              }
                            />
                          </label>

                          <label className="mt-3 grid gap-1">
                            <span className="text-xs font-medium text-ink dark:text-ink">Restricted palette (optional)</span>
                            <textarea
                              value={(selectedField.colorBehavior?.palette ?? []).join("\n")}
                              onChange={(e) => {
                                const lines = e.target.value
                                  .split(/\r?\n/)
                                  .map((v) => v.trim())
                                  .filter(Boolean);
                                updateColorField(selectedField.id, {
                                  colorBehavior: {
                                    enabled: selectedField.colorBehavior?.enabled ?? true,
                                    palette: lines.length ? lines : undefined,
                                  },
                                });
                              }}
                              placeholder="#FF0000\n#00FF00\n#0000FF"
                              className="min-h-20 rounded-xl border border-hairline p-3 font-mono text-xs dark:border-hairline"
                            />
                          </label>
                        </div>
                      </>
                    ) : null}
                  </div>
                ) : null}

                {config.fields.length ? (
                  <div className="rounded-2xl border border-hairline bg-canvas p-3 dark:border-hairline dark:bg-surface-2/30">
                    <div className="text-xs font-semibold text-ink dark:text-ink">Live Preview</div>
                    <div className="mt-1 text-[11px] text-ink-muted dark:text-ink-muted">Preview how user-provided data will render.</div>

                    <div className="mt-3 space-y-3">
                      {config.fields.map((f) => {
                        if (f.kind === "text") {
                          const value = previewTextByNodeId[f.nodeId] ?? "";
                          return (
                            <label key={f.id} className="grid gap-1">
                              <span className="text-xs font-medium text-ink dark:text-ink">{f.label}</span>
                              <input
                                value={value}
                                maxLength={f.maxChars}
                                onChange={(e) => onPreviewTextChange(f.nodeId, e.target.value)}
                                className="h-9 rounded-xl border border-hairline px-3 text-sm dark:border-hairline"
                                placeholder="Enter preview text"
                              />
                              {typeof f.maxChars === "number" ? (
                                <span className="text-[11px] text-ink-muted dark:text-ink-muted">
                                  {value.length}/{f.maxChars}
                                </span>
                              ) : null}
                            </label>
                          );
                        }

                        if (f.kind === "image") {
                          const allowReplace = f.imageBehavior?.allowReplace ?? true;
                          return (
                            <label key={f.id} className="grid gap-1">
                              <span className="text-xs font-medium text-ink dark:text-ink">{f.label}</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => onPreviewImageChange(f.nodeId, e.target.files?.[0] ?? null)}
                                disabled={!allowReplace}
                                className="block w-full text-xs"
                              />
                              <span className="text-[11px] text-ink-muted dark:text-ink-muted">
                                Fit: {f.imageBehavior?.fit ?? (f.cropRule ?? "cover")} • Replace: {allowReplace ? "on" : "off"}
                              </span>
                            </label>
                          );
                        }

                        if (f.kind === "color") {
                          const enabled = f.colorBehavior?.enabled ?? true;
                          if (!enabled) return null;

                          const palette = f.colorBehavior?.palette?.filter(Boolean) ?? [];
                          const value = previewColorByNodeId[f.nodeId] ?? (palette[0] ?? "#000000");

                          return (
                            <label key={f.id} className="grid gap-1">
                              <span className="text-xs font-medium text-ink dark:text-ink">{f.label}</span>
                              {palette.length ? (
                                <select
                                  value={value}
                                  onChange={(e) => onPreviewColorChange?.(f.nodeId, e.target.value)}
                                  className="h-9 rounded-xl border border-hairline px-3 text-sm dark:border-hairline"
                                >
                                  {palette.map((c) => (
                                    <option key={c} value={c}>
                                      {c}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  type="color"
                                  value={value}
                                  onChange={(e) => onPreviewColorChange?.(f.nodeId, e.target.value)}
                                  className="h-9 w-16 rounded-xl border border-hairline bg-surface-1 dark:border-hairline dark:bg-surface-1"
                                />
                              )}
                            </label>
                          );
                        }

                        return null;
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="text-xs text-ink-muted dark:text-ink-muted">Select a node to configure.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
/*
  onChange,
  selectedNodeId,
  onSelectNodeId,
  previewTextByNodeId,
  onPreviewTextChange,
  onPreviewImageChange,
  previewColorByNodeId = {},
  onPreviewColorChange,
}: Props) {
  type TextField = Extract<FieldConfig["fields"][number], { kind: "text" }>;
  type ImageField = Extract<FieldConfig["fields"][number], { kind: "image" }>;
  type ColorField = Extract<FieldConfig["fields"][number], { kind: "color" }>;

  const [query, setQuery] = useState("");
  const [view, setView] = useState<"nodes" | "selected">("nodes");

                    {selectedField.kind === "text" ? (
                      <>
                        <label className="grid gap-1">
                          <span className="text-xs font-medium text-ink dark:text-ink">Max characters</span>
                          <input
                            type="number"
                            min={1}
                            value={selectedField.maxChars ?? 64}
                            onChange={(e) => updateTextField(selectedField.id, { maxChars: Number(e.target.value) })}
                            className="h-9 rounded-xl border border-hairline px-3 text-sm dark:border-hairline"
                          />
                        </label>

                        <div className="rounded-2xl border border-hairline bg-canvas p-3 dark:border-hairline dark:bg-surface-2/30">
                          <div className="text-xs font-semibold text-ink dark:text-ink">Behavior</div>
                          <div className="mt-1 text-[11px] text-ink-muted dark:text-ink-muted">Constraints applied at render/export time.</div>

                          <label className="mt-3 flex items-center justify-between gap-3">
                            <span className="text-xs font-medium text-ink dark:text-ink">Auto-scale to fit</span>
                            <input
                              type="checkbox"
                              checked={selectedField.textBehavior?.autoScale ?? true}
                              onChange={(e) =>
                                updateTextField(selectedField.id, {
                                  textBehavior: {
                                    autoScale: e.target.checked,
                                    minFontSize: selectedField.textBehavior?.minFontSize,
                                    maxFontSize: selectedField.textBehavior?.maxFontSize,
                                    overflow: selectedField.textBehavior?.overflow ?? "shrink",
                                  },
                                })
                              }
                            />
                          </label>

                          <label className="mt-3 grid gap-1">
                            <span className="text-xs font-medium text-ink dark:text-ink">Overflow strategy</span>
                            <select
                              value={selectedField.textBehavior?.overflow ?? "shrink"}
                              onChange={(e) =>
                                updateTextField(selectedField.id, {
                                  textBehavior: {
                                    autoScale: selectedField.textBehavior?.autoScale ?? true,
                                    minFontSize: selectedField.textBehavior?.minFontSize,
                                    maxFontSize: selectedField.textBehavior?.maxFontSize,
                                    overflow:
                                      e.target.value === "wrap" ? "wrap" : e.target.value === "clip" ? "clip" : "shrink",
                                  },
                                })
                              }
                              className="h-9 rounded-xl border border-hairline px-3 text-sm dark:border-hairline"
                            >
                              <option value="shrink">Shrink</option>
                              <option value="wrap">Wrap</option>
                              <option value="clip">Clip</option>
                            </select>
                          </label>

                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <label className="grid gap-1">
                              <span className="text-xs font-medium text-ink dark:text-ink">Min font size</span>
                              <input
                                type="number"
                                min={1}
                                value={selectedField.textBehavior?.minFontSize ?? 8}
                                onChange={(e) =>
                                  updateTextField(selectedField.id, {
                                    textBehavior: {
                                      autoScale: selectedField.textBehavior?.autoScale ?? true,
                                      minFontSize: Number(e.target.value),
                                      maxFontSize: selectedField.textBehavior?.maxFontSize,
                                      overflow: selectedField.textBehavior?.overflow ?? "shrink",
                                    },
                                  })
                                }
                                className="h-9 rounded-xl border border-hairline px-3 text-sm dark:border-hairline"
                              />
                            </label>
                            <label className="grid gap-1">
                              <span className="text-xs font-medium text-ink dark:text-ink">Max font size</span>
                              <input
                                type="number"
                                min={1}
                                value={
                                  selectedField.textBehavior?.maxFontSize ??
                                  (selectedNode && selectedNode.kind === "text" ? selectedNode.text.fontSize ?? 12 : 12)
                                }
                                onChange={(e) =>
                                  updateTextField(selectedField.id, {
                                    textBehavior: {
                                      autoScale: selectedField.textBehavior?.autoScale ?? true,
                                      minFontSize: selectedField.textBehavior?.minFontSize,
                                      maxFontSize: Number(e.target.value),
                                      overflow: selectedField.textBehavior?.overflow ?? "shrink",
                                    },
                                  })
                                }
                                className="h-9 rounded-xl border border-hairline px-3 text-sm dark:border-hairline"
                              />
                            </label>
                          </div>
                        </div>
                      </>
                    ) : selectedField.kind === "image" ? (
                      <>
                        <label className="grid gap-1">
                          <span className="text-xs font-medium text-ink dark:text-ink">Role</span>
                          <select
                            value={selectedField.role}
                            onChange={(e) => updateImageField(selectedField.id, { role: e.target.value === "logo" ? "logo" : "user_photo" })}
                            className="h-9 rounded-xl border border-hairline px-3 text-sm dark:border-hairline"
                          >
                            <option value="user_photo">User photo</option>
                            <option value="logo">Logo</option>
                          </select>
                        </label>

                        <div className="rounded-2xl border border-hairline bg-canvas p-3 dark:border-hairline dark:bg-surface-2/30">
                          <div className="text-xs font-semibold text-ink dark:text-ink">Behavior</div>
                          <div className="mt-1 text-[11px] text-ink-muted dark:text-ink-muted">Constraints applied at preview/export time.</div>

                          <label className="mt-3 grid gap-1">
                            <span className="text-xs font-medium text-ink dark:text-ink">Fit</span>
                            <select
                              value={selectedField.imageBehavior?.fit ?? (selectedField.cropRule ?? "cover")}
                              onChange={(e) =>
                                updateImageField(selectedField.id, {
                                  imageBehavior: {
                                    fit: e.target.value === "contain" ? "contain" : "cover",
                                    lockAspectRatio: selectedField.imageBehavior?.lockAspectRatio ?? true,
                                    allowReplace: selectedField.imageBehavior?.allowReplace ?? true,
                                  },
                                  cropRule: e.target.value === "contain" ? "contain" : "cover",
                                })
                              }
                              className="h-9 rounded-xl border border-hairline px-3 text-sm dark:border-hairline"
                            >
                              <option value="cover">Cover</option>
                              <option value="contain">Contain</option>
                            </select>
                          </label>

                          <label className="mt-3 flex items-center justify-between gap-3">
                            <span className="text-xs font-medium text-ink dark:text-ink">Lock aspect ratio</span>
                            <input
                              type="checkbox"
                              checked={selectedField.imageBehavior?.lockAspectRatio ?? true}
                              onChange={(e) =>
                                updateImageField(selectedField.id, {
                                  imageBehavior: {
                                    fit: selectedField.imageBehavior?.fit ?? (selectedField.cropRule ?? "cover"),
                                    lockAspectRatio: e.target.checked,
                                    allowReplace: selectedField.imageBehavior?.allowReplace ?? true,
                                  },
                                })
                              }
                            />
                          </label>

                          <label className="mt-3 flex items-center justify-between gap-3">
                            <span className="text-xs font-medium text-ink dark:text-ink">Allow user replace</span>
                            <input
                              type="checkbox"
                              checked={selectedField.imageBehavior?.allowReplace ?? true}
                              onChange={(e) =>
                                updateImageField(selectedField.id, {
                                  imageBehavior: {
                                    fit: selectedField.imageBehavior?.fit ?? (selectedField.cropRule ?? "cover"),
                                    lockAspectRatio: selectedField.imageBehavior?.lockAspectRatio ?? true,
                                    allowReplace: e.target.checked,
                                  },
                                })
                              }
                            />
                          </label>
                        </div>
                      </>
                    ) : (
                      <>
                        <label className="grid gap-1">
                          <span className="text-xs font-medium text-ink dark:text-ink">Role</span>
                          <select
                            value={selectedField.role}
                            onChange={(e) => updateColorField(selectedField.id, { role: e.target.value === "background" ? "background" : "accent" })}
                            className="h-9 rounded-xl border border-hairline px-3 text-sm dark:border-hairline"
                          >
                            <option value="accent">Accent</option>
                            <option value="background">Background</option>
                          </select>
                        </label>

                        <div className="rounded-2xl border border-hairline bg-canvas p-3 dark:border-hairline dark:bg-surface-2/30">
                          <div className="text-xs font-semibold text-ink dark:text-ink">Behavior</div>
                          <div className="mt-1 text-[11px] text-ink-muted dark:text-ink-muted">Controls whether users can change this color.</div>

                          <label className="mt-3 flex items-center justify-between gap-3">
                            <span className="text-xs font-medium text-ink dark:text-ink">Enable user color edit</span>
                            <input
                              type="checkbox"
                              checked={selectedField.colorBehavior?.enabled ?? true}
                              onChange={(e) =>
                                updateColorField(selectedField.id, {
                                  colorBehavior: {
                                    enabled: e.target.checked,
                                    palette: selectedField.colorBehavior?.palette,
                                  },
                                })
                              }
                            />
                          </label>

                          <label className="mt-3 grid gap-1">
                            <span className="text-xs font-medium text-ink dark:text-ink">Restricted palette (optional)</span>
                            <textarea
                              value={(selectedField.colorBehavior?.palette ?? []).join("\n")}
                              onChange={(e) => {
                                const lines = e.target.value
                                  .split(/\r?\n/)
                                  .map((v) => v.trim())
                                  .filter(Boolean);
                                updateColorField(selectedField.id, {
                                  colorBehavior: {
                                    enabled: selectedField.colorBehavior?.enabled ?? true,
                                    palette: lines.length ? lines : undefined,
                                  },
                                });
                              }}
                              placeholder="#FF0000\n#00FF00\n#0000FF"
                              className="min-h-20 rounded-xl border border-hairline p-3 font-mono text-xs dark:border-hairline"
                            />
                          </label>
                        </div>
                      </>
                    )}
                  </div>
                ) : null}

                {config.fields.length ? (
                  <div className="rounded-2xl border border-hairline bg-canvas p-3 dark:border-hairline dark:bg-surface-2/30">
                    <div className="text-xs font-semibold text-ink dark:text-ink">Live Preview</div>
                    <div className="mt-1 text-[11px] text-ink-muted dark:text-ink-muted">
                      Preview how user-provided data will render. This does not change the layout.
                    </div>

                    <div className="mt-3 space-y-3">
                      {config.fields.map((f) => {
                        if (f.kind === "text") {
                          const value = previewTextByNodeId[f.nodeId] ?? "";
                          return (
                            <label key={f.id} className="grid gap-1">
                              <span className="text-xs font-medium text-ink dark:text-ink">{f.label}</span>
                              <input
                                value={value}
                                maxLength={f.maxChars}
                                onChange={(e) => onPreviewTextChange(f.nodeId, e.target.value)}
                                className="h-9 rounded-xl border border-hairline px-3 text-sm dark:border-hairline"
                                placeholder="Enter preview text"
                              />
                              {typeof f.maxChars === "number" ? (
                                <span className="text-[11px] text-ink-muted dark:text-ink-muted">
                                  {value.length}/{f.maxChars}
                                </span>
                              ) : null}
                            </label>
                          );
                        }

                        if (f.kind === "image") {
                          return (
                            <label key={f.id} className="grid gap-1">
                              <span className="text-xs font-medium text-ink dark:text-ink">{f.label}</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => onPreviewImageChange(f.nodeId, e.target.files?.[0] ?? null)}
                                className="block w-full text-xs"
                              />
                              <span className="text-[11px] text-ink-muted dark:text-ink-muted">Crop: {f.cropRule ?? "cover"}</span>
                            </label>
                          );
                        }

                        if (f.kind === "color") {
                          const enabled = f.colorBehavior?.enabled ?? true;
                          if (!enabled) return null;

                          const palette = f.colorBehavior?.palette?.filter(Boolean) ?? [];
                          const value = previewColorByNodeId[f.nodeId] ?? (palette[0] ?? "#000000");

                          return (
                            <label key={f.id} className="grid gap-1">
                              <span className="text-xs font-medium text-ink dark:text-ink">{f.label}</span>
                              {palette.length ? (
                                <select
                                  value={value}
                                  onChange={(e) => onPreviewColorChange?.(f.nodeId, e.target.value)}
                                  className="h-9 rounded-xl border border-hairline px-3 text-sm dark:border-hairline"
                                >
                                  {palette.map((c) => (
                                    <option key={c} value={c}>
                                      {c}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  type="color"
                                  value={value}
                                  onChange={(e) => onPreviewColorChange?.(f.nodeId, e.target.value)}
                                  className="h-9 w-16 rounded-xl border border-hairline bg-surface-1 dark:border-hairline dark:bg-surface-1"
                                />
                              )}
                            </label>
                          );
                        }

                        return null;
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="text-xs text-ink-muted dark:text-ink-muted">Select a node to configure.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );

                                  <div className="rounded-2xl border border-hairline bg-canvas p-3 dark:border-hairline dark:bg-surface-2/30">
                                    <div className="text-xs font-semibold text-ink dark:text-ink">Behavior</div>
                                    <div className="mt-1 text-[11px] text-ink-muted dark:text-ink-muted">Controls whether users can change this color.</div>

                                    <label className="mt-3 flex items-center justify-between gap-3">
                                      <span className="text-xs font-medium text-ink dark:text-ink">Enable user color edit</span>
                                      <input
                                        type="checkbox"
                                        checked={selectedField.colorBehavior?.enabled ?? true}
                                        onChange={(e) =>
                                          updateColorField(selectedField.id, {
                                            colorBehavior: {
                                              enabled: e.target.checked,
                                              palette: selectedField.colorBehavior?.palette,
                                            },
                                          })
                                        }
                                      />
                                    </label>

                                    <label className="mt-3 grid gap-1">
                                      <span className="text-xs font-medium text-ink dark:text-ink">Restricted palette (optional)</span>
                                      <textarea
                                        value={(selectedField.colorBehavior?.palette ?? []).join("\n")}
                                        onChange={(e) => {
                                          const lines = e.target.value
                                            .split(/\r?\n/)
                                            .map((v) => v.trim())
                                            .filter(Boolean);
                                          updateColorField(selectedField.id, {
                                            colorBehavior: {
                                              enabled: selectedField.colorBehavior?.enabled ?? true,
                                              palette: lines.length ? lines : undefined,
                                            },
                                          });
                                        }}
                                        placeholder="#FF0000\n#00FF00\n#0000FF"
                                        className="min-h-20 rounded-xl border border-hairline p-3 font-mono text-xs dark:border-hairline"
                                      />
                                    </label>
                                  </div>
                                </>
                              )}
                            </div>
                          ) : null}

                          {config.fields.length ? (
                            <div className="rounded-2xl border border-hairline bg-canvas p-3 dark:border-hairline dark:bg-surface-2/30">
                              <div className="text-xs font-semibold text-ink dark:text-ink">Live Preview</div>
                              <div className="mt-1 text-[11px] text-ink-muted dark:text-ink-muted">
                                Preview how user-provided data will render. This does not change the layout.
                              </div>

                              <div className="mt-3 space-y-3">
                                {config.fields.map((f) => {
                                  if (f.kind === "text") {
                                    const value = previewTextByNodeId[f.nodeId] ?? "";
                                    return (
                                      <label key={f.id} className="grid gap-1">
                                        <span className="text-xs font-medium text-ink dark:text-ink">{f.label}</span>
                                        <input
                                          value={value}
                                          maxLength={f.maxChars}
                                          onChange={(e) => onPreviewTextChange(f.nodeId, e.target.value)}
                                          className="h-9 rounded-xl border border-hairline px-3 text-sm dark:border-hairline"
                                          placeholder="Enter preview text"
                                        />
                                        {typeof f.maxChars === "number" ? (
                                          <span className="text-[11px] text-ink-muted dark:text-ink-muted">
                                            {value.length}/{f.maxChars}
                                          </span>
                                        ) : null}
                                      </label>
                                    );
                                  }

                                  if (f.kind === "image") {
                                    return (
                                      <label key={f.id} className="grid gap-1">
                                        <span className="text-xs font-medium text-ink dark:text-ink">{f.label}</span>
                                        <input
                                          type="file"
                                          accept="image/*"
                                          onChange={(e) => onPreviewImageChange(f.nodeId, e.target.files?.[0] ?? null)}
                                          className="block w-full text-xs"
                                        />
                                        <span className="text-[11px] text-ink-muted dark:text-ink-muted">Crop: {f.cropRule ?? "cover"}</span>
                                      </label>
                                    );
                                  }

                                  if (f.kind === "color") {
                                    const enabled = f.colorBehavior?.enabled ?? true;
                                    if (!enabled) return null;

                                    const palette = f.colorBehavior?.palette?.filter(Boolean) ?? [];
                                    const value = previewColorByNodeId[f.nodeId] ?? (palette[0] ?? "#000000");

                                    return (
                                      <label key={f.id} className="grid gap-1">
                                        <span className="text-xs font-medium text-ink dark:text-ink">{f.label}</span>
                                        {palette.length ? (
                                          <select
                                            value={value}
                                            onChange={(e) => onPreviewColorChange?.(f.nodeId, e.target.value)}
                                            className="h-9 rounded-xl border border-hairline px-3 text-sm dark:border-hairline"
                                          >
                                            {palette.map((c) => (
                                              <option key={c} value={c}>
                                                {c}
                                              </option>
                                            ))}
                                          </select>
                                        ) : (
                                          <input
                                            type="color"
                                            value={value}
                                            onChange={(e) => onPreviewColorChange?.(f.nodeId, e.target.value)}
                                            className="h-9 w-16 rounded-xl border border-hairline bg-surface-1 dark:border-hairline dark:bg-surface-1"
                                          />
                                        )}
                                      </label>
                                    );
                                  }

                                  return null;
                                })}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="text-xs text-ink-muted dark:text-ink-muted">Select a node to configure.</div>
                      )}
                    </div>
                  </div>
                )}
                        Mark as text
            );
          }

                    {canAddImage ? (
                      <button
                        type="button"
                        onClick={() => addImageField(selectedNodeId)}
                        className="inline-flex h-9 items-center justify-center rounded-xl bg-surface-1 px-3 text-xs font-medium text-white"
                      >
                        Mark as image
                      </button>
                    ) : null}

                    {canAddColor ? (
                      <button
                        type="button"
                        onClick={() => addColorField(selectedNodeId)}
                        className="inline-flex h-9 items-center justify-center rounded-xl bg-surface-1 px-3 text-xs font-medium text-white"
                      >
                        Mark as color
                      </button>
                    ) : null}
                  </>
                )}
              </div>

              {selectedField ? (
                <div className="space-y-3">
                  <label className="grid gap-1">
                    <span className="text-xs font-medium text-ink">Label</span>
                    <input
                      value={selectedField.label}
                      onChange={(e) => {
                        if (selectedField.kind === "text") {
                          updateTextField(selectedField.id, { label: e.target.value });
                        } else if (selectedField.kind === "image") {
                          updateImageField(selectedField.id, { label: e.target.value });
                        }
                      }}
                      className="h-9 rounded-xl border border-hairline px-3 text-sm"
                    />
                  </label>

                  {selectedField.kind === "text" ? (
                    <>
                      <label className="grid gap-1">
                        <span className="text-xs font-medium text-ink">Max characters</span>
                        <input
                          type="number"
                          min={1}
                          value={selectedField.maxChars ?? 64}
                          onChange={(e) =>
                            updateTextField(selectedField.id, {
                              maxChars: Number(e.target.value),
                            })
                          }
                          className="h-9 rounded-xl border border-hairline px-3 text-sm"
                        />
                      </label>

                      <div className="rounded-2xl border border-hairline bg-canvas p-3">
                        <div className="text-xs font-semibold text-ink">Behavior</div>
                        <div className="mt-1 text-[11px] text-ink-muted">Constraints applied at render/export time.</div>

                        <label className="mt-3 flex items-center justify-between gap-3">
                          <span className="text-xs font-medium text-ink">Auto-scale to fit</span>
                          <input
                            type="checkbox"
                            checked={selectedField.textBehavior?.autoScale ?? true}
                            onChange={(e) =>
                              updateTextField(selectedField.id, {
                                textBehavior: {
                                  autoScale: e.target.checked,
                                  minFontSize: selectedField.textBehavior?.minFontSize,
                                  maxFontSize: selectedField.textBehavior?.maxFontSize,
                                  overflow: selectedField.textBehavior?.overflow ?? "shrink",
                                },
                              })
                            }
                          />
                        </label>

                        <label className="mt-3 grid gap-1">
                          <span className="text-xs font-medium text-ink">Overflow strategy</span>
                          <select
                            value={selectedField.textBehavior?.overflow ?? "shrink"}
                            onChange={(e) =>
                              updateTextField(selectedField.id, {
                                textBehavior: {
                                  autoScale: selectedField.textBehavior?.autoScale ?? true,
                                  minFontSize: selectedField.textBehavior?.minFontSize,
                                  maxFontSize: selectedField.textBehavior?.maxFontSize,
                                  overflow: e.target.value === "wrap" ? "wrap" : e.target.value === "clip" ? "clip" : "shrink",
                                },
                              })
                            }
                            className="h-9 rounded-xl border border-hairline px-3 text-sm"
                          >
                            <option value="shrink">Shrink</option>
                            <option value="wrap">Wrap</option>
                            <option value="clip">Clip</option>
                          </select>
                        </label>

                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <label className="grid gap-1">
                            <span className="text-xs font-medium text-ink">Min font size</span>
                            <input
                              type="number"
                              min={1}
                              value={selectedField.textBehavior?.minFontSize ?? 8}
                              onChange={(e) =>
                                updateTextField(selectedField.id, {
                                  textBehavior: {
                                    autoScale: selectedField.textBehavior?.autoScale ?? true,
                                    minFontSize: Number(e.target.value),
                                    maxFontSize: selectedField.textBehavior?.maxFontSize,
                                    overflow: selectedField.textBehavior?.overflow ?? "shrink",
                                  },
                                })
                              }
                              className="h-9 rounded-xl border border-hairline px-3 text-sm"
                            />
                          </label>
                          <label className="grid gap-1">
                            <span className="text-xs font-medium text-ink">Max font size</span>
                            <input
                              type="number"
                              min={1}
                              value={selectedField.textBehavior?.maxFontSize ?? (selectedNode && selectedNode.kind === "text" ? selectedNode.text.fontSize ?? 12 : 12)}
                              onChange={(e) =>
                                updateTextField(selectedField.id, {
                                  textBehavior: {
                                    autoScale: selectedField.textBehavior?.autoScale ?? true,
                                    minFontSize: selectedField.textBehavior?.minFontSize,
                                    maxFontSize: Number(e.target.value),
                                    overflow: selectedField.textBehavior?.overflow ?? "shrink",
                                  },
                                })
                              }
                              className="h-9 rounded-xl border border-hairline px-3 text-sm"
                            />
                          </label>
                        </div>
                      </div>
                    </>
                  ) : (
                    selectedField.kind === "image" ? (
                      <>
                        <label className="grid gap-1">
                          <span className="text-xs font-medium text-ink">Role</span>
                          <select
                            value={selectedField.role}
                            onChange={(e) =>
                              updateImageField(selectedField.id, {
                                role: e.target.value === "logo" ? "logo" : "user_photo",
                              })
                            }
                            className="h-9 rounded-xl border border-hairline px-3 text-sm"
                          >
                            <option value="user_photo">User photo</option>
                            <option value="logo">Logo</option>
                          </select>
                        </label>

                        <div className="rounded-2xl border border-hairline bg-canvas p-3">
                          <div className="text-xs font-semibold text-ink">Behavior</div>
                          <div className="mt-1 text-[11px] text-ink-muted">Constraints applied at preview/export time.</div>

                          <label className="mt-3 grid gap-1">
                            <span className="text-xs font-medium text-ink">Fit</span>
                            <select
                              value={selectedField.imageBehavior?.fit ?? (selectedField.cropRule ?? "cover")}
                              onChange={(e) =>
                                updateImageField(selectedField.id, {
                                  imageBehavior: {
                                    fit: e.target.value === "contain" ? "contain" : "cover",
                                    lockAspectRatio: selectedField.imageBehavior?.lockAspectRatio ?? true,
                                    allowReplace: selectedField.imageBehavior?.allowReplace ?? true,
                                  },
                                  cropRule: e.target.value === "contain" ? "contain" : "cover",
                                })
                              }
                              className="h-9 rounded-xl border border-hairline px-3 text-sm"
                            >
                              <option value="cover">Cover</option>
                              <option value="contain">Contain</option>
                            </select>
                          </label>

                          <label className="mt-3 flex items-center justify-between gap-3">
                            <span className="text-xs font-medium text-ink">Lock aspect ratio</span>
                            <input
                              type="checkbox"
                              checked={selectedField.imageBehavior?.lockAspectRatio ?? true}
                              onChange={(e) =>
                                updateImageField(selectedField.id, {
                                  imageBehavior: {
                                    fit: selectedField.imageBehavior?.fit ?? (selectedField.cropRule ?? "cover"),
                                    lockAspectRatio: e.target.checked,
                                    allowReplace: selectedField.imageBehavior?.allowReplace ?? true,
                                  },
                                })
                              }
                            />
                          </label>

                          <label className="mt-3 flex items-center justify-between gap-3">
                            <span className="text-xs font-medium text-ink">Allow user replace</span>
                            <input
                              type="checkbox"
                              checked={selectedField.imageBehavior?.allowReplace ?? true}
                              onChange={(e) =>
                                updateImageField(selectedField.id, {
                                  imageBehavior: {
                                    fit: selectedField.imageBehavior?.fit ?? (selectedField.cropRule ?? "cover"),
                                    lockAspectRatio: selectedField.imageBehavior?.lockAspectRatio ?? true,
                                    allowReplace: e.target.checked,
                                  },
                                })
                              }
                            />
                          </label>
                        </div>
                      </>
                    ) : (
                      <>
                        <label className="grid gap-1">
                          <span className="text-xs font-medium text-ink">Role</span>
                          <select
                            value={selectedField.role}
                            onChange={(e) =>
                              updateColorField(selectedField.id, {
                                role: e.target.value === "background" ? "background" : "accent",
                              })
                            }
                            className="h-9 rounded-xl border border-hairline px-3 text-sm"
                          >
                            <option value="accent">Accent</option>
                            <option value="background">Background</option>
                          </select>
                        </label>

                        <div className="rounded-2xl border border-hairline bg-canvas p-3">
                          <div className="text-xs font-semibold text-ink">Behavior</div>
                          <div className="mt-1 text-[11px] text-ink-muted">Controls whether users can change this color.</div>

                          <label className="mt-3 flex items-center justify-between gap-3">
                            <span className="text-xs font-medium text-ink">Enable user color edit</span>
                            <input
                              type="checkbox"
                              checked={selectedField.colorBehavior?.enabled ?? true}
                              onChange={(e) =>
                                updateColorField(selectedField.id, {
                                  colorBehavior: {
                                    enabled: e.target.checked,
                                    palette: selectedField.colorBehavior?.palette,
                                  },
                                })
                              }
                            />
                          </label>

                          <label className="mt-3 grid gap-1">
                            <span className="text-xs font-medium text-ink">Restricted palette (optional)</span>
                            <textarea
                              value={(selectedField.colorBehavior?.palette ?? []).join("\n")}
                              onChange={(e) => {
                                const lines = e.target.value
                                  .split(/\r?\n/)
                                  .map((v) => v.trim())
                                  .filter(Boolean);
                                updateColorField(selectedField.id, {
                                  colorBehavior: {
                                    enabled: selectedField.colorBehavior?.enabled ?? true,
                                    palette: lines.length ? lines : undefined,
                                  },
                                });
                              }}
                              placeholder="#FF0000\n#00FF00\n#0000FF"
                              className="min-h-20 rounded-xl border border-hairline p-3 font-mono text-xs"
                            />
                          </label>
                        </div>
                      </>
                    )
                  )}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="text-xs text-ink-muted">
              Select a node to configure.
            </div>
          )}

          {config.fields.length ? (
            <div className="mt-4 flex flex-col overflow-hidden rounded-2xl border border-hairline bg-canvas p-3">
              <div className="text-xs font-semibold text-ink">Live Preview</div>
              <div className="mt-1 text-[11px] text-ink-muted">
                Preview how user-provided data will render. This does not change the layout.
              </div>

              <div className="mt-3 max-h-[34vh] space-y-3 overflow-y-auto pr-1">
                {config.fields.map((f) => {
                  if (f.kind === "text") {
                    const value = previewTextByNodeId[f.nodeId] ?? "";
                    return (
                      <label key={f.id} className="grid gap-1">
                        <span className="text-xs font-medium text-ink">{f.label}</span>
                        <input
                          value={value}
                          maxLength={f.maxChars}
                          onChange={(e) => onPreviewTextChange(f.nodeId, e.target.value)}
                          className="h-9 rounded-xl border border-hairline px-3 text-sm"
                          placeholder="Enter preview text"
                        />
                        {typeof f.maxChars === "number" ? (
                          <span className="text-[11px] text-ink-muted">
                            {value.length}/{f.maxChars}
                          </span>
                        ) : null}
                      </label>
                    );
                  }

                  if (f.kind === "image") {
                    return (
                      <label key={f.id} className="grid gap-1">
                        <span className="text-xs font-medium text-ink">{f.label}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => onPreviewImageChange(f.nodeId, e.target.files?.[0] ?? null)}
                          className="block w-full text-xs"
                        />
                        <span className="text-[11px] text-ink-muted">
                          Crop: {f.cropRule ?? "cover"}
                        </span>
                      </label>
                    );
                  }

                  if (f.kind === "color") {
                    const enabled = f.colorBehavior?.enabled ?? true;
                    if (!enabled) return null;

                    const palette = f.colorBehavior?.palette?.filter(Boolean) ?? [];
                    const value = previewColorByNodeId[f.nodeId] ?? (palette[0] ?? "#000000");

                    return (
                      <label key={f.id} className="grid gap-1">
                        <span className="text-xs font-medium text-ink">{f.label}</span>
                        {palette.length ? (
                          <select
                            value={value}
                            onChange={(e) => onPreviewColorChange?.(f.nodeId, e.target.value)}
                            className="h-9 rounded-xl border border-hairline px-3 text-sm"
                          >
                            {palette.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="color"
                            value={value}
                            onChange={(e) => onPreviewColorChange?.(f.nodeId, e.target.value)}
                            className="h-9 w-16 rounded-xl border border-hairline bg-surface-1"
                          />
                        )}
                      </label>
                    );
                  }

                  return null;
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

*/
