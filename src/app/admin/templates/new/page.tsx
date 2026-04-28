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
        <h1 className="text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-100">
          Create Template
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
          Step 1: Import design JSON (paste, upload, or drag & drop).
        </p>
      </header>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4">
        <label className="grid gap-1">
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Template name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Birthday flyer"
            className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-100"
          />
        </label>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          className="rounded-2xl border border-dashed border-zinc-300 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-medium text-zinc-950 dark:text-zinc-100">Import JSON</div>
              <div className="text-xs text-zinc-600 dark:text-zinc-300">
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
                className="inline-flex h-9 items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                Choose file
              </button>
            </div>
          </div>
        </div>

        <label className="grid gap-1">
          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Design JSON</span>
          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            className="min-h-60 rounded-xl border border-zinc-200 bg-white p-3 font-mono text-xs text-zinc-900 placeholder:text-zinc-400 dark:border-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-100"
            placeholder="Paste Figma-exported JSON here"
          />
        </label>

        {summary ? (
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
            <div className="font-medium text-zinc-950 dark:text-zinc-100">Normalization summary</div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <div>Canvas: {Math.round(summary.width)}×{Math.round(summary.height)}</div>
              <div>Nodes: {summary.nodeCount}</div>
              <div>Text: {summary.textCount} • Images: {summary.imageCount}</div>
            </div>
            {summary.warnings.length ? (
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-xs text-zinc-600 dark:text-zinc-300">
                  {summary.warnings.length} warning{summary.warnings.length === 1 ? "" : "s"} found.
                </div>
                <button
                  type="button"
                  onClick={() => setWarningsModalOpen(true)}
                  className="inline-flex h-9 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 px-3 text-xs font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100 dark:hover:bg-amber-950/40"
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
          className="inline-flex h-10 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
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

