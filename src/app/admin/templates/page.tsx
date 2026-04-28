"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";

import { createLocalTemplateRepository } from "@/lib/storage/templateRepo";
import type { TemplateMeta } from "@/lib/storage/types";
import { usePreviewUrl } from "@/components/admin/usePreviewUrl";

type StatusFilter = "all" | "draft" | "published";

function deriveCategoryLabel(name: string): "FYB" | "Sign-out" {
  const n = name.toLowerCase();
  if (/(sign\s*-?\s*out|signed\s*out)/.test(n)) return "Sign-out";
  return "FYB";
}

function deriveSearchCategoryLabel(template: Pick<TemplateMeta, "name" | "category">): string {
  const explicit = template.category?.trim();
  if (explicit) return explicit;
  return deriveCategoryLabel(template.name);
}

function formatUpdated(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function AdminTemplatesPage() {
  const repo = useMemo(() => createLocalTemplateRepository(), []);
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [confirm, setConfirm] = useState<
    | null
    | {
        kind: "delete";
        id: string;
        name: string;
      }
  >(null);

  async function refresh() {
    try {
      setLoading(true);
      setTemplates(await repo.listMeta());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onDelete(id: string) {
    await repo.delete(id);
    await refresh();
  }

  async function onDuplicate(id: string) {
    await repo.duplicate(id);
    await refresh();
  }

  async function onPublish(id: string) {
    await repo.setStatus(id, "published");
    await refresh();
  }

  async function onUnpublish(id: string) {
    await repo.setStatus(id, "draft");
    await refresh();
  }

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    return templates.filter((t) => {
      if (status !== "all" && t.status !== status) return false;
      if (!q) return true;
      const cat = deriveSearchCategoryLabel(t);
      return t.name.toLowerCase().includes(q) || cat.toLowerCase().includes(q);
    });
  }, [templates, status, debouncedSearch]);

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-100">Templates</h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">Full-image previews, status, and admin actions.</p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center justify-end">
              <StatusTabs value={status} onChange={setStatus} />
            </div>

            <div className="relative w-full sm:w-72">
              <div className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-zinc-400">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search templates…"
                className="h-10 w-full rounded-2xl border border-zinc-200 bg-white pl-10 pr-3 text-sm text-zinc-900 shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                inputMode="search"
              />
            </div>

            <Link
              href="/admin/templates/new"
              className="inline-flex h-10 items-center justify-center rounded-2xl bg-zinc-900 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              Create Template
            </Link>
          </div>
        </header>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        ) : null}

        {loading ? (
          <div className="columns-2 gap-x-4 sm:columns-2 lg:columns-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <AdminTemplateCardSkeleton key={i} index={i} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
            No templates match your filters.
          </div>
        ) : (
          <div className="columns-2 gap-x-4 sm:columns-2 lg:columns-3">
            {filtered.map((t) => (
              <AdminTemplateCard
                key={t.id}
                template={t}
                onDuplicate={onDuplicate}
                onPublish={onPublish}
                onUnpublish={onUnpublish}
                onRequestDelete={(id, name) => setConfirm({ kind: "delete", id, name })}
              />
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirm?.kind === "delete"}
        title="Delete template?"
        description={confirm ? `This will permanently remove “${confirm.name}” from local storage.` : ""}
        confirmLabel="Delete"
        dangerous
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          if (!confirm) return;
          await onDelete(confirm.id);
          setConfirm(null);
        }}
      />
    </div>
  );
}

function AdminTemplateCardSkeleton({ index }: { index: number }) {
  const ratios = [4 / 5, 3 / 4, 2 / 3, 1, 5 / 7, 9 / 16, 4 / 6];
  const ratio = ratios[index % ratios.length] ?? 4 / 5;
  return (
    <div className="mb-4 inline-block w-full align-top break-inside-avoid overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="w-full rounded-t-2xl bg-zinc-100 dark:bg-zinc-800/60">
        <div className="relative w-full overflow-hidden">
          <div className="w-full" style={{ aspectRatio: ratio }} />
          <div className="fyb-skeleton-shine absolute inset-0" />

          <div className="pointer-events-none absolute left-3 top-3">
            <div className="h-6 w-20 rounded-full border border-zinc-200 bg-white/60 shadow-sm backdrop-blur-sm dark:border-zinc-700/60 dark:bg-zinc-900/40" />
          </div>

          <div className="absolute right-3 top-3 flex gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-9 w-9 rounded-xl border border-zinc-200 bg-white/70 shadow-sm backdrop-blur-sm dark:border-zinc-700/60 dark:bg-zinc-900/50"
              />
            ))}
          </div>
        </div>
      </div>

      <div className="p-4">
        <div className="h-4 w-4/5 rounded-full bg-zinc-200/80 dark:bg-zinc-700/70" />
        <div className="mt-2 h-3 w-2/3 rounded-full bg-zinc-200/60 dark:bg-zinc-700/50" />
      </div>
    </div>
  );
}

function TemplatePreview({ previewId }: { previewId?: string }) {
  const { url, width, height } = usePreviewUrl(previewId);
  const ratio = typeof width === "number" && typeof height === "number" && width > 0 && height > 0 ? width / height : 4 / 5;

  return (
    <div className="w-full rounded-t-2xl bg-zinc-100 dark:bg-zinc-800/60">
      <div className="relative w-full overflow-hidden">
        <div className="w-full" style={{ aspectRatio: ratio }} />

        <div className="absolute inset-0 bg-linear-to-br from-white/0 via-white/0 to-zinc-950/5 dark:to-white/5" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.06)_1px,transparent_0)] bg-size-[14px_14px] opacity-35 dark:opacity-25" />

        {url ? (
          // Full-image preview (uncropped) using object-contain.
          // Uses a fixed tile ratio; true masonry sizing comes from the stored preview dims (added in publish phase).
          <Image
            src={url}
            alt="Template preview"
            className="absolute inset-0 h-full w-full object-contain transition-transform duration-500 will-change-transform group-hover:scale-[1.02]"
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            unoptimized
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-zinc-500 dark:text-zinc-400">
            No preview yet
          </div>
        )}

        {/* Hover gradient layer (above image) */}
        <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100 bg-linear-to-t from-zinc-950/25 via-zinc-950/10 to-transparent dark:from-zinc-950/45 dark:via-zinc-950/25" />
      </div>
    </div>
  );
}

function AdminTemplateCard({
  template,
  onDuplicate,
  onPublish,
  onUnpublish,
  onRequestDelete,
}: {
  template: TemplateMeta;
  onDuplicate: (id: string) => void | Promise<void>;
  onPublish: (id: string) => void | Promise<void>;
  onUnpublish: (id: string) => void | Promise<void>;
  onRequestDelete: (id: string, name: string) => void;
}) {
  const categoryLabel = deriveCategoryLabel(template.name);
  const updated = formatUpdated(template.updatedAt);
  const isPublished = template.status === "published";

  return (
    <div className="group mb-4 inline-block w-full align-top break-inside-avoid overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-lg focus-within:ring-2 focus-within:ring-emerald-500/40 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700">
      <div className="relative">
        <TemplatePreview previewId={template.previewId} />

        <div className="pointer-events-none absolute left-3 top-3">
          <span
            className={
              "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium shadow-sm " +
              (isPublished
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-200"
                : "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-200")
            }
          >
            {isPublished ? "Published" : "Draft"}
          </span>
        </div>

        {/* Actions: always visible on mobile/tablet, hover-reveal on desktop */}
        <div className="absolute right-3 top-3 flex gap-2 opacity-100 transition lg:opacity-0 lg:group-hover:opacity-100">
          <IconLink href={`/admin/templates/${template.id}`} label="Edit" icon="edit" />
          {isPublished ? (
            <IconButton onClick={() => onUnpublish(template.id)} label="Unpublish" icon="unpublish" />
          ) : (
            <IconButton onClick={() => onPublish(template.id)} label="Publish" icon="publish" />
          )}
          <IconButton onClick={() => onDuplicate(template.id)} label="Duplicate" icon="duplicate" />
          <IconButton onClick={() => onRequestDelete(template.id, template.name)} label="Delete" icon="trash" dangerous />
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold tracking-tight text-zinc-950 dark:text-zinc-100">{template.name}</div>
            <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {categoryLabel} • Updated {updated}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusTabs({ value, onChange }: { value: StatusFilter; onChange: (v: StatusFilter) => void }) {
  const items: Array<{ key: StatusFilter; label: string }> = [
    { key: "all", label: "All" },
    { key: "draft", label: "Drafts" },
    { key: "published", label: "Published" },
  ];

  return (
    <div className="grid grid-cols-3 gap-1 rounded-2xl border border-zinc-200 bg-white p-1 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      {items.map((it) => {
        const active = it.key === value;
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onChange(it.key)}
            className={
              "h-9 rounded-xl px-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 " +
              (active
                ? "bg-zinc-900 text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-transparent text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100")
            }
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

function IconButton({
  onClick,
  label,
  icon,
  dangerous,
}: {
  onClick: () => void;
  label: string;
  icon: "edit" | "publish" | "unpublish" | "duplicate" | "trash";
  dangerous?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={
        "grid h-9 w-9 place-items-center rounded-xl border bg-white shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:bg-zinc-900 " +
        (dangerous
          ? "border-red-200 text-red-700 hover:border-red-600 hover:bg-red-600 hover:text-white dark:border-red-900/40 dark:text-red-200 dark:hover:border-red-500 dark:hover:bg-red-600 dark:hover:text-white"
          : "border-zinc-200 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-800/60")
      }
    >
      <Icon name={icon} />
    </button>
  );
}

function IconLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: "edit";
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="grid h-9 w-9 place-items-center rounded-xl border border-zinc-200 bg-white text-zinc-700 shadow-sm transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800/60"
    >
      <Icon name={icon} />
    </Link>
  );
}

function Icon({ name }: { name: "edit" | "publish" | "unpublish" | "duplicate" | "trash" }) {
  switch (name) {
    case "edit":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M4 20h4l10.5-10.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16v4Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M13.5 6.5l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "publish":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M12 3v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M7 8l5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 21h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "unpublish":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M12 21V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M17 16l-5 5-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 3h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "duplicate":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M8 8h10a2 2 0 0 1 2 2v10H10a2 2 0 0 1-2-2V8Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M6 16H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "trash":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M4 7h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path
            d="M10 11v6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M14 11v6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M6 7l1 14h10l1-14"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M9 7V4h6v3"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      );
  }
}

function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  dangerous,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  dangerous?: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        if (e.currentTarget === e.target) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">{title}</div>
        <div className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{description}</div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-900 shadow-sm transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={
              "inline-flex h-10 items-center justify-center rounded-2xl px-4 text-sm font-medium shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 " +
              (dangerous
                ? "bg-red-600 text-white hover:bg-red-500"
                : "bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white")
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
