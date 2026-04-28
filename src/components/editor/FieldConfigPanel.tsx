"use client";

import { nanoid } from "nanoid";
import { useMemo, useState } from "react";

import type { NormalizedDesignV1, NormalizedNode } from "@/lib/figma";
import type { FieldConfig } from "@/lib/storage/types";
import { ImageUpload } from "@/components/forms/ImageUpload";

import { ImageSourceSection } from "@/components/editor/ImageSourceSection";

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

  const selectedNode = selectedNodeId ? design.nodesById[selectedNodeId] : undefined;
  const selectedField = selectedNodeId ? config.fields.find((f) => f.nodeId === selectedNodeId) : undefined;

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
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
        <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">Configuration</div>
        <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
          Select nodes and mark them as editable fields.
        </div>
      </div>

      {selectedNodeId === null ? (
        <>
          <div className="border-b border-zinc-200 p-3 dark:border-zinc-800">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search nodes…"
              className="h-9 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-100"
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {candidates.map((c) => {
                const configured = configuredNodeIds.has(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onSelectNodeId(c.id)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-zinc-950 dark:text-zinc-100">{c.name}</div>
                      <div className="truncate text-xs text-zinc-600 dark:text-zinc-300">
                        {c.kinds.join("/")} • {c.id}
                      </div>
                    </div>
                    {configured ? (
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                        configured
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => onSelectNodeId(null)}
              className="text-xs font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-200 dark:hover:text-zinc-50"
            >
              ← Nodes
            </button>
            <div className="min-w-0 truncate text-xs text-zinc-600 dark:text-zinc-300">{selectedNode?.name ?? selectedNodeId}</div>
            <button
              type="button"
              onClick={() => onSelectNodeId(null)}
              className="text-xs font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-200 dark:hover:text-zinc-50"
            >
              Clear
            </button>
          </div>

          <div className="mt-3 space-y-4">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/30">
              <div className="text-xs font-semibold text-zinc-950 dark:text-zinc-100">Node</div>
              <div className="mt-1 break-all text-xs text-zinc-700 dark:text-zinc-200">{selectedNodeId}</div>
            </div>

            <div className="flex flex-wrap gap-2">
              {selectedField ? (
                <button
                  type="button"
                  onClick={() => removeFieldForNode(selectedNodeId)}
                  className="inline-flex h-9 items-center justify-center rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-medium text-red-700 hover:bg-red-100 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-900/30"
                >
                  Remove field
                </button>
              ) : (
                <>
                  {canAddText ? (
                    <button
                      type="button"
                      onClick={() => addTextField(selectedNodeId)}
                      className="inline-flex h-9 items-center justify-center rounded-xl bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                    >
                      Mark as text
                    </button>
                  ) : null}

                  {canAddImage ? (
                    <button
                      type="button"
                      onClick={() => addImageField(selectedNodeId)}
                      className="inline-flex h-9 items-center justify-center rounded-xl bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                    >
                      Mark as image
                    </button>
                  ) : null}

                  {canAddColor ? (
                    <button
                      type="button"
                      onClick={() => addColorField(selectedNodeId)}
                      className="inline-flex h-9 items-center justify-center rounded-xl bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
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
                  <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">Label</span>
                  <input
                    value={selectedField.label}
                    onChange={(e) => {
                      if (selectedField.kind === "text") updateTextField(selectedField.id, { label: e.target.value });
                      if (selectedField.kind === "image") updateImageField(selectedField.id, { label: e.target.value });
                      if (selectedField.kind === "color") updateColorField(selectedField.id, { label: e.target.value });
                    }}
                    className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-100"
                  />
                </label>

                {selectedField.kind === "text" ? (
                  <>
                    <label className="grid gap-1">
                      <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">Max characters</span>
                      <input
                        type="number"
                        min={1}
                        value={selectedField.maxChars ?? 64}
                        onChange={(e) => updateTextField(selectedField.id, { maxChars: Number(e.target.value) })}
                        className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-100"
                      />
                    </label>

                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/30">
                      <div className="text-xs font-semibold text-zinc-950 dark:text-zinc-100">Behavior</div>

                      <label className="mt-3 flex items-center justify-between gap-3">
                        <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">Auto-scale to fit</span>
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
                        <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">Text case</span>
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
                          className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-100"
                        >
                          <option value="as_design">As designed</option>
                          <option value="upper">UPPERCASE</option>
                          <option value="lower">lowercase</option>
                          <option value="title">Title Case</option>
                        </select>
                      </label>

                      <label className="mt-3 grid gap-1">
                        <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">Overflow</span>
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
                          className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-100"
                        >
                          <option value="shrink">Shrink</option>
                          <option value="wrap">Wrap</option>
                          <option value="clip">Clip</option>
                        </select>
                      </label>

                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <label className="grid min-w-0 gap-1">
                          <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">Min font</span>
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
                            className="h-9 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-100"
                          />
                        </label>

                        <label className="grid min-w-0 gap-1">
                          <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">Max font</span>
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
                            className="h-9 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-100"
                          />
                        </label>
                      </div>
                    </div>
                  </>
                ) : null}

                {selectedField.kind === "image" ? (
                  <>
                    <ImageSourceSection
                      templateId={templateId}
                      field={selectedField}
                      onChange={(p) => updateImageField(selectedField.id, p)}
                      onAssetChange={onDesignAssetsChanged}
                    />
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/30">
                    <div className="text-xs font-semibold text-zinc-950 dark:text-zinc-100">Behavior</div>

                    <div className="mt-2 text-[11px] text-zinc-600 dark:text-zinc-300">
                      Overflow is always clipped to the original placeholder shape.
                    </div>

                    <label className="mt-3 grid gap-1">
                      <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">Fit</span>
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
                        className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-100"
                      >
                        <option value="cover">Cover</option>
                        <option value="contain">Contain</option>
                      </select>
                    </label>

                    <label className="mt-3 flex items-center justify-between gap-3">
                      <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">Lock aspect ratio</span>
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
                      <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">Allow replace</span>
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
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/30">
                    <div className="text-xs font-semibold text-zinc-950 dark:text-zinc-100">Behavior</div>

                    <label className="mt-3 flex items-center justify-between gap-3">
                      <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">Enabled</span>
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
                      <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">Palette (comma-separated hex)</span>
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
                        className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-100"
                      />
                    </label>
                  </div>
                ) : null}
              </div>
            ) : null}

            {config.fields.length ? (
              <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/30">
                <div className="text-xs font-semibold text-zinc-950 dark:text-zinc-100">Live Preview</div>
                <div className="mt-3 space-y-3">
                  {config.fields.map((f) => {
                    if (f.kind === "text") {
                      const value = previewTextByNodeId[f.nodeId] ?? "";
                      return (
                        <label key={f.id} className="grid gap-1">
                          <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">{f.label}</span>
                          <input
                            value={value}
                            maxLength={f.maxChars}
                            onChange={(e) => onPreviewTextChange(f.nodeId, e.target.value)}
                            className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-100"
                          />
                        </label>
                      );
                    }

                    if (f.kind === "image") {
                      const allowReplace = f.imageBehavior?.allowReplace ?? true;
                      return (
                        <ImageUpload
                          key={f.id}
                          label={f.label}
                          description={
                            !allowReplace
                              ? "Locked by template"
                              : `Fit: ${f.imageBehavior?.fit ?? (f.cropRule === "contain" ? "contain" : "cover")}`
                          }
                          disabled={!allowReplace}
                          onPick={(file) => onPreviewImageChange(f.nodeId, file)}
                          onClear={allowReplace ? () => onPreviewImageChange(f.nodeId, null) : undefined}
                        />
                      );
                    }

                    if (f.kind === "color") {
                      if ((f.colorBehavior?.enabled ?? true) === false) return null;
                      const palette = f.colorBehavior?.palette?.filter(Boolean) ?? [];
                      const value = previewColorByNodeId[f.nodeId] ?? (palette[0] ?? "#000000");
                      return (
                        <label key={f.id} className="grid gap-1">
                          <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">{f.label}</span>
                          {palette.length ? (
                            <select
                              value={value}
                              onChange={(e) => onPreviewColorChange(f.nodeId, e.target.value)}
                              className="h-9 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-100"
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
                              onChange={(e) => onPreviewColorChange(f.nodeId, e.target.value)}
                              className="h-9 w-16 rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
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
      )}
    </div>
  );
}

/* Legacy cleanup pending
                          <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">Role</span>
                          <select
                            value={selectedField.role}
                            onChange={(e) =>
                              updateImageField(selectedField.id, {
                                role: e.target.value === "logo" ? "logo" : "user_photo",
                              })
                            }
                            className="h-9 rounded-xl border border-zinc-200 px-3 text-sm dark:border-zinc-800"
                          >
                            <option value="user_photo">User photo</option>
                            <option value="logo">Logo</option>
                          </select>
                        </label>

                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/30">
                          <div className="text-xs font-semibold text-zinc-950 dark:text-zinc-100">Behavior</div>
                          <div className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-300">Constraints applied at preview/export time.</div>

                          <label className="mt-3 grid gap-1">
                            <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">Fit</span>
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
                              className="h-9 rounded-xl border border-zinc-200 px-3 text-sm dark:border-zinc-800"
                            >
                              <option value="cover">Cover</option>
                              <option value="contain">Contain</option>
                            </select>
                          </label>

                          <label className="mt-3 flex items-center justify-between gap-3">
                            <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">Lock aspect ratio</span>
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
                            <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">Allow user replace</span>
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
                          <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">Role</span>
                          <select
                            value={selectedField.role}
                            onChange={(e) =>
                              updateColorField(selectedField.id, {
                                role: e.target.value === "background" ? "background" : "accent",
                              })
                            }
                            className="h-9 rounded-xl border border-zinc-200 px-3 text-sm dark:border-zinc-800"
                          >
                            <option value="accent">Accent</option>
                            <option value="background">Background</option>
                          </select>
                        </label>

                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/30">
                          <div className="text-xs font-semibold text-zinc-950 dark:text-zinc-100">Behavior</div>
                          <div className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-300">Controls whether users can change this color.</div>

                          <label className="mt-3 flex items-center justify-between gap-3">
                            <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">Enable user color edit</span>
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
                            <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">Restricted palette (optional)</span>
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
                              className="min-h-20 rounded-xl border border-zinc-200 p-3 font-mono text-xs dark:border-zinc-800"
                            />
                          </label>
                        </div>
                      </>
                    ) : null}
                  </div>
                ) : null}

                {config.fields.length ? (
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/30">
                    <div className="text-xs font-semibold text-zinc-950 dark:text-zinc-100">Live Preview</div>
                    <div className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-300">Preview how user-provided data will render.</div>

                    <div className="mt-3 space-y-3">
                      {config.fields.map((f) => {
                        if (f.kind === "text") {
                          const value = previewTextByNodeId[f.nodeId] ?? "";
                          return (
                            <label key={f.id} className="grid gap-1">
                              <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">{f.label}</span>
                              <input
                                value={value}
                                maxLength={f.maxChars}
                                onChange={(e) => onPreviewTextChange(f.nodeId, e.target.value)}
                                className="h-9 rounded-xl border border-zinc-200 px-3 text-sm dark:border-zinc-800"
                                placeholder="Enter preview text"
                              />
                              {typeof f.maxChars === "number" ? (
                                <span className="text-[11px] text-zinc-600 dark:text-zinc-300">
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
                              <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">{f.label}</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => onPreviewImageChange(f.nodeId, e.target.files?.[0] ?? null)}
                                disabled={!allowReplace}
                                className="block w-full text-xs"
                              />
                              <span className="text-[11px] text-zinc-600 dark:text-zinc-300">
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
                              <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">{f.label}</span>
                              {palette.length ? (
                                <select
                                  value={value}
                                  onChange={(e) => onPreviewColorChange?.(f.nodeId, e.target.value)}
                                  className="h-9 rounded-xl border border-zinc-200 px-3 text-sm dark:border-zinc-800"
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
                                  className="h-9 w-16 rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
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
              <div className="text-xs text-zinc-600 dark:text-zinc-300">Select a node to configure.</div>
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
                          <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">Max characters</span>
                          <input
                            type="number"
                            min={1}
                            value={selectedField.maxChars ?? 64}
                            onChange={(e) => updateTextField(selectedField.id, { maxChars: Number(e.target.value) })}
                            className="h-9 rounded-xl border border-zinc-200 px-3 text-sm dark:border-zinc-800"
                          />
                        </label>

                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/30">
                          <div className="text-xs font-semibold text-zinc-950 dark:text-zinc-100">Behavior</div>
                          <div className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-300">Constraints applied at render/export time.</div>

                          <label className="mt-3 flex items-center justify-between gap-3">
                            <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">Auto-scale to fit</span>
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
                            <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">Overflow strategy</span>
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
                              className="h-9 rounded-xl border border-zinc-200 px-3 text-sm dark:border-zinc-800"
                            >
                              <option value="shrink">Shrink</option>
                              <option value="wrap">Wrap</option>
                              <option value="clip">Clip</option>
                            </select>
                          </label>

                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <label className="grid gap-1">
                              <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">Min font size</span>
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
                                className="h-9 rounded-xl border border-zinc-200 px-3 text-sm dark:border-zinc-800"
                              />
                            </label>
                            <label className="grid gap-1">
                              <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">Max font size</span>
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
                                className="h-9 rounded-xl border border-zinc-200 px-3 text-sm dark:border-zinc-800"
                              />
                            </label>
                          </div>
                        </div>
                      </>
                    ) : selectedField.kind === "image" ? (
                      <>
                        <ImageSourceSection
                          templateId={templateId}
                          field={selectedField}
                          onChange={(p) => updateImageField(selectedField.id, p)}
                          onAssetChange={onDesignAssetsChanged}
                        />
                        <label className="grid gap-1">
                          <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">Role</span>
                          <select
                            value={selectedField.role}
                            onChange={(e) => updateImageField(selectedField.id, { role: e.target.value === "logo" ? "logo" : "user_photo" })}
                            className="h-9 rounded-xl border border-zinc-200 px-3 text-sm dark:border-zinc-800"
                          >
                            <option value="user_photo">User photo</option>
                            <option value="logo">Logo</option>
                          </select>
                        </label>

                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/30">
                          <div className="text-xs font-semibold text-zinc-950 dark:text-zinc-100">Behavior</div>
                          <div className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-300">Constraints applied at preview/export time.</div>

                          <label className="mt-3 grid gap-1">
                            <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">Fit</span>
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
                              className="h-9 rounded-xl border border-zinc-200 px-3 text-sm dark:border-zinc-800"
                            >
                              <option value="cover">Cover</option>
                              <option value="contain">Contain</option>
                            </select>
                          </label>

                          <label className="mt-3 flex items-center justify-between gap-3">
                            <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">Lock aspect ratio</span>
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
                            <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">Allow user replace</span>
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
                          <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">Role</span>
                          <select
                            value={selectedField.role}
                            onChange={(e) => updateColorField(selectedField.id, { role: e.target.value === "background" ? "background" : "accent" })}
                            className="h-9 rounded-xl border border-zinc-200 px-3 text-sm dark:border-zinc-800"
                          >
                            <option value="accent">Accent</option>
                            <option value="background">Background</option>
                          </select>
                        </label>

                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/30">
                          <div className="text-xs font-semibold text-zinc-950 dark:text-zinc-100">Behavior</div>
                          <div className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-300">Controls whether users can change this color.</div>

                          <label className="mt-3 flex items-center justify-between gap-3">
                            <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">Enable user color edit</span>
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
                            <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">Restricted palette (optional)</span>
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
                              className="min-h-20 rounded-xl border border-zinc-200 p-3 font-mono text-xs dark:border-zinc-800"
                            />
                          </label>
                        </div>
                      </>
                    )}
                  </div>
                ) : null}

                {config.fields.length ? (
                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/30">
                    <div className="text-xs font-semibold text-zinc-950 dark:text-zinc-100">Live Preview</div>
                    <div className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-300">
                      Preview how user-provided data will render. This does not change the layout.
                    </div>

                    <div className="mt-3 space-y-3">
                      {config.fields.map((f) => {
                        if (f.kind === "text") {
                          const value = previewTextByNodeId[f.nodeId] ?? "";
                          return (
                            <label key={f.id} className="grid gap-1">
                              <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">{f.label}</span>
                              <input
                                value={value}
                                maxLength={f.maxChars}
                                onChange={(e) => onPreviewTextChange(f.nodeId, e.target.value)}
                                className="h-9 rounded-xl border border-zinc-200 px-3 text-sm dark:border-zinc-800"
                                placeholder="Enter preview text"
                              />
                              {typeof f.maxChars === "number" ? (
                                <span className="text-[11px] text-zinc-600 dark:text-zinc-300">
                                  {value.length}/{f.maxChars}
                                </span>
                              ) : null}
                            </label>
                          );
                        }

                        if (f.kind === "image") {
                          return (
                            <label key={f.id} className="grid gap-1">
                              <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">{f.label}</span>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => onPreviewImageChange(f.nodeId, e.target.files?.[0] ?? null)}
                                className="block w-full text-xs"
                              />
                              <span className="text-[11px] text-zinc-600 dark:text-zinc-300">Crop: {f.cropRule ?? "cover"}</span>
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
                              <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">{f.label}</span>
                              {palette.length ? (
                                <select
                                  value={value}
                                  onChange={(e) => onPreviewColorChange?.(f.nodeId, e.target.value)}
                                  className="h-9 rounded-xl border border-zinc-200 px-3 text-sm dark:border-zinc-800"
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
                                  className="h-9 w-16 rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
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
              <div className="text-xs text-zinc-600 dark:text-zinc-300">Select a node to configure.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );

                                  <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/30">
                                    <div className="text-xs font-semibold text-zinc-950 dark:text-zinc-100">Behavior</div>
                                    <div className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-300">Controls whether users can change this color.</div>

                                    <label className="mt-3 flex items-center justify-between gap-3">
                                      <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">Enable user color edit</span>
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
                                      <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">Restricted palette (optional)</span>
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
                                        className="min-h-20 rounded-xl border border-zinc-200 p-3 font-mono text-xs dark:border-zinc-800"
                                      />
                                    </label>
                                  </div>
                                </>
                              )}
                            </div>
                          ) : null}

                          {config.fields.length ? (
                            <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800/30">
                              <div className="text-xs font-semibold text-zinc-950 dark:text-zinc-100">Live Preview</div>
                              <div className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-300">
                                Preview how user-provided data will render. This does not change the layout.
                              </div>

                              <div className="mt-3 space-y-3">
                                {config.fields.map((f) => {
                                  if (f.kind === "text") {
                                    const value = previewTextByNodeId[f.nodeId] ?? "";
                                    return (
                                      <label key={f.id} className="grid gap-1">
                                        <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">{f.label}</span>
                                        <input
                                          value={value}
                                          maxLength={f.maxChars}
                                          onChange={(e) => onPreviewTextChange(f.nodeId, e.target.value)}
                                          className="h-9 rounded-xl border border-zinc-200 px-3 text-sm dark:border-zinc-800"
                                          placeholder="Enter preview text"
                                        />
                                        {typeof f.maxChars === "number" ? (
                                          <span className="text-[11px] text-zinc-600 dark:text-zinc-300">
                                            {value.length}/{f.maxChars}
                                          </span>
                                        ) : null}
                                      </label>
                                    );
                                  }

                                  if (f.kind === "image") {
                                    return (
                                      <label key={f.id} className="grid gap-1">
                                        <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">{f.label}</span>
                                        <input
                                          type="file"
                                          accept="image/*"
                                          onChange={(e) => onPreviewImageChange(f.nodeId, e.target.files?.[0] ?? null)}
                                          className="block w-full text-xs"
                                        />
                                        <span className="text-[11px] text-zinc-600 dark:text-zinc-300">Crop: {f.cropRule ?? "cover"}</span>
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
                                        <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">{f.label}</span>
                                        {palette.length ? (
                                          <select
                                            value={value}
                                            onChange={(e) => onPreviewColorChange?.(f.nodeId, e.target.value)}
                                            className="h-9 rounded-xl border border-zinc-200 px-3 text-sm dark:border-zinc-800"
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
                                            className="h-9 w-16 rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
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
                        <div className="text-xs text-zinc-600 dark:text-zinc-300">Select a node to configure.</div>
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
                        className="inline-flex h-9 items-center justify-center rounded-xl bg-zinc-900 px-3 text-xs font-medium text-white"
                      >
                        Mark as image
                      </button>
                    ) : null}

                    {canAddColor ? (
                      <button
                        type="button"
                        onClick={() => addColorField(selectedNodeId)}
                        className="inline-flex h-9 items-center justify-center rounded-xl bg-zinc-900 px-3 text-xs font-medium text-white"
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
                    <span className="text-xs font-medium text-zinc-900">Label</span>
                    <input
                      value={selectedField.label}
                      onChange={(e) => {
                        if (selectedField.kind === "text") {
                          updateTextField(selectedField.id, { label: e.target.value });
                        } else if (selectedField.kind === "image") {
                          updateImageField(selectedField.id, { label: e.target.value });
                        }
                      }}
                      className="h-9 rounded-xl border border-zinc-200 px-3 text-sm"
                    />
                  </label>

                  {selectedField.kind === "text" ? (
                    <>
                      <label className="grid gap-1">
                        <span className="text-xs font-medium text-zinc-900">Max characters</span>
                        <input
                          type="number"
                          min={1}
                          value={selectedField.maxChars ?? 64}
                          onChange={(e) =>
                            updateTextField(selectedField.id, {
                              maxChars: Number(e.target.value),
                            })
                          }
                          className="h-9 rounded-xl border border-zinc-200 px-3 text-sm"
                        />
                      </label>

                      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                        <div className="text-xs font-semibold text-zinc-950">Behavior</div>
                        <div className="mt-1 text-[11px] text-zinc-600">Constraints applied at render/export time.</div>

                        <label className="mt-3 flex items-center justify-between gap-3">
                          <span className="text-xs font-medium text-zinc-900">Auto-scale to fit</span>
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
                          <span className="text-xs font-medium text-zinc-900">Overflow strategy</span>
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
                            className="h-9 rounded-xl border border-zinc-200 px-3 text-sm"
                          >
                            <option value="shrink">Shrink</option>
                            <option value="wrap">Wrap</option>
                            <option value="clip">Clip</option>
                          </select>
                        </label>

                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <label className="grid gap-1">
                            <span className="text-xs font-medium text-zinc-900">Min font size</span>
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
                              className="h-9 rounded-xl border border-zinc-200 px-3 text-sm"
                            />
                          </label>
                          <label className="grid gap-1">
                            <span className="text-xs font-medium text-zinc-900">Max font size</span>
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
                              className="h-9 rounded-xl border border-zinc-200 px-3 text-sm"
                            />
                          </label>
                        </div>
                      </div>
                    </>
                  ) : (
                    selectedField.kind === "image" ? (
                      <>
                        <ImageSourceSection
                          templateId={templateId}
                          field={selectedField}
                          onChange={(p) => updateImageField(selectedField.id, p)}
                          onAssetChange={onDesignAssetsChanged}
                        />
                        <label className="grid gap-1">
                          <span className="text-xs font-medium text-zinc-900">Role</span>
                          <select
                            value={selectedField.role}
                            onChange={(e) =>
                              updateImageField(selectedField.id, {
                                role: e.target.value === "logo" ? "logo" : "user_photo",
                              })
                            }
                            className="h-9 rounded-xl border border-zinc-200 px-3 text-sm"
                          >
                            <option value="user_photo">User photo</option>
                            <option value="logo">Logo</option>
                          </select>
                        </label>

                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                          <div className="text-xs font-semibold text-zinc-950">Behavior</div>
                          <div className="mt-1 text-[11px] text-zinc-600">Constraints applied at preview/export time.</div>

                          <label className="mt-3 grid gap-1">
                            <span className="text-xs font-medium text-zinc-900">Fit</span>
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
                              className="h-9 rounded-xl border border-zinc-200 px-3 text-sm"
                            >
                              <option value="cover">Cover</option>
                              <option value="contain">Contain</option>
                            </select>
                          </label>

                          <label className="mt-3 flex items-center justify-between gap-3">
                            <span className="text-xs font-medium text-zinc-900">Lock aspect ratio</span>
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
                            <span className="text-xs font-medium text-zinc-900">Allow user replace</span>
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
                          <span className="text-xs font-medium text-zinc-900">Role</span>
                          <select
                            value={selectedField.role}
                            onChange={(e) =>
                              updateColorField(selectedField.id, {
                                role: e.target.value === "background" ? "background" : "accent",
                              })
                            }
                            className="h-9 rounded-xl border border-zinc-200 px-3 text-sm"
                          >
                            <option value="accent">Accent</option>
                            <option value="background">Background</option>
                          </select>
                        </label>

                        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
                          <div className="text-xs font-semibold text-zinc-950">Behavior</div>
                          <div className="mt-1 text-[11px] text-zinc-600">Controls whether users can change this color.</div>

                          <label className="mt-3 flex items-center justify-between gap-3">
                            <span className="text-xs font-medium text-zinc-900">Enable user color edit</span>
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
                            <span className="text-xs font-medium text-zinc-900">Restricted palette (optional)</span>
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
                              className="min-h-20 rounded-xl border border-zinc-200 p-3 font-mono text-xs"
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
            <div className="text-xs text-zinc-600">
              Select a node to configure.
            </div>
          )}

          {config.fields.length ? (
            <div className="mt-4 flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 p-3">
              <div className="text-xs font-semibold text-zinc-950">Live Preview</div>
              <div className="mt-1 text-[11px] text-zinc-600">
                Preview how user-provided data will render. This does not change the layout.
              </div>

              <div className="mt-3 max-h-[34vh] space-y-3 overflow-y-auto pr-1">
                {config.fields.map((f) => {
                  if (f.kind === "text") {
                    const value = previewTextByNodeId[f.nodeId] ?? "";
                    return (
                      <label key={f.id} className="grid gap-1">
                        <span className="text-xs font-medium text-zinc-900">{f.label}</span>
                        <input
                          value={value}
                          maxLength={f.maxChars}
                          onChange={(e) => onPreviewTextChange(f.nodeId, e.target.value)}
                          className="h-9 rounded-xl border border-zinc-200 px-3 text-sm"
                          placeholder="Enter preview text"
                        />
                        {typeof f.maxChars === "number" ? (
                          <span className="text-[11px] text-zinc-600">
                            {value.length}/{f.maxChars}
                          </span>
                        ) : null}
                      </label>
                    );
                  }

                  if (f.kind === "image") {
                    return (
                      <label key={f.id} className="grid gap-1">
                        <span className="text-xs font-medium text-zinc-900">{f.label}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => onPreviewImageChange(f.nodeId, e.target.files?.[0] ?? null)}
                          className="block w-full text-xs"
                        />
                        <span className="text-[11px] text-zinc-600">
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
                        <span className="text-xs font-medium text-zinc-900">{f.label}</span>
                        {palette.length ? (
                          <select
                            value={value}
                            onChange={(e) => onPreviewColorChange?.(f.nodeId, e.target.value)}
                            className="h-9 rounded-xl border border-zinc-200 px-3 text-sm"
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
                            className="h-9 w-16 rounded-xl border border-zinc-200 bg-white"
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
