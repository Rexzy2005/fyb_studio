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
  if (Number.isNaN(d.getTime())) return "—";
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
    <div className="h-full overflow-y-auto bg-zinc-50/40 dark:bg-zinc-950/40">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-100">
              Templates
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Manage local drafts and live published templates. Drafts live in this
              browser; published templates are live to all users.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <StatusTabs value={status} onChange={setStatus} counts={counts} />

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
                  className="h-10 w-full rounded-xl border border-zinc-200 bg-white pl-10 pr-3 text-sm text-zinc-900 shadow-xs outline-none transition focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                  inputMode="search"
                />
              </div>

              <Link
                href="/admin/templates/new"
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white shadow-xs transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
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
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
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
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {children}
    </div>
  );
}

function AdminTemplateCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
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
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-zinc-400 dark:text-zinc-600">
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
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xs transition-all hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-lg focus-within:ring-2 focus-within:ring-emerald-500/40 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700">
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
                ? "border-emerald-200 bg-emerald-50/95 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/60 dark:text-emerald-200"
                : "border-amber-200 bg-amber-50/95 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/60 dark:text-amber-200")
            }
          >
            <span
              className={
                "h-1.5 w-1.5 rounded-full " +
                (isPublished ? "bg-emerald-500" : "bg-amber-500")
              }
              aria-hidden
            />
            {isPublished ? "Live" : "Draft"}
          </span>
        </div>

        <div className="absolute inset-x-0 bottom-0 flex items-end justify-end gap-1.5 bg-gradient-to-t from-black/45 via-black/0 to-transparent p-3 opacity-0 transition group-hover:opacity-100">
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

      <div className="flex flex-col gap-1 border-t border-zinc-100 p-4 dark:border-zinc-800">
        <div className="truncate text-sm font-semibold tracking-tight text-zinc-950 dark:text-zinc-100">
          {row.name}
        </div>
        <div className="flex items-center gap-2 text-[11.5px] text-zinc-500 dark:text-zinc-400">
          <span className="inline-flex items-center rounded-md bg-zinc-100 px-1.5 py-0.5 font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {categoryLabel}
          </span>
          <span aria-hidden className="text-zinc-300 dark:text-zinc-700">
            •
          </span>
          <span>Updated {updated}</span>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ query, status }: { query: string; status: StatusFilter }) {
  const hasFilter = query.length > 0 || status !== "all";
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center dark:border-zinc-700 dark:bg-zinc-900/40">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M3 9h18M9 21V9" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </div>
      <div className="mt-4 text-sm font-medium text-zinc-900 dark:text-zinc-100">
        {hasFilter ? "No templates match your filters" : "No templates yet"}
      </div>
      <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        {hasFilter
          ? "Try clearing the search or switching tabs."
          : "Create your first template to get started."}
      </div>
      {!hasFilter ? (
        <Link
          href="/admin/templates/new"
          className="mt-4 inline-flex h-9 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
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
    <div className="inline-flex rounded-xl border border-zinc-200 bg-white p-1 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
      {items.map((it) => {
        const active = it.key === value;
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onChange(it.key)}
            className={
              "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 " +
              (active
                ? "bg-zinc-900 text-white shadow-xs dark:bg-zinc-100 dark:text-zinc-900"
                : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100")
            }
          >
            {it.label}
            <span
              className={
                "rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums " +
                (active
                  ? "bg-white/20 text-white dark:bg-zinc-900/20 dark:text-zinc-900"
                  : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300")
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
        "grid h-9 w-9 place-items-center rounded-xl border bg-white/95 shadow-sm backdrop-blur transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:bg-zinc-900/95 " +
        (dangerous
          ? "border-red-200 text-red-700 hover:border-red-600 hover:bg-red-600 hover:text-white dark:border-red-900/40 dark:text-red-300 dark:hover:border-red-500 dark:hover:bg-red-600 dark:hover:text-white"
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
      className="grid h-9 w-9 place-items-center rounded-xl border border-zinc-200 bg-white/95 text-zinc-700 shadow-sm backdrop-blur transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:border-zinc-800 dark:bg-zinc-900/95 dark:text-zinc-200 dark:hover:bg-zinc-800/60"
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
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">{title}</div>
        <div className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">{description}</div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-900 shadow-xs transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={
              "inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-medium shadow-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 " +
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

// Unpublish has heavier consequences than deleting a local draft (it removes a
// live template every user can see), so we require the admin to type the exact
// name to confirm — matching the backend's `confirmName` requirement.
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
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-start gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300">
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
            <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">
              Unpublish & delete this template?
            </div>
            <div className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              This will remove <span className="font-medium text-zinc-900 dark:text-zinc-100">{templateName}</span> from
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
            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Type <span className="font-semibold text-zinc-900 dark:text-zinc-100">{templateName}</span> to confirm
            </span>
            <input
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={templateName}
              className="mt-1.5 h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none transition focus-visible:ring-2 focus-visible:ring-red-500/40 dark:border-zinc-800 dark:bg-zinc-950/30 dark:text-zinc-100"
              disabled={submitting}
            />
          </label>

          {submitError ? (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
              {submitError}
            </div>
          ) : null}

          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-900 shadow-xs transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!matches || submitting}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-red-600 px-4 text-sm font-medium text-white shadow-xs transition hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-red-300 disabled:hover:bg-red-300 dark:disabled:bg-red-900/40"
            >
              {submitting ? "Unpublishing…" : "Unpublish & delete"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
