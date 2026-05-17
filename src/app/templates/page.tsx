"use client";

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

import {
  fetchPublicTemplateList,
  type PublicTemplateListItem,
} from "@/lib/api/publicTemplates";
import { useTemplateChangeStream } from "@/lib/realtime/templatesStream";
import { HeadEntryModal } from "@/components/templates/HeadEntryModal";
import { TopNav } from "@/components/ui/TopNav";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { displayLg, displayMd, bodyLg, bodySm, caption, micro } from "@/lib/ui/typography";

type CategoryFilter = "all" | "fyb" | "signout";

function deriveCategoryLabel(
  template: Pick<PublicTemplateListItem, "name" | "category">,
): string {
  const explicit = template.category?.trim();
  if (explicit) return explicit;
  const n = template.name.toLowerCase();
  if (/(sign\s*-?\s*out|signed\s*out)/.test(n)) return "Sign-out";
  return "FYB";
}

function getClassYear(): number {
  const now = new Date();
  return now.getMonth() >= 7 ? now.getFullYear() + 1 : now.getFullYear();
}

export default function UserTemplatesPage() {
  const { data: session } = useSession();
  const isHead = Boolean(session?.user?.isDepartmentHead);
  const [headEntry, setHeadEntry] = useState<{ id: string; name: string } | null>(null);

  const [initialLoad, setInitialLoad] = useState(true);
  const [templates, setTemplates] = useState<PublicTemplateListItem[]>([]);
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const classYear = getClassYear();

  const onCardActivate = useCallback(
    (e: MouseEvent, t: PublicTemplateListItem) => {
      if (!isHead) return;
      e.preventDefault();
      setHeadEntry({ id: t.id, name: t.name });
    },
    [isHead],
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
    }, [refreshSilently]),
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
    <div className="min-h-dvh" style={{ background: "var(--canvas)", color: "var(--ink)" }}>
      <TopNav cta={undefined} />

      <main className="mx-auto w-full max-w-[1280px] px-5 sm:px-8 pb-24">
        {/* Hero */}
        <section className="grid items-end gap-8 pt-12 pb-10 sm:pt-16 lg:grid-cols-12">
          <div className="lg:col-span-8 flex flex-col gap-4">
            <Eyebrow>The library · {filtered.length || templates.length || "-"} templates</Eyebrow>
            <h1 style={{ ...displayLg, fontSize: "clamp(40px, 6vw, 78px)" }}>Pick your moment.</h1>
            <p style={{ ...bodyLg, color: "var(--ink-muted)", maxWidth: 560 }}>
              Sign-out tees, face caps, FYB-week banners, &ldquo;Face of the Finalist&rdquo;
              posters - every template ready to personalize. Open one. Drop your details in.
              Export. Go.
            </p>
          </div>
          <div className="hidden lg:col-span-4 lg:block">
            <div className="flex flex-col items-end">
              <span style={{ ...caption, color: "var(--ink-faint)", textTransform: "uppercase", letterSpacing: "0.18em", fontSize: 11 }}>
                Class of
              </span>
              <span style={{ ...displayLg, fontSize: 96, lineHeight: 1, color: "var(--ink)" }}>
                {classYear}
              </span>
            </div>
          </div>
        </section>

        {/* Filter bar */}
        <div
          className="sticky top-14 z-20 -mx-5 mb-8 px-5 py-4 backdrop-blur-md sm:-mx-8 sm:px-8"
          style={{
            background: "rgba(9, 9, 9, 0.85)",
            borderTop: "1px solid var(--hairline-soft)",
            borderBottom: "1px solid var(--hairline-soft)",
          }}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CategoryTabs value={category} onChange={setCategory} />
            <div className="relative w-full sm:w-96">
              <span className="pointer-events-none absolute inset-y-0 left-3.5 grid place-items-center" style={{ color: "var(--ink-faint)" }}>
                <SearchIcon />
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search templates"
                inputMode="search"
                style={{
                  ...bodySm,
                  width: "100%",
                  height: 40,
                  padding: "0 36px 0 36px",
                  background: "var(--surface-1)",
                  border: "1px solid var(--hairline)",
                  borderRadius: 999,
                  color: "var(--ink)",
                  outline: "none",
                }}
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="absolute inset-y-0 right-2.5 my-auto grid h-7 w-7 place-items-center rounded-full"
                  style={{ color: "var(--ink-faint)" }}
                >
                  ✕
                </button>
              ) : null}
            </div>
          </div>
        </div>

        {/* GRID */}
        <section>
          {initialLoad ? (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonTile key={i} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              query={debouncedSearch}
              onClear={() => {
                setSearch("");
                setCategory("all");
              }}
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {filtered.map((t) => (
                <TemplateCard key={t.id} t={t} onClick={onCardActivate} />
              ))}
            </div>
          )}
        </section>
      </main>

      <footer
        className="border-t"
        style={{ borderColor: "var(--hairline)" }}
      >
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-4 px-5 py-7 sm:px-8" style={{ ...micro, color: "var(--ink-faint)" }}>
          <span>FYB Studio · Library · {classYear}</span>
          <Link href="/" style={{ color: "var(--ink-muted)" }}>← Home</Link>
        </div>
      </footer>

      <HeadEntryModal
        open={headEntry !== null}
        templateId={headEntry?.id ?? ""}
        templateName={headEntry?.name ?? ""}
        onClose={() => setHeadEntry(null)}
      />
    </div>
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
    <div
      className="inline-flex items-center gap-1 p-1"
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--hairline)",
        borderRadius: 999,
      }}
    >
      {items.map((it) => {
        const active = it.key === value;
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onChange(it.key)}
            className="transition"
            style={{
              ...caption,
              padding: "7px 14px",
              borderRadius: 999,
              background: active ? "var(--ink)" : "transparent",
              color: active ? "#000" : "var(--ink-muted)",
              whiteSpace: "nowrap",
            }}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

function TemplateCard({
  t,
  onClick,
}: {
  t: PublicTemplateListItem;
  onClick: (e: MouseEvent, t: PublicTemplateListItem) => void;
}) {
  return (
    <Link
      href={`/templates/${t.id}/use`}
      onClick={(e) => onClick(e, t)}
      className="group relative block overflow-hidden transition"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--hairline)",
        borderRadius: 15,
        padding: 12,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent-blue)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--hairline)")}
      aria-label={`Use template ${t.name}`}
    >
      <div
        className="relative aspect-[4/5] w-full overflow-hidden"
        style={{
          background: "var(--surface-2)",
          borderRadius: 10,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={t.coverUrl}
          alt={`${t.name} preview`}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-contain p-2 transition-transform duration-500 ease-out group-hover:scale-[1.03]"
        />
        <div className="absolute right-2 top-2">
          <Badge tone="muted" size="sm">
            {deriveCategoryLabel(t)}
          </Badge>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 px-1">
        <div className="min-w-0 flex-1">
          <div
            className="truncate"
            title={t.name}
            style={{ ...bodySm, color: "var(--ink)", fontWeight: 600 }}
          >
            {t.name}
          </div>
          <div className="mt-0.5 truncate" style={{ ...micro, color: "var(--ink-faint)" }}>
            Tap to open
          </div>
        </div>
        <span
          aria-hidden
          style={{ color: "var(--ink-muted)", transition: "transform 200ms ease" }}
          className="group-hover:translate-x-0.5"
        >
          ↗
        </span>
      </div>
    </Link>
  );
}

function SkeletonTile() {
  return (
    <div
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--hairline)",
        borderRadius: 15,
        padding: 12,
      }}
    >
      <Skeleton width="100%" height={undefined as unknown as number} radius={10} style={{ aspectRatio: "4/5" }} />
      <div className="mt-3 space-y-2 px-1">
        <Skeleton height={12} width="75%" radius={4} />
        <Skeleton height={9} width="40%" radius={4} />
      </div>
    </div>
  );
}

function EmptyState({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div
      className="p-10 text-center"
      style={{
        background: "var(--surface-1)",
        border: "1px dashed var(--hairline)",
        borderRadius: 20,
      }}
    >
      <Eyebrow>No results found</Eyebrow>
      <h3 className="mt-3" style={{ ...displayMd, fontSize: 32 }}>
        Nothing for {query ? `"${query}"` : "this filter"}.
      </h3>
      <div className="mt-6 flex justify-center">
        <Button variant="secondary" onClick={onClear}>
          Clear filters
        </Button>
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}
