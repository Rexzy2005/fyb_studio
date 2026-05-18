"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Code2,
  FileJson,
  ImageIcon,
  Layers,
  Loader2,
  Maximize2,
  Pencil,
  Sparkles,
  Type,
  UploadCloud,
} from "lucide-react";

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
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  // Upload progress - animates while we read the file so a large drag-drop
  // doesn't look frozen. `uploadingName` tracks the file currently in
  // flight; the bar simulates progress (real progress isn't available
  // from the File API in browsers).
  const [uploading, setUploading] = useState(false);
  const [uploadingName, setUploadingName] = useState<string | null>(null);
  const [uploadPercent, setUploadPercent] = useState(0);
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
    // Show a determinate-looking progress bar while reading. The File API
    // doesn't expose actual byte progress on Blob.text(), so we animate
    // from 0 → ~92% during the read and snap to 100% on completion.
    setUploading(true);
    setUploadingName(file.name);
    setUploadPercent(4);

    const tickHandle = window.setInterval(() => {
      // Asymptotic ramp - fast at first, slowing as it approaches 92%.
      setUploadPercent((p) => (p >= 92 ? p : p + Math.max(1, (92 - p) * 0.18)));
    }, 80);

    try {
      const text = await file.text();
      setJsonText(text);
      setFileName(file.name);
      setUploadPercent(100);
      // Brief hold so users see the bar fill before it disappears.
      await new Promise((r) => window.setTimeout(r, 250));
    } finally {
      window.clearInterval(tickHandle);
      setUploading(false);
      setUploadingName(null);
      setUploadPercent(0);
    }
  }

  async function onChooseFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    await loadJsonFromFile(file);
  }

  async function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
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
        warnings: normalized.warnings.map((w) => ({
          code: w.code,
          message: w.message,
          nodeId: w.nodeId,
        })),
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

  const canCreate = !busy && jsonText.trim().length > 0 && name.trim().length > 0;
  const charCount = jsonText.length;
  // Lines counted with an inclusive-of-final-empty-line tally so the gutter
  // renders a slot for the cursor position after a trailing newline.
  const lineCount = jsonText.length === 0 ? 1 : jsonText.split("\n").length;

  return (
    <div className="h-full overflow-y-auto bg-canvas/40 dark:bg-canvas/40">
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
        {/* ─── PAGE HEADER ─────────────────────────────────────── */}
        <header className="mb-8 sm:mb-10">
          <Link
            href="/admin/templates"
            className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted transition hover:text-ink dark:text-ink-muted dark:hover:text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Templates
          </Link>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-ink-faint dark:text-ink-faint">
            <span aria-hidden className="inline-block h-px w-5 bg-[var(--accent-blue)] opacity-60" />
            Step 1 of 2 · Import
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-3xl dark:text-ink">
            New template
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted dark:text-ink-muted">
            Drop in a Figma-exported design JSON. We&apos;ll normalize it,
            create a local draft, and open the editor so you can wire up
            fields, defaults, and field rules.
          </p>
        </header>

        {error ? (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.08)] p-3.5 text-sm text-danger dark:border-[rgba(239,68,68,0.28)] dark:bg-red-950/40 dark:text-danger">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0">{error}</div>
          </div>
        ) : null}

        <div className="space-y-5 sm:space-y-6">
          {/* ─── NAME ─────────────────────────────────────────── */}
          <FormCard
            eyebrow="Identity"
            title="Template name"
            subtitle="Shown to admins in the library list and to users on the gallery card."
            icon={Pencil}
          >
            <div className="relative">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Final Year Banner"
                maxLength={80}
                className="h-11 w-full rounded-xl border border-hairline bg-surface-1 px-3.5 text-sm text-ink shadow-xs outline-none transition placeholder:text-ink-faint focus-visible:ring-2 focus-visible:ring-[var(--accent-blue-ring)] dark:border-hairline dark:bg-surface-1 dark:text-ink"
              />
              <div className="mt-1.5 text-right text-[10.5px] text-ink-faint tabular-nums dark:text-ink-faint">
                {name.length} / 80
              </div>
            </div>
          </FormCard>

          {/* ─── IMPORT JSON ──────────────────────────────────── */}
          <FormCard
            eyebrow="Source"
            title="Design JSON"
            subtitle="Drop a .json file, choose one from disk, or paste the contents directly."
            icon={FileJson}
          >
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              className={
                "rounded-2xl border-2 border-dashed p-5 text-center transition-all sm:p-7 " +
                (dragOver
                  ? "border-[var(--accent-blue)] bg-[var(--accent-blue-soft)] scale-[1.005]"
                  : "border-hairline bg-canvas/50 dark:border-hairline dark:bg-surface-1/40")
              }
            >
              <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-1 text-[var(--accent-blue)] shadow-xs dark:bg-surface-2">
                <UploadCloud className="h-6 w-6" />
              </div>
              <div className="mt-3 text-sm font-semibold text-ink dark:text-ink">
                Drag your <span className="font-mono text-[12.5px]">.json</span> here
              </div>
              <div className="mt-1 text-[12.5px] text-ink-muted dark:text-ink-muted">
                Or use the picker below - the file stays in this browser.
              </div>

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
                className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[var(--accent-blue)] px-4 text-xs font-semibold text-white shadow-xs transition hover:opacity-90 active:scale-95"
              >
                <UploadCloud className="h-3.5 w-3.5" />
                Choose file
              </button>

              {fileName && !uploading ? (
                <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface-1 px-2.5 py-1 text-[11px] text-ink-muted dark:border-hairline dark:bg-surface-1 dark:text-ink-muted">
                  <FileJson className="h-3 w-3 text-[var(--accent-blue)]" />
                  <span className="font-mono">{fileName}</span>
                </div>
              ) : null}

              {/* Upload progress - shows while we're reading the dropped
                  or chosen file. Sits inside the dropzone so the visual
                  focus stays where the action happened. */}
              {uploading ? (
                <div className="mt-4 mx-auto max-w-sm rounded-2xl border border-hairline bg-surface-1 p-3 text-left shadow-xs dark:border-hairline dark:bg-surface-1">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--accent-blue-soft)] text-[var(--accent-blue)] dark:bg-[var(--accent-blue-soft)] dark:text-[var(--accent-blue)]">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold text-ink dark:text-ink">
                        {uploadingName ?? "Reading file"}
                      </div>
                      <div className="text-[10.5px] text-ink-muted dark:text-ink-muted">
                        Parsing locally · stays in your browser
                      </div>
                    </div>
                    <span className="shrink-0 text-[10.5px] font-semibold tabular-nums text-[var(--accent-blue)]">
                      {Math.round(uploadPercent)}%
                    </span>
                  </div>
                  <div
                    className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-canvas dark:bg-surface-2"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(uploadPercent)}
                  >
                    <div
                      className="h-full rounded-full bg-[var(--accent-blue)] transition-all duration-200 ease-out"
                      style={{ width: `${Math.max(4, Math.min(100, uploadPercent))}%` }}
                    />
                  </div>
                </div>
              ) : null}
            </div>

            {/* JSON paste area - line-numbered. A read-only gutter renders
                line numbers in a synced-scroll column, while the textarea
                stays the single source of truth for the JSON text. */}
            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between gap-3">
                <label
                  htmlFor="design-json"
                  className="inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-faint dark:text-ink-faint"
                >
                  <Code2 className="h-3 w-3" />
                  Or paste raw JSON
                </label>
                {charCount > 0 ? (
                  <span className="text-[10.5px] tabular-nums text-ink-faint dark:text-ink-faint">
                    {charCount.toLocaleString()} chars · {lineCount.toLocaleString()} lines
                  </span>
                ) : null}
              </div>
              <NumberedJsonEditor
                value={jsonText}
                onChange={(v) => {
                  setJsonText(v);
                  if (fileName) setFileName(null);
                }}
                placeholder='{ "document": { … }, "components": { … } }'
              />
            </div>
          </FormCard>

          {/* ─── SUMMARY (only after a normalize run) ─────────── */}
          {summary ? (
            <FormCard
              eyebrow="Inspection"
              title="Normalization summary"
              subtitle="What we saw in the file. Warnings are non-fatal - they call out anything we couldn't render perfectly."
              icon={Sparkles}
            >
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
                <SummaryStat
                  icon={Maximize2}
                  label="Canvas"
                  value={`${Math.round(summary.width)}×${Math.round(summary.height)}`}
                />
                <SummaryStat icon={Layers} label="Nodes" value={summary.nodeCount.toLocaleString()} />
                <SummaryStat icon={Type} label="Text" value={summary.textCount.toLocaleString()} />
                <SummaryStat
                  icon={ImageIcon}
                  label="Images"
                  value={summary.imageCount.toLocaleString()}
                />
              </div>

              {summary.warnings.length ? (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[rgba(245,158,11,0.28)] bg-[rgba(245,158,11,0.08)] px-4 py-3 dark:border-[rgba(245,158,11,0.28)] dark:bg-[rgba(245,158,11,0.12)]">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-warning">
                        {summary.warnings.length} warning
                        {summary.warnings.length === 1 ? "" : "s"} found
                      </div>
                      <div className="text-[11.5px] text-ink-muted dark:text-ink-muted">
                        These won&apos;t block the draft. Review them before publishing.
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setWarningsModalOpen(true)}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[rgba(245,158,11,0.28)] bg-surface-1 px-3 text-xs font-semibold text-warning transition hover:bg-[rgba(245,158,11,0.10)] active:scale-95 dark:border-[rgba(245,158,11,0.28)] dark:bg-surface-1"
                  >
                    View warnings
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : null}
            </FormCard>
          ) : null}

          {/* ─── SUBMIT BAR ───────────────────────────────────── */}
          <div className="flex flex-col gap-3 rounded-2xl border border-hairline bg-surface-1 p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between sm:p-5 dark:border-hairline dark:bg-surface-1">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-ink dark:text-ink">
                Ready to continue?
              </div>
              <div className="text-[12.5px] text-ink-muted dark:text-ink-muted">
                We&apos;ll normalize the JSON and open the editor for step 2.
              </div>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
              <Link
                href="/admin/templates"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-hairline bg-surface-1 px-4 text-sm font-medium text-ink-muted transition hover:bg-canvas hover:text-ink active:scale-95 dark:border-hairline dark:bg-surface-1 dark:text-ink-muted dark:hover:bg-surface-2 dark:hover:text-ink"
              >
                Cancel
              </Link>
              <button
                type="button"
                disabled={!canCreate}
                onClick={onCreate}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--accent-blue)] px-5 text-sm font-semibold text-white shadow-xs transition hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Normalizing…" : "Normalize & create draft"}
                {!busy ? <ArrowRight className="h-4 w-4" /> : null}
              </button>
            </div>
          </div>
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

/* ─── Building blocks ───────────────────────────────────── */

function FormCard({
  eyebrow,
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-hairline bg-surface-1 shadow-xs dark:border-hairline dark:bg-surface-1">
      <header className="flex items-start gap-3 border-b border-hairline-soft px-4 py-3.5 sm:px-5 sm:py-4 dark:border-hairline">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--accent-blue-soft)] text-[var(--accent-blue)] dark:bg-[var(--accent-blue-soft)] dark:text-[var(--accent-blue)]">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint dark:text-ink-faint">
            {eyebrow}
          </div>
          <div className="mt-0.5 text-sm font-semibold tracking-tight text-ink dark:text-ink">
            {title}
          </div>
          {subtitle ? (
            <div className="mt-0.5 text-[12.5px] leading-relaxed text-ink-muted dark:text-ink-muted">
              {subtitle}
            </div>
          ) : null}
        </div>
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

function SummaryStat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-hairline bg-canvas/50 p-3 dark:border-hairline dark:bg-surface-1/40">
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent-blue-soft)] text-[var(--accent-blue)] dark:bg-[var(--accent-blue-soft)] dark:text-[var(--accent-blue)]">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="mt-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-faint dark:text-ink-faint">
        {label}
      </div>
      <div className="mt-0.5 truncate text-lg font-semibold tracking-tight text-ink dark:text-ink">
        {value}
      </div>
    </div>
  );
}

/**
 * Code-editor-style textarea with a synced line-number gutter.
 *
 * The gutter is a separate <pre> rendered alongside the textarea - both
 * scroll together because the wrapper handles scrolling and the gutter's
 * top offset tracks the textarea's scrollTop. Keeping it as a plain
 * textarea preserves accessibility (cursor, selection, copy-paste,
 * spellcheck off) and avoids contenteditable quirks.
 */
function NumberedJsonEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);

  const lineNumbers = useMemo(() => {
    const lines = value.length === 0 ? 1 : value.split("\n").length;
    // Cap at 50k lines just in case someone pastes a monster file; the
    // textarea will still hold the full content.
    const cap = Math.min(lines, 50000);
    return Array.from({ length: cap }, (_, i) => i + 1).join("\n");
  }, [value]);

  function syncScroll() {
    if (!textareaRef.current || !gutterRef.current) return;
    gutterRef.current.scrollTop = textareaRef.current.scrollTop;
  }

  return (
    <div className="overflow-hidden rounded-xl border border-hairline bg-surface-1 shadow-xs dark:border-hairline dark:bg-surface-1">
      {/* Capped height - the textarea itself scrolls when content exceeds
          the box, so large JSON pastes don't push the whole page down. */}
      <div className="flex h-[420px] max-h-[60dvh] min-h-[260px]">
        {/* Gutter - read-only line numbers. Hidden scrollbar, kept in
            sync with the textarea via onScroll below. */}
        <div
          ref={gutterRef}
          aria-hidden
          className="select-none overflow-hidden border-r border-hairline bg-canvas/60 text-right font-mono text-[11.5px] leading-[1.55] text-ink-faint dark:border-hairline dark:bg-surface-2/40 dark:text-ink-faint"
          style={{
            padding: "12px 10px 12px 8px",
            minWidth: "3.25rem",
            whiteSpace: "pre",
            // Match textarea line-height; tabular-nums keeps columns even.
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {lineNumbers}
        </div>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onScroll={syncScroll}
          spellCheck={false}
          placeholder={placeholder}
          className="block h-full w-full flex-1 resize-none overflow-auto bg-transparent p-3 font-mono text-[12px] leading-[1.55] text-ink outline-none placeholder:text-ink-faint focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-blue-ring)] dark:text-ink"
          style={{
            // Disable word-wrap so line numbers match visually.
            whiteSpace: "pre",
            overflowWrap: "normal",
            wordBreak: "normal",
            tabSize: 2,
          }}
        />
      </div>
    </div>
  );
}
