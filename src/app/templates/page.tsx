"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

import {
  fetchPublicTemplateList,
  type PublicTemplateListItem,
} from "@/lib/api/publicTemplates";
import { useTemplateChangeStream } from "@/lib/realtime/templatesStream";
import { HeaderAuthSlot } from "@/components/auth/HeaderAuthSlot";
import { HeadEntryModal } from "@/components/templates/HeadEntryModal";

const display: CSSProperties = {
  fontFamily: "var(--font-bricolage)",
  fontVariationSettings: "'wdth' 75, 'wght' 800",
  letterSpacing: "-0.04em",
};
const displayWide: CSSProperties = {
  fontFamily: "var(--font-bricolage)",
  fontVariationSettings: "'wdth' 100, 'wght' 700",
  letterSpacing: "-0.02em",
};
const serif: CSSProperties = {
  fontFamily: "var(--font-fraunces)",
  fontVariationSettings: "'SOFT' 100, 'opsz' 144",
  fontWeight: 700,
  letterSpacing: "-0.02em",
};
const serifBody: CSSProperties = {
  fontFamily: "var(--font-fraunces)",
  fontVariationSettings: "'SOFT' 100, 'opsz' 14",
};
const script: CSSProperties = { fontFamily: "var(--font-ms-madi)" };
const mono: CSSProperties = { fontFamily: "var(--font-geist-mono)" };

type CategoryFilter = "all" | "fyb" | "signout";

function deriveCategoryLabel(
  template: Pick<PublicTemplateListItem, "name" | "category">
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

  /* Reveal stagger */
  useEffect(() => {
    if (typeof window === "undefined" || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-revealed");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
    );
    document
      .querySelectorAll<HTMLElement>(".reveal, .fyb-curtain")
      .forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [templates.length, debouncedSearch, category]);

  /* Comet cursor — same as landing */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    function makeDot(kind: "main" | "t1" | "t2") {
      const d = document.createElement("div");
      d.className = `fyb-cursor ${kind}`;
      return d;
    }
    const main = makeDot("main");
    const t1 = makeDot("t1");
    const t2 = makeDot("t2");
    document.body.append(main, t1, t2);

    const target = { x: -200, y: -200 };
    const c0 = { x: -200, y: -200 };
    const c1 = { x: -200, y: -200 };
    const c2 = { x: -200, y: -200 };
    let raf = 0;

    function onMove(e: PointerEvent) {
      target.x = e.clientX;
      target.y = e.clientY;
      const isHot = (e.target as HTMLElement | null)?.closest("a, button");
      [main, t1, t2].forEach((d) => d.classList.toggle("is-hot", Boolean(isHot)));
      if (!raf) raf = requestAnimationFrame(tick);
    }
    function tick() {
      c0.x += (target.x - c0.x) * 0.34;
      c0.y += (target.y - c0.y) * 0.34;
      c1.x += (c0.x - c1.x) * 0.18;
      c1.y += (c0.y - c1.y) * 0.18;
      c2.x += (c1.x - c2.x) * 0.12;
      c2.y += (c1.y - c2.y) * 0.12;
      main.style.transform = `translate(${c0.x}px, ${c0.y}px)`;
      t1.style.transform = `translate(${c1.x}px, ${c1.y}px)`;
      t2.style.transform = `translate(${c2.x}px, ${c2.y}px)`;
      const dx = Math.abs(target.x - c2.x);
      const dy = Math.abs(target.y - c2.y);
      if (dx > 0.5 || dy > 0.5) raf = requestAnimationFrame(tick);
      else raf = 0;
    }
    document.addEventListener("pointermove", onMove);
    return () => {
      document.removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
      main.remove();
      t1.remove();
      t2.remove();
    };
  }, []);

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
    <div className="fyb-cinema relative min-h-dvh" style={serifBody}>
      {/* Ambient glow */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div
          className="fyb-blob a"
          style={{
            background: "radial-gradient(circle, var(--accent) 0%, transparent 65%)",
            width: 700,
            height: 700,
            top: -240,
            right: -240,
            opacity: 0.4,
          }}
        />
        <div
          className="fyb-blob b"
          style={{
            background: "radial-gradient(circle, var(--gold) 0%, transparent 70%)",
            width: 600,
            height: 600,
            bottom: -240,
            left: -200,
            opacity: 0.25,
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.5] mix-blend-overlay"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(239,233,220,0.06) 1px, transparent 0)",
            backgroundSize: "4px 4px",
          }}
        />
      </div>

      {/* MASTHEAD */}
      <header className="relative z-20">
        <div className="mx-auto flex max-w-[92rem] items-center justify-between gap-4 px-5 py-5 sm:px-10 sm:py-7">
          <Link href="/" className="flex items-center gap-3 leading-none">
            <span className="text-[24px] sm:text-[28px]" style={display}>
              FYB
            </span>
            <span
              className="hidden text-[10px] uppercase tracking-[0.36em] text-[var(--paper-faint)] sm:inline"
              style={mono}
            >
              Studio · Library
            </span>
          </Link>
          <nav className="flex items-center gap-6">
            <Link
              href="/"
              className="hidden text-[11px] uppercase tracking-[0.32em] text-[var(--paper)]/80 underline-offset-[6px] hover:text-[var(--paper)] hover:underline sm:inline"
            >
              Home
            </Link>
            <HeaderAuthSlot />
          </nav>
        </div>
      </header>

      {/* TITLE */}
      <section className="relative z-10">
        <div className="mx-auto max-w-[92rem] px-5 sm:px-10">
          <div className="grid gap-10 pb-12 pt-8 lg:grid-cols-12 lg:gap-x-12 lg:pb-20 lg:pt-16">
            <div className="lg:col-span-8">
              <div
                className="fyb-rise text-[10px] uppercase tracking-[0.36em] text-[var(--accent)]"
                style={mono}
              >
                The library · {filtered.length || templates.length || "—"} templates
              </div>
              <h1
                className="fyb-rise mt-4 text-balance text-[44px] leading-[1] sm:text-[80px]"
                style={{ ...serif, animationDelay: "100ms" }}
              >
                Pick your{" "}
                <em
                  className="not-italic text-[var(--accent)]"
                  style={{ ...script, fontStyle: "normal", fontWeight: 400 }}
                >
                  moment.
                </em>
              </h1>
              <p
                className="fyb-rise mt-5 max-w-xl text-[15px] leading-[1.7] text-[var(--paper-soft)]"
                style={{ ...serifBody, animationDelay: "200ms" }}
              >
                Sign-out tees, face caps, FYB-week banners, &ldquo;Face of the
                Finalist&rdquo; posters — every template ready to personalize.
                Open one. Drop your details in. Export. Go.
              </p>
            </div>
            <div className="hidden lg:col-span-4 lg:block">
              <div className="fyb-rise relative" style={{ animationDelay: "260ms" }}>
                <div
                  className="text-[10px] uppercase tracking-[0.36em] text-[var(--paper-faint)]"
                  style={mono}
                >
                  Sign-out edition
                </div>
                <div
                  className="mt-2 text-[120px] leading-[0.85] text-[var(--paper)]"
                  style={display}
                >
                  {classYear}
                </div>
                <div className="text-[36px] text-[var(--gold)]" style={script}>
                  Class of yours
                </div>
              </div>
            </div>
          </div>

          {/* Filter bar */}
          <div className="reveal sticky top-0 z-20 -mx-5 border-y border-[var(--rule)] bg-[var(--night)]/85 px-5 py-4 backdrop-blur-md sm:-mx-10 sm:px-10">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CategoryTabs value={category} onChange={setCategory} />
              <div className="relative w-full sm:w-96">
                <div className="pointer-events-none absolute inset-y-0 left-4 grid place-items-center text-[var(--paper-faint)]">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path
                      d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <path
                      d="M21 21l-4.3-4.3"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search templates"
                  className="h-11 w-full border border-[var(--rule)] bg-[var(--night-2)] pl-11 pr-3 text-sm text-[var(--paper)] placeholder:text-[var(--paper-faint)] outline-none transition focus-visible:border-[var(--accent)]"
                  inputMode="search"
                />
                {search ? (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="Clear search"
                    className="absolute inset-y-0 right-3 my-auto h-7 w-7 grid place-items-center rounded-full text-[var(--paper-faint)] hover:text-[var(--paper)]"
                  >
                    ✕
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* GRID
          Breakpoint ladder:
            mobile  (default) → 2 cols, tight gap so cards stay readable on
                                small phones
            sm   (>= 640px)   → 2 cols with a slightly larger gap
            md   (>= 768px)   → 3 cols (tablets / smaller laptops)
            xl   (>= 1280px)  → 4 cols (standard desktops)
            2xl  (>= 1536px)  → 5 cols (large monitors) */}
      <section className="relative z-10">
        <div className="mx-auto max-w-[92rem] px-3 pb-24 pt-8 sm:px-10 sm:pt-14">
          {initialLoad ? (
            <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonTile key={i} index={i} />
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
              {filtered.map((t, idx) => (
                <div
                  key={t.id}
                  className="reveal"
                  style={{ ["--reveal-delay" as never]: `${(idx % 8) * 50}ms` }}
                >
                  <CinemaCard t={t} index={idx} onClick={onCardActivate} />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <footer className="relative z-10 border-t border-[var(--rule)]">
        <div className="mx-auto flex max-w-[92rem] flex-wrap items-center justify-between gap-4 px-5 py-7 text-[10px] uppercase tracking-[0.36em] text-[var(--paper-faint)] sm:px-10">
          <span style={mono}>FYB Studio · Library · {classYear}</span>
          <Link
            href="/"
            className="hover:text-[var(--paper)]"
            style={mono}
          >
            ← Home
          </Link>
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

/* ────────────────────────────────────────────────────────────
   Pieces
   ─────────────────────────────────────────────────────────── */

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
    <div className="inline-flex items-center gap-1 border border-[var(--rule)] bg-[var(--night-2)] p-1">
      {items.map((it) => {
        const active = it.key === value;
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onChange(it.key)}
            className={
              "h-9 px-4 text-[11px] font-semibold uppercase tracking-[0.26em] transition " +
              (active
                ? "bg-[var(--accent)] text-[var(--night)]"
                : "text-[var(--paper)]/70 hover:text-[var(--paper)]")
            }
            style={mono}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}

function CinemaCard({
  t,
  index,
  onClick,
}: {
  t: PublicTemplateListItem;
  index: number;
  onClick: (e: MouseEvent, t: PublicTemplateListItem) => void;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  return (
    <Link
      ref={ref}
      href={`/templates/${t.id}/use`}
      onClick={(e) => onClick(e, t)}
      onPointerMove={(e) => {
        // 3D tilt on pointer-capable devices only. Touch screens skip this
        // entirely so a tap doesn't leave the card stuck in a tilted state.
        const el = ref.current;
        if (!el) return;
        if (!window.matchMedia("(hover: hover)").matches) return;
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = `perspective(1000px) rotateX(${-y * 5}deg) rotateY(${x * 7}deg) translateY(-3px)`;
      }}
      onPointerLeave={() => {
        if (ref.current) ref.current.style.transform = "";
      }}
      className="group relative block overflow-hidden border border-[var(--rule)] bg-[var(--night-2)] shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_8px_30px_-12px_rgba(0,0,0,0.6)] transition-all duration-300 will-change-transform hover:border-[var(--accent)]/40 hover:shadow-[0_1px_0_rgba(255,255,255,0.06)_inset,0_18px_40px_-12px_rgba(0,0,0,0.7)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/60"
      aria-label={`Use template ${t.name}`}
    >
      {/* Cover area — fixed 4/5 portrait so every card lines up vertically
          regardless of how the source PNG was cropped. Inner padding scales
          with breakpoint so the design actually shows through on small
          phones (where p-3 was eating ~25% of the cover area). */}
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-linear-to-br from-[var(--night-2)] to-[var(--night-3)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={t.coverUrl}
          alt={`${t.name} preview`}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-contain p-1.5 transition-transform duration-700 ease-out group-hover:scale-[1.04] sm:p-3"
        />
        <div
          className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/[0.06]"
          aria-hidden
        />

        {/* Index chip — desktop-only. On mobile the card is too small to
            justify dedicating corner real-estate to a numeral; the category
            badge carries enough information by itself. */}
        <div
          className="absolute left-2 top-2 hidden bg-[var(--accent)] px-1.5 py-0.5 text-[9px] uppercase tracking-[0.32em] text-[var(--night)] sm:block"
          style={mono}
        >
          {String(index + 1).padStart(2, "0")}
        </div>
        <div
          className="absolute right-1.5 top-1.5 border border-[var(--paper)]/30 bg-[var(--night)]/80 px-1.5 py-0.5 text-[8.5px] uppercase tracking-[0.28em] text-[var(--paper)] backdrop-blur sm:right-2.5 sm:top-2.5 sm:px-2 sm:text-[9px] sm:tracking-[0.32em]"
          style={mono}
        >
          {deriveCategoryLabel(t)}
        </div>

        {/* Hover overlay — desktop reveal. On touch devices the card is the
            tap target; the always-visible footer carries the CTA copy. */}
        <div className="pointer-events-none absolute inset-0 hidden items-end bg-linear-to-t from-[var(--night)]/95 via-[var(--night)]/45 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100 sm:flex">
          <div className="w-full p-4">
            <div
              className="text-[10px] uppercase tracking-[0.36em] text-[var(--accent)]"
              style={mono}
            >
              Use template
            </div>
            <div className="mt-1 inline-flex items-center gap-2 text-[14px] font-semibold text-[var(--paper)]">
              <span style={{ ...displayWide, fontWeight: 700 }}>Open</span>
              <span aria-hidden>↗</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer — name + status line. Tighter on mobile, taller on desktop. */}
      <div className="border-t border-[var(--rule)] p-2.5 sm:p-4">
        <div
          className="truncate text-[12.5px] leading-[1.15] sm:text-[15px] sm:leading-[1.1]"
          style={{ ...displayWide, fontWeight: 700 }}
          title={t.name}
        >
          {t.name}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span
            className="truncate text-[8.5px] uppercase tracking-[0.28em] text-[var(--paper-faint)] sm:text-[10px] sm:tracking-[0.32em]"
            style={mono}
          >
            Tap to open
          </span>
          <span
            className="hidden text-[10px] uppercase tracking-[0.32em] text-[var(--accent)]/80 sm:inline-block"
            style={mono}
          >
            ↗
          </span>
        </div>
      </div>
    </Link>
  );
}

function SkeletonTile({ index: _index }: { index: number }) {
  // Aspect + footer height match the real card so cards don't jump when the
  // skeleton swaps out for content.
  return (
    <div className="overflow-hidden border border-[var(--rule)] bg-[var(--night-2)] shadow-[0_8px_30px_-12px_rgba(0,0,0,0.6)]">
      <div
        className="fyb-skeleton-shine relative w-full overflow-hidden"
        style={{ aspectRatio: 4 / 5 }}
      />
      <div className="border-t border-[var(--rule)] p-2.5 sm:p-4">
        <div className="fyb-skeleton h-3 w-3/4 rounded-full sm:h-3.5" />
        <div className="fyb-skeleton mt-1.5 h-2 w-1/2 rounded-full sm:mt-2 sm:h-2.5" />
      </div>
    </div>
  );
}

function EmptyState({
  query,
  onClear,
}: {
  query: string;
  onClear: () => void;
}) {
  return (
    <div className="border border-[var(--rule)] bg-[var(--night-2)] p-10 text-center">
      <div
        className="text-[10px] uppercase tracking-[0.36em] text-[var(--accent)]"
        style={mono}
      >
        No reels found
      </div>
      <h3
        className="mt-3 text-balance text-[36px] leading-[1] sm:text-[48px]"
        style={serif}
      >
        Nothing for{" "}
        <em
          className="not-italic text-[var(--accent)]"
          style={{ ...script, fontStyle: "normal" }}
        >
          {query ? `"${query}"` : "this filter"}.
        </em>
      </h3>
      <button
        type="button"
        onClick={onClear}
        className="mt-6 inline-flex items-center gap-2 border border-[var(--paper)]/30 px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.26em] text-[var(--paper)] hover:border-[var(--paper)]"
        style={mono}
      >
        Clear filters
      </button>
    </div>
  );
}
