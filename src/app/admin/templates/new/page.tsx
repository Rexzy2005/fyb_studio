"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { normalizeFigmaExport } from "@/lib/figma";
import { createLocalTemplateRepository } from "@/lib/storage/templateRepo";
import { ProgressModal } from "@/components/ui/ProgressModal";
import { useSimulatedProgress } from "@/components/ui/useSimulatedProgress";
import { NormalizationWarningsModal } from "@/components/ui/NormalizationWarningsModal";

export default function CreateTemplatePage() {
  const repo = useMemo(() => createLocalTemplateRepository(), []);
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [name, setName] = useState("Untitled Template");
  const [jsonText, setJsonText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const progress = useSimulatedProgress(busy);
  const [warningsModalOpen, setWarningsModalOpen] = useState(false);
  const [summary, setSummary] = useState<{
    nodeCount: number;
    textCount: number;
    imageCount: number;
    width: number;
    height: number;
    warnings: Array<{ code: string; message: string; nodeId?: string }>;
  } | null>(null);

  async function loadJsonFromFile(file: File) {
    const text = await file.text();
    setJsonText(text);
  }

  async function onChooseFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await loadJsonFromFile(file);
  }

  async function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".json")) {
      setError("Please drop a .json file.");
      return;
    }
    setError(null);
    await loadJsonFromFile(file);
  }

  async function onCreate() {
    setError(null);
    setBusy(true);

    try {
      const parsed = JSON.parse(jsonText);
      const normalized = normalizeFigmaExport(parsed);
      setSummary({
        nodeCount: normalized.stats.nodeCount,
        textCount: normalized.stats.textCount,
        imageCount: normalized.stats.imageCount,
        width: normalized.canvas.width,
        height: normalized.canvas.height,
        warnings: normalized.warnings.map((w) => ({ code: w.code, message: w.message, nodeId: w.nodeId })),
      });

      const record = await repo.upsertDraft({
        name,
        designJson: parsed,
        normalized,
      });
      router.push(`/admin/templates/${record.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid JSON");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-ink dark:text-ink">
          Create Template
        </h1>
        <p className="mt-1 text-sm text-ink-muted dark:text-ink-muted">
          Step 1: Import design JSON (paste, upload, or drag & drop).
        </p>
      </header>

      {error ? (
        <div className="rounded-xl border border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.08)] p-4 text-sm text-danger dark:border-[rgba(239,68,68,0.28)] dark:bg-red-950/40 dark:text-danger">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4">
        <label className="grid gap-1">
          <span className="text-sm font-medium text-ink dark:text-ink">Template name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Birthday flyer"
            className="h-10 rounded-xl border border-hairline bg-surface-1 px-3 text-sm text-ink placeholder:text-ink-faint dark:border-hairline dark:bg-surface-1 dark:text-ink"
          />
        </label>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          className="rounded-2xl border border-dashed border-hairline bg-surface-1 p-4 dark:border-hairline dark:bg-surface-1"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium text-ink dark:text-ink">Import JSON</div>
              <div className="text-xs text-ink-muted dark:text-ink-muted">
                Drag a .json file here or choose a file.
              </div>
            </div>
            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                onChange={onChooseFile}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex h-9 items-center justify-center rounded-xl border border-hairline bg-surface-1 px-3 text-xs font-medium text-ink hover:bg-canvas dark:border-hairline dark:bg-surface-1 dark:text-ink dark:hover:bg-surface-2"
              >
                Choose file
              </button>
            </div>
          </div>
        </div>

        <label className="grid gap-1">
          <span className="text-sm font-medium text-ink dark:text-ink">Design JSON</span>
          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            className="min-h-60 rounded-xl border border-hairline bg-surface-1 p-3 font-mono text-xs text-ink placeholder:text-ink-faint dark:border-hairline dark:bg-surface-1 dark:text-ink"
            placeholder="Paste Figma-exported JSON here"
          />
        </label>

        {summary ? (
          <div className="rounded-2xl border border-hairline bg-canvas p-4 text-sm text-ink-muted dark:border-hairline dark:bg-surface-1 dark:text-ink">
            <div className="font-medium text-ink dark:text-ink">Normalization summary</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <div>Canvas: {Math.round(summary.width)}×{Math.round(summary.height)}</div>
              <div>Nodes: {summary.nodeCount}</div>
              <div>Text: {summary.textCount} • Images: {summary.imageCount}</div>
            </div>
            {summary.warnings.length ? (
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-xs text-ink-muted dark:text-ink-muted">
                  {summary.warnings.length} warning{summary.warnings.length === 1 ? "" : "s"} found.
                </div>
                <button
                  type="button"
                  onClick={() => setWarningsModalOpen(true)}
                  className="inline-flex h-9 items-center justify-center rounded-xl border border-[rgba(245,158,11,0.28)] bg-[rgba(245,158,11,0.08)] px-3 text-xs font-medium text-warning hover:bg-[rgba(245,158,11,0.16)] dark:border-[rgba(245,158,11,0.28)] dark:bg-[rgba(245,158,11,0.12)] dark:text-warning dark:hover:bg-[rgba(245,158,11,0.16)]"
                >
                  View warnings
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        <button
          type="button"
          disabled={busy || jsonText.trim().length === 0}
          onClick={onCreate}
          className="inline-flex h-10 items-center justify-center rounded-xl bg-surface-1 px-4 text-sm font-medium text-white hover:bg-surface-2 disabled:opacity-50 dark:bg-surface-2 dark:text-ink dark:hover:bg-surface-1"
        >
          {busy ? "Normalizing…" : "Normalize & Create Draft"}
        </button>
      </div>
      </div>

      <ProgressModal
        open={busy}
        title="Normalizing design"
        subtitle={
          progress < 0.25
            ? "Parsing JSON and reading layers"
            : progress < 0.6
              ? "Extracting text, images, and geometry"
              : "Finalizing draft and preparing the editor"
        }
        percent={Math.round(progress * 100)}
        hint="This can take a few seconds for large designs."
      />

      <NormalizationWarningsModal
        open={warningsModalOpen}
        onClose={() => setWarningsModalOpen(false)}
        warnings={summary?.warnings ?? []}
      />
    </div>
  );
}

