"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { createLocalTemplateRepository } from "@/lib/storage/templateRepo";
import {
  fetchAdminTemplateList,
  unpublishTemplate,
  type RemoteTemplateListItem,
} from "@/lib/api/adminTemplates";
import { usePreviewUrl } from "@/components/admin/usePreviewUrl";

type StatusFilter = "all" | "draft" | "published";

type AdminTemplateRow = {
  id: string;
  name: string;
  category: string | null;
  status: "draft" | "published";
  source: "local-draft" | "remote-published";
  updatedAt: string;
  previewId?: string;
  coverUrl?: string;
};

type ConfirmState =
  | null
  | { kind: "delete-local"; id: string; name: string }
  | { kind: "unpublish"; id: string; name: string };

function deriveCategoryLabel(name: string): "FYB" | "Sign-out" {
  const n = name.toLowerCase();
  if (/(sign\s*-?\s*out|signed\s*out)/.test(n)) return "Sign-out";
  return "FYB";
}

function deriveSearchCategoryLabel(row: AdminTemplateRow): string {
  const explicit = row.category?.trim();
  if (explicit) return explicit;
  return deriveCategoryLabel(row.name);
}

function formatUpdated(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function AdminTemplatesPage() {
  const repo = useMemo(() => createLocalTemplateRepository(), []);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AdminTemplateRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [confirm, setConfirm] = useState<ConfirmState>(null);

  async function refresh() {
    try {
      setLoading(true);
      setError(null);

      const [localMeta, remoteListResult] = await Promise.all([
        repo.listMeta(),
        fetchAdminTemplateList().catch((e: unknown) => {
          console.error("[admin/templates] failed to fetch backend list", e);
          return [] as RemoteTemplateListItem[];
        }),
      ]);

      const localRows: AdminTemplateRow[] = localMeta
        .filter((m) => m.status === "draft")
        .map((m) => ({
          id: m.id,
          name: m.name,
          category: m.category ?? null,
          status: "draft",
          source: "local-draft",
          updatedAt: m.updatedAt,
          previewId: m.previewId,
        }));

      const remoteRows: AdminTemplateRow[] = remoteListResult.map((r) => ({
        id: r.id,
        name: r.name,
        category: r.category,
        status: "published",
        source: "remote-published",
        updatedAt: r.updatedAt,
        coverUrl: r.coverUrl,
      }));

      const merged = [...remoteRows, ...localRows].sort((a, b) =>
        a.updatedAt < b.updatedAt ? 1 : -1
      );
      setRows(merged);
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

  async function onDeleteLocal(id: string) {
    await repo.delete(id);
    await refresh();
  }

  async function onUnpublish(id: string, confirmName: string) {
    await unpublishTemplate(id, confirmName);
    await refresh();
  }

  async function onDuplicateLocal(id: string) {
    await repo.duplicate(id);
    await refresh();
  }

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    return rows.filter((t) => {
      if (status !== "all" && t.status !== status) return false;
      if (!q) return true;
      const cat = deriveSearchCategoryLabel(t);
      return t.name.toLowerCase().includes(q) || cat.toLowerCase().includes(q);
    });
  }, [rows, status, debouncedSearch]);

  const counts = useMemo(() => {
    const draftCount = rows.filter((r) => r.status === "draft").length;
    const publishedCount = rows.filter((r) => r.status === "published").length;
    return { all: rows.length, draft: draftCount, published: publishedCount };
  }, [rows]);

  return (
    <div className="h-full overflow-y-auto bg-canvas/40 dark:bg-canvas/40">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-ink dark:text-ink">
              Templates
            </h1>
            <p className="text-sm text-ink-muted dark:text-ink-faint">
              Manage local drafts and live published templates. Drafts live in this
              browser; published templates are live to all users.
            </p>
          </div>

          {/* Mobile: filter + search sit side-by-side on one row, then a
              full-width "New template" button drops below. Desktop keeps
              the original [filter] [search + new-button] split. */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              <StatusTabs value={status} onChange={setStatus} counts={counts} />
              <div className="relative min-w-0 flex-1 sm:hidden">
                <SearchInputIcon />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search…"
                  className="h-10 w-full rounded-xl border border-hairline bg-surface-1 pl-10 pr-3 text-sm text-ink shadow-xs outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--accent-blue-ring)] dark:border-hairline dark:bg-surface-1 dark:text-ink"
                  inputMode="search"
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {/* Desktop-only search - stays where it always was on sm+ */}
              <div className="relative hidden w-full sm:block sm:w-72">
                <SearchInputIcon />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search templates…"
                  className="h-10 w-full rounded-xl border border-hairline bg-surface-1 pl-10 pr-3 text-sm text-ink shadow-xs outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--accent-blue-ring)] dark:border-hairline dark:bg-surface-1 dark:text-ink"
                  inputMode="search"
                />
              </div>

              <Link
                href="/admin/templates/new"
                className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl bg-surface-1 px-4 text-sm font-medium text-white shadow-xs transition hover:bg-surface-2 sm:w-auto dark:bg-surface-2 dark:text-ink dark:hover:bg-surface-1"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                New template
              </Link>
            </div>
          </div>
        </header>

        <div className="mt-6">
          {error ? (
            <div className="mb-4 rounded-xl border border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.08)] p-4 text-sm text-danger dark:border-[rgba(239,68,68,0.28)] dark:bg-[rgba(239,68,68,0.12)] dark:text-danger">
              {error}
            </div>
          ) : null}

          {loading ? (
            <CardGrid>
              {Array.from({ length: 8 }).map((_, i) => (
                <AdminTemplateCardSkeleton key={i} />
              ))}
            </CardGrid>
          ) : filtered.length === 0 ? (
            <EmptyState query={debouncedSearch} status={status} />
          ) : (
            <CardGrid>
              {filtered.map((t) => (
                <AdminTemplateCard
                  key={`${t.source}:${t.id}`}
                  row={t}
                  onDuplicateLocal={onDuplicateLocal}
                  onRequestDeleteLocal={(id, name) =>
                    setConfirm({ kind: "delete-local", id, name })
                  }
                  onRequestUnpublish={(id, name) =>
                    setConfirm({ kind: "unpublish", id, name })
                  }
                />
              ))}
            </CardGrid>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirm?.kind === "delete-local"}
        title="Delete draft?"
        description={
          confirm?.kind === "delete-local"
            ? `This will permanently remove the local draft “${confirm.name}” from this browser. This action cannot be undone.`
            : ""
        }
        confirmLabel="Delete draft"
        dangerous
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          if (confirm?.kind !== "delete-local") return;
          await onDeleteLocal(confirm.id);
          setConfirm(null);
        }}
      />

      <UnpublishDialog
        open={confirm?.kind === "unpublish"}
        templateName={confirm?.kind === "unpublish" ? confirm.name : ""}
        onClose={() => setConfirm(null)}
        onConfirm={async (typed) => {
          if (confirm?.kind !== "unpublish") return;
          await onUnpublish(confirm.id, typed);
          setConfirm(null);
        }}
      />
    </div>
  );
}

function CardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
      {children}
    </div>
  );
}

/** Shared magnifier icon used in both the mobile and desktop search inputs. */
function SearchInputIcon() {
  return (
    <div className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-ink-faint">
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
  );
}

function AdminTemplateCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-hairline bg-surface-1 shadow-xs dark:border-hairline dark:bg-surface-1">
      <div className="fyb-skeleton-shine relative w-full overflow-hidden" style={{ aspectRatio: 4 / 5 }} />
      <div className="space-y-2 p-4">
        <div className="fyb-skeleton h-4 w-4/5 rounded-full" />
        <div className="fyb-skeleton h-3 w-2/3 rounded-full" />
      </div>
    </div>
  );
}

function LocalDraftPreview({ previewId }: { previewId?: string }) {
  const { url } = usePreviewUrl(previewId);

  return (
    <div className="relative h-full w-full">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt="Draft preview"
          className="absolute inset-0 h-full w-full object-contain transition-transform duration-500 will-change-transform group-hover:scale-[1.03]"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-ink-faint dark:text-ink-muted">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="9" cy="9" r="1.5" fill="currentColor" />
            <path d="M21 15l-5-5L5 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-[11px]">No preview yet</span>
        </div>
      )}
    </div>
  );
}

function RemoteCoverPreview({ url }: { url: string }) {
  return (
    <div className="relative h-full w-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Template cover"
        className="absolute inset-0 h-full w-full object-contain transition-transform duration-500 will-change-transform group-hover:scale-[1.03]"
      />
    </div>
  );
}

function AdminTemplateCard({
  row,
  onDuplicateLocal,
  onRequestDeleteLocal,
  onRequestUnpublish,
}: {
  row: AdminTemplateRow;
  onDuplicateLocal: (id: string) => void | Promise<void>;
  onRequestDeleteLocal: (id: string, name: string) => void;
  onRequestUnpublish: (id: string, name: string) => void;
}) {
  const categoryLabel = row.category ?? deriveCategoryLabel(row.name);
  const updated = formatUpdated(row.updatedAt);
  const isPublished = row.status === "published";
  const isLocalDraft = row.source === "local-draft";

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-hairline bg-surface-1 shadow-xs transition-all hover:-translate-y-0.5 hover:border-hairline hover:shadow-lg focus-within:ring-2 focus-within:ring-[var(--accent-blue-ring)] dark:border-hairline dark:bg-surface-1 dark:hover:border-hairline">
      <div
        className="relative w-full overflow-hidden bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-zinc-800/60 dark:to-zinc-900/60"
        style={{ aspectRatio: 4 / 5 }}
      >
        {row.source === "remote-published" && row.coverUrl ? (
          <RemoteCoverPreview url={row.coverUrl} />
        ) : (
          <LocalDraftPreview previewId={row.previewId} />
        )}

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
          <span
            className={
              "pointer-events-auto inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wide shadow-xs backdrop-blur " +
              (isPublished
                ? "border-[rgba(0,153,255,0.28)] bg-[var(--accent-blue-soft)]/95 text-[var(--accent-blue)] dark:border-[rgba(0,153,255,0.28)] dark:bg-[var(--accent-blue-soft)] dark:text-[var(--accent-blue)]"
                : "border-[rgba(245,158,11,0.28)] bg-[rgba(245,158,11,0.08)]/95 text-warning dark:border-[rgba(245,158,11,0.28)] dark:bg-[rgba(245,158,11,0.2)] dark:text-warning")
            }
          >
            <span
              className={
                "h-1.5 w-1.5 rounded-full " +
                (isPublished ? "bg-[var(--accent-blue)]" : "bg-[rgba(245,158,11,0.08)]0")
              }
              aria-hidden
            />
            {isPublished ? "Live" : "Draft"}
          </span>
        </div>

        {/* Action overlay - always visible on touch (no hover state),
            reveals on hover on desktop. The p-2 / gap-1 keeps the row
            from running off the edge in the mobile 2-col grid. */}
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-end gap-1 bg-gradient-to-t from-black/55 via-black/10 to-transparent p-2 opacity-100 transition sm:gap-1.5 sm:p-3 md:opacity-0 md:group-hover:opacity-100">
          <IconLink href={`/admin/templates/${row.id}`} label="Edit template" icon="edit" />
          {isLocalDraft ? (
            <>
              <IconButton
                onClick={() => onDuplicateLocal(row.id)}
                label="Duplicate draft"
                icon="duplicate"
              />
              <IconButton
                onClick={() => onRequestDeleteLocal(row.id, row.name)}
                label="Delete draft"
                icon="trash"
                dangerous
              />
            </>
          ) : (
            <IconButton
              onClick={() => onRequestUnpublish(row.id, row.name)}
              label="Unpublish & delete"
              icon="trash"
              dangerous
            />
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1 border-t border-hairline-soft p-3 sm:p-4 dark:border-hairline">
        <div className="truncate text-xs sm:text-sm font-semibold tracking-tight text-ink dark:text-ink">
          {row.name}
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 text-[10.5px] sm:text-[11.5px] text-ink-faint dark:text-ink-faint">
          <span className="inline-flex shrink-0 items-center rounded-md bg-surface-2 px-1.5 py-0.5 font-medium text-ink-muted dark:bg-surface-2 dark:text-ink-muted">
            {categoryLabel}
          </span>
          <span aria-hidden className="hidden sm:inline text-ink-faint dark:text-ink-muted">
            •
          </span>
          <span className="hidden sm:inline">Updated {updated}</span>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ query, status }: { query: string; status: StatusFilter }) {
  const hasFilter = query.length > 0 || status !== "all";
  return (
    <div className="rounded-2xl border border-dashed border-hairline bg-surface-1 p-12 text-center dark:border-hairline dark:bg-surface-1/40">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-surface-2 text-ink-faint dark:bg-surface-2 dark:text-ink-faint">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M3 9h18M9 21V9" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </div>
      <div className="mt-4 text-sm font-medium text-ink dark:text-ink">
        {hasFilter ? "No templates match your filters" : "No templates yet"}
      </div>
      <div className="mt-1 text-sm text-ink-muted dark:text-ink-faint">
        {hasFilter
          ? "Try clearing the search or switching tabs."
          : "Create your first template to get started."}
      </div>
      {!hasFilter ? (
        <Link
          href="/admin/templates/new"
          className="mt-4 inline-flex h-9 items-center justify-center rounded-xl bg-surface-1 px-4 text-sm font-medium text-white hover:bg-surface-2 dark:bg-surface-2 dark:text-ink dark:hover:bg-surface-1"
        >
          New template
        </Link>
      ) : null}
    </div>
  );
}

function StatusTabs({
  value,
  onChange,
  counts,
}: {
  value: StatusFilter;
  onChange: (v: StatusFilter) => void;
  counts: { all: number; draft: number; published: number };
}) {
  const items: Array<{ key: StatusFilter; label: string; count: number }> = [
    { key: "all", label: "All", count: counts.all },
    { key: "published", label: "Published", count: counts.published },
    { key: "draft", label: "Drafts", count: counts.draft },
  ];

  return (
    <div className="inline-flex rounded-xl border border-hairline bg-surface-1 p-1 shadow-xs dark:border-hairline dark:bg-surface-1">
      {items.map((it) => {
        const active = it.key === value;
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onChange(it.key)}
            className={
              "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue-ring)] " +
              (active
                ? "bg-surface-1 text-white shadow-xs dark:bg-surface-2 dark:text-ink"
                : "text-ink-muted hover:bg-canvas hover:text-ink dark:text-ink-faint dark:hover:bg-surface-2/60 dark:hover:text-ink")
            }
          >
            {it.label}
            <span
              className={
                "rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums " +
                (active
                  ? "bg-surface-1/20 text-white dark:bg-surface-1/20 dark:text-ink"
                  : "bg-surface-2 text-ink-muted dark:bg-surface-2 dark:text-ink-muted")
              }
            >
              {it.count}
            </span>
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
  icon: "edit" | "duplicate" | "trash";
  dangerous?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={
        "grid h-9 w-9 place-items-center rounded-xl border bg-surface-1/95 shadow-sm backdrop-blur transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue-ring)] dark:bg-surface-1/95 " +
        (dangerous
          ? "border-[rgba(239,68,68,0.28)] text-danger hover:border-red-600 hover:bg-red-600 hover:text-white dark:border-[rgba(239,68,68,0.28)] dark:text-red-300 dark:hover:border-red-500 dark:hover:bg-red-600 dark:hover:text-white"
          : "border-hairline text-ink-muted hover:bg-canvas dark:border-hairline dark:text-ink dark:hover:bg-surface-2/60")
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
      className="grid h-9 w-9 place-items-center rounded-xl border border-hairline bg-surface-1/95 text-ink-muted shadow-sm backdrop-blur transition hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue-ring)] dark:border-hairline dark:bg-surface-1/95 dark:text-ink dark:hover:bg-surface-2/60"
    >
      <Icon name={icon} />
    </Link>
  );
}

function Icon({ name }: { name: "edit" | "duplicate" | "trash" }) {
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
          <path d="M10 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M6 7l1 14h10l1-14" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M9 7V4h6v3" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
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
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-hairline bg-surface-1 p-5 shadow-xl dark:border-hairline dark:bg-surface-1">
        <div className="text-sm font-semibold text-ink dark:text-ink">{title}</div>
        <div className="mt-2 text-sm leading-6 text-ink-muted dark:text-ink-muted">{description}</div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-hairline bg-surface-1 px-4 text-sm font-medium text-ink shadow-xs transition hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue-ring)] dark:border-hairline dark:bg-surface-1 dark:text-ink dark:hover:bg-surface-2"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={
              "inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-medium shadow-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-blue-ring)] " +
              (dangerous
                ? "bg-red-600 text-white hover:bg-[rgba(239,68,68,0.08)]0"
                : "bg-surface-1 text-white hover:bg-surface-2 dark:bg-surface-2 dark:text-ink dark:hover:bg-surface-1")
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// Unpublish has heavier consequences than deleting a local draft (it removes a
// live template every user can see), so we require the admin to type the exact
// name to confirm - matching the backend's `confirmName` requirement.
function UnpublishDialog({
  open,
  templateName,
  onClose,
  onConfirm,
}: {
  open: boolean;
  templateName: string;
  onClose: () => void;
  onConfirm: (typedName: string) => void | Promise<void>;
}) {
  const [typed, setTyped] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTyped("");
      setSubmitError(null);
      setSubmitting(false);
    }
  }, [open]);

  if (!open) return null;

  const matches = typed.trim() === templateName.trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Unpublish template"
      onMouseDown={(e) => {
        if (e.currentTarget === e.target && !submitting) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-hairline bg-surface-1 shadow-xl dark:border-hairline dark:bg-surface-1">
        <div className="flex items-start gap-3 border-b border-hairline-soft px-5 py-4 dark:border-hairline">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[rgba(239,68,68,0.08)] text-danger dark:bg-red-950/40 dark:text-red-300">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 9v4M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path
                d="M10.3 3.86a2 2 0 0 1 3.4 0l8.4 14.5A2 2 0 0 1 20.4 21H3.6a2 2 0 0 1-1.7-2.64L10.3 3.86Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-ink dark:text-ink">
              Unpublish & delete this template?
            </div>
            <div className="mt-1 text-sm leading-6 text-ink-muted dark:text-ink-muted">
              This will remove <span className="font-medium text-ink dark:text-ink">{templateName}</span> from
              the live catalogue. Users who haven&apos;t downloaded yet will lose access. This action cannot be undone.
            </div>
          </div>
        </div>

        <form
          className="px-5 py-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!matches || submitting) return;
            setSubmitting(true);
            setSubmitError(null);
            try {
              await onConfirm(typed.trim());
            } catch (err) {
              setSubmitError(err instanceof Error ? err.message : "Failed to unpublish");
              setSubmitting(false);
            }
          }}
        >
          <label className="block">
            <span className="text-xs font-medium text-ink-muted dark:text-ink-muted">
              Type <span className="font-semibold text-ink dark:text-ink">{templateName}</span> to confirm
            </span>
            <input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={templateName}
              className="mt-1.5 h-10 w-full rounded-xl border border-hairline bg-surface-1 px-3 text-sm text-ink outline-none transition focus-visible:ring-2 focus-visible:ring-red-500/40 dark:border-hairline dark:bg-surface-1 dark:text-ink"
              disabled={submitting}
            />
          </label>

          {submitError ? (
            <div className="mt-3 rounded-lg border border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.08)] px-3 py-2 text-xs text-danger dark:border-[rgba(239,68,68,0.28)] dark:bg-[rgba(239,68,68,0.12)] dark:text-danger">
              {submitError}
            </div>
          ) : null}

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-hairline bg-surface-1 px-4 text-sm font-medium text-ink shadow-xs transition hover:bg-canvas disabled:opacity-50 dark:border-hairline dark:bg-surface-1 dark:text-ink dark:hover:bg-surface-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!matches || submitting}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-red-600 px-4 text-sm font-medium text-white shadow-xs transition hover:bg-[rgba(239,68,68,0.08)]0 disabled:cursor-not-allowed disabled:bg-red-300 disabled:hover:bg-red-300 dark:disabled:bg-red-900/40"
            >
              {submitting ? "Unpublishing…" : "Unpublish & delete"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
