"use client";

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

import {
  fetchPublicTemplateList,
  type PublicTemplateListItem,
} from "@/lib/api/publicTemplates";
import { useTemplateChangeStream } from "@/lib/realtime/templatesStream";
import { HeaderAuthSlot } from "@/components/auth/HeaderAuthSlot";
import { HeadEntryModal } from "@/components/templates/HeadEntryModal";

type CategoryFilter = "all" | "fyb" | "signout";

function deriveCategoryLabel(template: Pick<PublicTemplateListItem, "name" | "category">): string {
  const explicit = template.category?.trim();
  if (explicit) return explicit;

  const n = template.name.toLowerCase();
  if (/(sign\s*-?\s*out|signed\s*out)/.test(n)) return "Sign-out";
  return "FYB";
}

export default function UserTemplatesPage() {
  const { data: session } = useSession();
  const isHead = Boolean(session?.user?.isDepartmentHead);
  const [headEntry, setHeadEntry] = useState<
    | { id: string; name: string }
    | null
  >(null);

  const [initialLoad, setInitialLoad] = useState(true);
  const [templates, setTemplates] = useState<PublicTemplateListItem[]>([]);
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const onCardActivate = useCallback(
    (e: MouseEvent, t: PublicTemplateListItem) => {
      if (!isHead) return;
      e.preventDefault();
      setHeadEntry({ id: t.id, name: t.name });
    },
    [isHead]
  );

  const refreshSilently = useCallback(async () => {
    try {
      const list = await fetchPublicTemplateList();
      setTemplates(list);
    } catch (err) {
      console.warn("[templates] refresh failed", err);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchPublicTemplateList();
        if (cancelled) return;
        setTemplates(list);
      } catch (err) {
        console.warn("[templates] initial load failed", err);
      } finally {
        if (!cancelled) setInitialLoad(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useTemplateChangeStream(
    useCallback(() => {
      void refreshSilently();
    }, [refreshSilently])
  );

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const filtered = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    return templates.filter((t) => {
      const cat = deriveCategoryLabel(t);
      const matchCategory =
        category === "all" ? true : category === "fyb" ? cat === "FYB" : cat === "Sign-out";

      if (!matchCategory) return false;
      if (!q) return true;

      return t.name.toLowerCase().includes(q) || cat.toLowerCase().includes(q);
    });
  }, [templates, category, debouncedSearch]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <main className="mx-auto w-full max-w-7xl px-4 py-10">
        <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xl">
            <div className="text-xs font-semibold tracking-wide text-zinc-900 dark:text-zinc-100">
              Gallery
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-100">
              FYB templates you can personalize fast.
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-900 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              Home
            </Link>
            <HeaderAuthSlot />
          </div>
        </header>

        <div className="sticky top-0 z-20 -mx-4 mt-6 border-b border-zinc-200/70 bg-zinc-50/85 px-4 py-3 backdrop-blur dark:border-zinc-800/70 dark:bg-zinc-950/70">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CategoryTabs value={category} onChange={setCategory} />

            <div className="relative w-full sm:w-80">
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
                className="h-11 w-full rounded-2xl border border-zinc-200 bg-white pl-10 pr-3 text-sm text-zinc-900 shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                inputMode="search"
              />
            </div>
          </div>
        </div>

        {initialLoad ? (
          <>
            <div className="mt-6 columns-2 gap-x-4 lg:hidden">
              {Array.from({ length: 14 }).map((_, i) => (
                <UserTemplateCardSkeleton key={i} index={i} />
              ))}
            </div>
            <div className="mt-6 hidden grid-cols-2 gap-4 lg:grid lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 14 }).map((_, i) => (
                <UserTemplateCardSkeleton key={i} index={i} />
              ))}
            </div>
          </>
        ) : filtered.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
            No templates match your filters.
          </div>
        ) : (
          <>
            <div className="mt-6 columns-2 gap-x-4 lg:hidden">
              {filtered.map((t) => (
                <UserTemplateCard key={t.id} template={t} onActivate={onCardActivate} />
              ))}
            </div>
            <div className="mt-6 hidden grid-cols-2 gap-4 lg:grid lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((t) => (
                <UserTemplateCard key={t.id} template={t} onActivate={onCardActivate} />
              ))}
            </div>
          </>
        )}
      </main>

      <HeadEntryModal
        open={headEntry !== null}
        templateId={headEntry?.id ?? ""}
        templateName={headEntry?.name ?? ""}
        onClose={() => setHeadEntry(null)}
      />
    </div>
  );
}

function UserTemplateCardSkeleton({ index }: { index: number }) {
  const ratios = [4 / 5, 3 / 4, 2 / 3, 1, 5 / 7, 9 / 16, 4 / 6];
  const ratio = ratios[index % ratios.length] ?? 4 / 5;

  return (
    <div className="group mb-4 inline-block w-full align-top break-inside-avoid overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm lg:mb-0 lg:block dark:border-zinc-800 dark:bg-zinc-900">
      <div className="w-full bg-zinc-100 dark:bg-zinc-800/60">
        <div className="relative w-full overflow-hidden">
          <div className="w-full" style={{ aspectRatio: ratio }} />
          <div className="fyb-skeleton-shine absolute inset-0" />
        </div>
      </div>
      <div className="p-3 sm:p-4">
        <div className="h-4 w-3/4 rounded-full bg-zinc-200/80 dark:bg-zinc-700/70" />
        <div className="mt-2 h-3 w-1/2 rounded-full bg-zinc-200/60 dark:bg-zinc-700/50" />
      </div>
    </div>
  );
}

function UserTemplateCard({
  template,
  onActivate,
}: {
  template: PublicTemplateListItem;
  onActivate?: (e: MouseEvent, t: PublicTemplateListItem) => void;
}) {
  const categoryLabel = deriveCategoryLabel(template);
  const href = `/templates/${template.id}/use`;
  const ratio =
    typeof template.coverWidth === "number" &&
    typeof template.coverHeight === "number" &&
    template.coverWidth > 0 &&
    template.coverHeight > 0
      ? template.coverWidth / template.coverHeight
      : 4 / 5;

  return (
    <Link
      href={href}
      onClick={onActivate ? (e) => onActivate(e, template) : undefined}
      className="group mb-4 inline-block w-full align-top break-inside-avoid overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition-all will-change-transform hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 lg:mb-0 lg:block dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
      aria-label={`Use template ${template.name}`}
    >
      <div className="w-full bg-zinc-100 dark:bg-zinc-800/60">
        <div className="relative w-full overflow-hidden">
          <div className="w-full" style={{ aspectRatio: ratio }} />

          <div className="absolute inset-0 bg-linear-to-br from-white/0 via-white/0 to-zinc-950/5 dark:to-white/5" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.06)_1px,transparent_0)] bg-size-[14px_14px] opacity-35 dark:opacity-25" />

          <div className="pointer-events-none absolute left-2.5 top-2.5 z-10 sm:left-3 sm:top-3">
            <span className="inline-flex items-center rounded-full border border-white/40 bg-white/70 px-2.5 py-1 text-[11px] font-medium text-zinc-800 shadow-sm backdrop-blur-sm dark:border-zinc-700/60 dark:bg-zinc-900/60 dark:text-zinc-100">
              {categoryLabel}
            </span>
          </div>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={template.coverUrl}
            alt={`${template.name} preview`}
            className="absolute inset-0 h-full w-full object-contain p-1.5 transition-transform duration-500 will-change-transform group-hover:scale-[1.02] sm:p-3"
          />

          <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100 bg-linear-to-t from-zinc-950/25 via-zinc-950/10 to-transparent dark:from-zinc-950/45 dark:via-zinc-950/25" />
        </div>
      </div>

      <div className="p-3 sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold tracking-tight text-zinc-950 dark:text-zinc-100">
              {template.name}
            </div>
            <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {categoryLabel} • Ready to personalize
            </div>
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 p-2.5">
        <div className="pointer-events-auto w-full translate-y-0 opacity-100 transition-all duration-200 sm:translate-y-2 sm:opacity-0 sm:group-hover:translate-y-0 sm:group-hover:opacity-100">
          <div className="flex items-center justify-between gap-2.5 rounded-2xl border border-white/30 bg-white/75 p-2.5 shadow-sm backdrop-blur-md dark:border-zinc-700/60 dark:bg-zinc-900/70">
            <div className="text-[11px] font-medium text-zinc-900 dark:text-zinc-100">
              Use Template
            </div>
            <div className="inline-flex h-8 items-center justify-center rounded-xl bg-zinc-900 px-2.5 text-[11px] font-medium text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900">
              Open
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

function CategoryTabs({
  value,
  onChange,
}: {
  value: CategoryFilter;
  onChange: (v: CategoryFilter) => void;
}) {
  const items: Array<{ key: CategoryFilter; label: string }> = [
    { key: "all", label: "All" },
    { key: "fyb", label: "FYB" },
    { key: "signout", label: "Sign-out" },
  ];

  return (
    <div className="w-full sm:w-auto">
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
    </div>
  );
}
