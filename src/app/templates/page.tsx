"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { GraduationCap, Search, X, ArrowRight, Sparkles, Share2 } from "lucide-react";

import {
  fetchPublicTemplateList,
  type PublicTemplateListItem,
} from "@/lib/api/publicTemplates";
import { useTemplateChangeStream } from "@/lib/realtime/templatesStream";
import { HeadEntryModal } from "@/components/templates/HeadEntryModal";
import { TopNav } from "@/components/ui/TopNav";
import { CurtainOpen } from "@/components/ui/CurtainOpen";
import { useToast } from "@/components/ui/Toast";

const jkt: CSSProperties = { fontFamily: "var(--font-plus-jakarta, var(--font-geist-sans)), sans-serif" };
const mono: CSSProperties = { fontFamily: "var(--font-geist-mono), monospace" };
const sans: CSSProperties = { fontFamily: "var(--font-geist-sans), sans-serif" };

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
    <div
      className="relative min-h-dvh overflow-x-clip"
      style={{ background: "#050505", color: "#fff", ...jkt }}
    >
      <CurtainOpen brand="THE STUDIO" />
      {/* Fixed fractal noise overlay (matches landing) */}
      <div
        aria-hidden
        style={{
          position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat", backgroundSize: "200px 200px",
          opacity: 0.03, mixBlendMode: "overlay",
        }}
      />

      <TopNav cta={undefined} links={[]} />

      {/* ─── CEREMONY HERO ──────────────────────────────────── */}
      <section
        className="relative overflow-hidden"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% 5%, rgba(255,180,0,0.07), transparent 60%), radial-gradient(ellipse 70% 60% at 50% 100%, rgba(168,85,247,0.05), transparent 65%)",
          borderBottom: "1px solid rgba(255,215,0,0.1)",
        }}
      >
        {/* Spotlight beams */}
        <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0 }}>
          {[
            { l: "10%", w: "30%", c: "rgba(255,215,0,0.07)", d: 6, dl: 0 },
            { l: "40%", w: "24%", c: "rgba(255,140,66,0.05)", d: 7, dl: 1.6 },
            { l: "65%", w: "28%", c: "rgba(168,85,247,0.05)", d: 8, dl: 3 },
          ].map((b, i) => (
            <div
              key={i}
              className="nv-spotlight"
              style={{
                position: "absolute", top: "-20%", left: b.l, width: b.w, height: "140%",
                background: `linear-gradient(180deg, transparent, ${b.c} 30%, ${b.c} 70%, transparent)`,
                transformOrigin: "top center",
                ["--beam-dur" as string]: `${b.d}s`,
                ["--beam-delay" as string]: `${b.dl}s`,
              }}
            />
          ))}
        </div>

        {/* Floating caps (ambient) */}
        <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
          {[
            { l: "6%",  t: "22%", s: 28, op: 0.18, d: 0,   sp: 16 },
            { l: "90%", t: "30%", s: 24, op: 0.16, d: 1.4, sp: 19 },
            { l: "14%", t: "76%", s: 32, op: 0.14, d: 2.8, sp: 22 },
            { l: "85%", t: "78%", s: 26, op: 0.14, d: 0.7, sp: 18 },
          ].map((c, i) => (
            <div
              key={i}
              className="nv-float-slow"
              style={{ position: "absolute", left: c.l, top: c.t, color: "#FFD700", opacity: c.op, animationDelay: `${c.d}s` }}
            >
              <div className="nv-spin-slow" style={{ animationDuration: `${c.sp}s` }}>
                <GraduationCap size={c.s} strokeWidth={1.5} />
              </div>
            </div>
          ))}
        </div>

        {/* Dot grid */}
        <div
          aria-hidden
          style={{
            position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0,
            backgroundImage: "radial-gradient(rgba(255,215,0,0.06) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
            maskImage: "radial-gradient(ellipse 75% 65% at 50% 50%, rgba(0,0,0,0.85) 0%, transparent 80%)",
            WebkitMaskImage: "radial-gradient(ellipse 75% 65% at 50% 50%, rgba(0,0,0,0.85) 0%, transparent 80%)",
          }}
        />

        <div
          className="relative mx-auto w-full text-center"
          style={{
            maxWidth: 1200, zIndex: 2,
            paddingLeft: "clamp(16px,5vw,72px)", paddingRight: "clamp(16px,5vw,72px)",
            paddingTop: "clamp(36px,7vw,120px)", paddingBottom: "clamp(36px,6vw,100px)",
          }}
        >
          {/* Gold eyebrow — count shown on sm+, label only on xs */}
          <div
            style={{
              display: "inline-flex", alignItems: "center", gap: 10,
              border: "1px solid rgba(255,215,0,0.28)", borderRadius: 100,
              padding: "7px 16px 7px 10px",
              background: "rgba(255,215,0,0.06)",
              boxShadow: "0 0 30px rgba(255,215,0,0.08)",
              marginBottom: "clamp(18px,3vw,36px)",
              maxWidth: "100%",
            }}
          >
            <span style={{ position: "relative", width: 7, height: 7, display: "inline-flex", flexShrink: 0 }}>
              <span className="nv-pulse-ring" style={{ position: "absolute", inset: 0, border: "1.5px solid rgba(255,215,0,0.55)", borderRadius: "50%" }} />
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#FFD700" }} />
            </span>
            <span
              className="truncate"
              style={{ ...mono, fontSize: "clamp(9px, 2vw, 10px)", letterSpacing: "0.22em", color: "rgba(255,215,0,0.85)", textTransform: "uppercase", fontWeight: 700 }}
            >
              <span className="hidden sm:inline">The Library · </span>
              {(filtered.length || templates.length) || "-"} designs ready
            </span>
          </div>

          {/* Title */}
          <h1
            style={{
              ...jkt, fontWeight: 900,
              fontSize: "clamp(40px, 11vw, 140px)",
              lineHeight: 0.88, letterSpacing: "-0.04em",
              textTransform: "uppercase",
              margin: 0,
            }}
          >
            Pick your<br />
            <span className="nv-shimmer-text" style={{ display: "inline-block", whiteSpace: "nowrap" }}>
              moment.
            </span>
          </h1>

          {/* Tagline — shorter on mobile */}
          <p
            className="hidden sm:block"
            style={{
              ...sans,
              fontSize: "clamp(14px, 1.4vw, 18px)",
              lineHeight: 1.6,
              color: "rgba(255,255,255,0.55)",
              marginTop: "clamp(24px,3vw,36px)",
              marginLeft: "auto", marginRight: "auto",
              maxWidth: "52ch",
            }}
          >
            Sign-out flyers and FYB-week flyers - every design ready to personalize. Open one. Drop your details in. Export.
            {" "}<span style={{ color: "#FFD700", fontWeight: 600 }}>Done in five minutes.</span>
          </p>
          <p
            className="sm:hidden"
            style={{
              ...sans,
              fontSize: 14,
              lineHeight: 1.55,
              color: "rgba(255,255,255,0.55)",
              marginTop: 18,
              marginLeft: "auto", marginRight: "auto",
              maxWidth: "32ch",
            }}
          >
            Open one. Fill your details. Export in
            {" "}<span style={{ color: "#FFD700", fontWeight: 600 }}>5 minutes flat.</span>
          </p>

          {/* Class of YYYY ticker */}
          <div
            style={{
              marginTop: "clamp(16px,3vw,32px)",
              display: "inline-flex", alignItems: "center", gap: "clamp(8px,2vw,14px)",
              ...mono, fontSize: "clamp(9px, 2vw, 10px)", letterSpacing: "0.22em",
              color: "rgba(255,255,255,0.4)", textTransform: "uppercase",
            }}
          >
            <span style={{ height: 1, width: "clamp(20px,4vw,32px)", background: "linear-gradient(to right, transparent, rgba(255,215,0,0.5))" }} />
            <span>Class of <span style={{ color: "#FFD700" }}>{classYear}</span></span>
            <span style={{ height: 1, width: "clamp(20px,4vw,32px)", background: "linear-gradient(to left, transparent, rgba(255,215,0,0.5))" }} />
          </div>
        </div>
      </section>

      {/* ─── FILTER BAR ───────────────────────────────────────── */}
      <div
        className="sticky top-16 z-20 backdrop-blur-md"
        style={{
          background: "rgba(9,9,9,0.85)",
          borderBottom: "1px solid rgba(255,215,0,0.12)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.3)",
        }}
      >
        <div
          className="mx-auto flex items-center gap-2 px-3 py-2.5 sm:justify-between sm:gap-3 sm:px-8 sm:py-3"
          style={{ maxWidth: 1400 }}
        >
          <CategoryTabs value={category} onChange={setCategory} />
          <div className="relative flex-1 sm:w-96 sm:flex-initial">
            <span
              className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center sm:left-3.5"
              style={{ color: "rgba(255,215,0,0.4)" }}
            >
              <Search size={14} />
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              inputMode="search"
              aria-label="Search templates"
              style={{
                ...sans,
                width: "100%",
                height: 38,
                padding: "0 34px 0 32px",
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,215,0,0.18)",
                borderRadius: 100,
                color: "#fff",
                fontSize: 13,
                outline: "none",
                transition: "border-color 200ms, background 200ms",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,215,0,0.5)";
                e.currentTarget.style.background = "rgba(255,255,255,0.07)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,215,0,0.18)";
                e.currentTarget.style.background = "rgba(255,255,255,0.04)";
              }}
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute inset-y-0 right-2 my-auto grid h-6 w-6 place-items-center rounded-full transition"
                style={{ color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.05)" }}
              >
                <X size={11} />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* ─── TEMPLATE GRID ────────────────────────────────────── */}
      <main className="mx-auto w-full px-3 pb-20 pt-6 sm:px-8 sm:pb-24 sm:pt-8" style={{ maxWidth: 1400 }}>
        {initialLoad ? (
          <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <SkeletonTile key={i} delay={i * 60} />
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
          <>
            <div className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {filtered.map((t, i) => (
                <TemplateCard key={t.id} t={t} onClick={onCardActivate} delay={i * 50} />
              ))}
            </div>
          </>
        )}
      </main>

      {/* ─── FOOTER ───────────────────────────────────────────── */}
      <footer
        style={{
          position: "relative",
          paddingTop: "clamp(40px,5vw,72px)",
          paddingBottom: "clamp(60px,7vw,96px)",
          borderTop: "1px solid rgba(255,215,0,0.1)",
          background: "radial-gradient(ellipse 70% 60% at 50% 0%, rgba(255,215,0,0.04), transparent 65%)",
        }}
      >
        {/* Rainbow gradient top bar */}
        <div
          aria-hidden
          style={{
            position: "absolute", top: 0, left: 0, right: 0, height: 2,
            background: "linear-gradient(90deg, #FFD700, #FF6B6B, #A855F7, #4ECDC4, #84CC16, #F97316, #FFD700)",
          }}
        />

        <div
          className="mx-auto flex flex-wrap items-center justify-between gap-4 px-4 sm:px-8"
          style={{ maxWidth: 1400 }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              aria-hidden
              style={{ width: 6, height: 6, borderRadius: "50%", background: "#FFD700", boxShadow: "0 0 8px rgba(255,215,0,0.6)" }}
            />
            <span style={{ ...mono, fontSize: 10, letterSpacing: "0.22em", color: "rgba(255,215,0,0.55)", textTransform: "uppercase", fontWeight: 700 }}>
              FYB Studio · The Library · {classYear}
            </span>
          </div>
          
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
  const items: Array<{ key: CategoryFilter; label: string; shortLabel: string; color: string }> = [
    { key: "all",     label: "All",      shortLabel: "All",  color: "#FFD700" },
    { key: "fyb",     label: "FYB",      shortLabel: "FYB",  color: "#FF6B6B" },
    { key: "signout", label: "Sign-out", shortLabel: "Sign", color: "#4ECDC4" },
  ];
  return (
    <div
      className="inline-flex shrink-0 items-center gap-1 p-0.5 sm:p-1"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,215,0,0.15)",
        borderRadius: 100,
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
              ...mono,
              fontSize: 9.5, letterSpacing: "0.1em",
              padding: "7px 10px",
              borderRadius: 100,
              background: active ? `linear-gradient(140deg, ${it.color}, ${it.color}cc)` : "transparent",
              color: active ? "#000" : "rgba(255,255,255,0.55)",
              whiteSpace: "nowrap",
              fontWeight: active ? 800 : 600,
              textTransform: "uppercase",
              boxShadow: active ? `0 4px 14px ${it.color}40` : "none",
              border: "none",
              cursor: "pointer",
              minWidth: 38,
            }}
          >
            <span className="sm:hidden">{it.shortLabel}</span>
            <span className="hidden sm:inline">{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function TemplateCard({
  t,
  onClick,
  delay,
}: {
  t: PublicTemplateListItem;
  onClick: (e: MouseEvent, t: PublicTemplateListItem) => void;
  delay: number;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  const [visible, setVisible] = useState(false);
  const toast = useToast();
  const cat = deriveCategoryLabel(t);
  const accent =
    cat === "Sign-out" ? "#4ECDC4" :
    cat === "FYB"      ? "#FF6B6B" :
    "#FFD700";

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.05 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  async function handleShare(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const url =
      typeof window === "undefined"
        ? `/templates/${t.id}/use?via=share`
        : (() => {
            const u = new URL(`/templates/${t.id}/use`, window.location.origin);
            u.searchParams.set("via", "share");
            return u.toString();
          })();
    const shareData: ShareData = {
      title: `${t.name} · FYB Studio`,
      text: `Open this FYB Studio design - "${t.name}". Add your details and export your version.`,
      url,
    };
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function" && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
        return;
      }
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        toast.show({ tone: "success", title: "Link copied", body: "Paste it anywhere to share.", duration: 2400 });
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      toast.show({ tone: "error", title: "Couldn't share", duration: 2400 });
    }
  }

  return (
    <Link
      ref={ref}
      href={`/templates/${t.id}/use`}
      onClick={(e) => onClick(e, t)}
      className="group relative block overflow-hidden transition p-2 sm:p-3"
      style={{
        background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))",
        border: `1px solid rgba(255,215,0,0.15)`,
        borderRadius: 12,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0) scale(1)" : "translateY(20px) scale(0.97)",
        transition: `opacity 600ms ${delay}ms cubic-bezier(0.16, 1, 0.3, 1), transform 600ms ${delay}ms cubic-bezier(0.16, 1, 0.3, 1), border-color 250ms, box-shadow 250ms`,
        boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = accent;
        e.currentTarget.style.boxShadow = `0 14px 40px rgba(0,0,0,0.5), 0 0 30px ${accent}30`;
        e.currentTarget.style.transform = "translateY(-4px) scale(1)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "rgba(255,215,0,0.15)";
        e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.3)";
        e.currentTarget.style.transform = "translateY(0) scale(1)";
      }}
      aria-label={`Use template ${t.name}`}
    >
      {/* Image cell */}
      <div
        className="relative aspect-[4/5] w-full overflow-hidden"
        style={{
          background: `linear-gradient(140deg, rgba(255,255,255,0.04), rgba(0,0,0,0.4))`,
          borderRadius: 8,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={t.coverUrl}
          alt={`${t.name} preview`}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-contain p-1 sm:p-2 transition-transform duration-700 ease-out group-hover:scale-[1.04]"
        />
        {/* Category pill */}
        <div className="absolute right-1.5 top-1.5 sm:right-2 sm:top-2">
          <span
            style={{
              ...mono, fontSize: 7, letterSpacing: "0.14em",
              color: accent,
              background: "rgba(0,0,0,0.65)",
              backdropFilter: "blur(8px)",
              border: `1px solid ${accent}40`,
              padding: "3px 7px",
              borderRadius: 100,
              textTransform: "uppercase",
              fontWeight: 700,
              display: "inline-flex", alignItems: "center", gap: 4,
            }}
          >
            <span style={{ width: 4, height: 4, borderRadius: "50%", background: accent }} />
            {cat}
          </span>
        </div>
        {/* "Reserved for your dept" badge — top-left, shown only when applicable */}
        {t.reservedByMyDept && (
          <div className="absolute left-1.5 top-1.5 sm:left-2 sm:top-2">
            <span
              style={{
                ...mono, fontSize: 7, letterSpacing: "0.14em",
                color: "#000",
                background: "linear-gradient(140deg, #FFD700, #FF8C42)",
                padding: "3px 7px",
                borderRadius: 100,
                textTransform: "uppercase",
                fontWeight: 800,
                display: "inline-flex", alignItems: "center", gap: 4,
                boxShadow: "0 4px 12px rgba(255,180,0,0.4)",
              }}
            >
              <span aria-hidden>✦</span>
              Yours
            </span>
          </div>
        )}
        {/* Bottom gradient overlay */}
        <div
          aria-hidden
          style={{
            position: "absolute", bottom: 0, left: 0, right: 0, height: 36,
            background: "linear-gradient(to top, rgba(0,0,0,0.4), transparent)",
            opacity: 0, transition: "opacity 250ms",
            pointerEvents: "none",
          }}
          className="group-hover:opacity-100"
        />
        {/* Quick-share button — always visible, anyone can share */}
        <button
          type="button"
          onClick={handleShare}
          aria-label={`Share ${t.name}`}
          title="Share this design"
          className="absolute bottom-1.5 right-1.5 inline-flex items-center justify-center rounded-full transition active:scale-90 sm:bottom-2 sm:right-2"
          style={{
            width: 28, height: 28,
            background: "rgba(0,0,0,0.65)",
            backdropFilter: "blur(8px)",
            border: `1px solid ${accent}40`,
            color: accent,
          }}
        >
          <Share2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Name + CTA */}
      <div className="mt-2 flex items-center justify-between gap-1.5 px-0.5 pb-0.5 sm:mt-3 sm:px-1 sm:pb-1">
        <div className="min-w-0 flex-1">
          <div
            className="truncate"
            title={t.name}
            style={{ ...jkt, fontSize: 12, fontWeight: 700, color: "#fff", letterSpacing: "-0.01em" }}
          >
            {t.name}
          </div>
          <div className="mt-0.5 truncate" style={{ ...mono, fontSize: 7.5, letterSpacing: "0.14em", color: "rgba(255,255,255,0.3)", textTransform: "uppercase" }}>
            Tap to open
          </div>
        </div>
        <span
          aria-hidden
          className="shrink-0 transition group-hover:translate-x-0.5"
          style={{ color: accent }}
        >
          <ArrowRight size={12} strokeWidth={2.5} />
        </span>
      </div>
    </Link>
  );
}

function SkeletonTile({ delay }: { delay: number }) {
  return (
    <div
      style={{
        background: "linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))",
        border: "1px solid rgba(255,215,0,0.1)",
        borderRadius: 14,
        padding: 12,
        opacity: 0.6,
        animation: `fyb-skeleton-base 1.8s ease-in-out ${delay}ms infinite`,
      }}
    >
      <div
        className="fyb-skeleton-shine"
        style={{
          aspectRatio: "4/5",
          width: "100%",
          background: "rgba(20,20,20,0.6)",
          borderRadius: 10,
        }}
      />
      <div className="mt-3 space-y-2 px-1">
        <div className="fyb-skeleton h-3 w-3/4 rounded-full" />
        <div className="fyb-skeleton h-2 w-2/5 rounded-full" />
      </div>
    </div>
  );
}

function EmptyState({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div
      className="mx-auto flex flex-col items-center gap-6 px-6 py-16 text-center"
      style={{
        background: "linear-gradient(180deg, rgba(255,215,0,0.03), rgba(255,255,255,0.01))",
        border: "1px dashed rgba(255,215,0,0.22)",
        borderRadius: 20,
        maxWidth: 560,
      }}
    >
      <div
        style={{
          width: 72, height: 72,
          borderRadius: "50%",
          background: "rgba(255,215,0,0.08)",
          border: "1px solid rgba(255,215,0,0.22)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#FFD700",
        }}
      >
        <Sparkles size={28} strokeWidth={1.5} />
      </div>
      <div>
        <div style={{ ...mono, fontSize: 9, letterSpacing: "0.3em", color: "rgba(255,215,0,0.6)", textTransform: "uppercase", marginBottom: 10 }}>
          Nothing found
        </div>
        <h3 style={{ ...jkt, fontWeight: 800, fontSize: "clamp(24px, 3vw, 36px)", color: "#fff", letterSpacing: "-0.02em", lineHeight: 1.15 }}>
          {query ? <>No matches for &ldquo;{query}&rdquo;</> : "No designs in this filter yet"}
        </h3>
        <p style={{ ...sans, fontSize: 14, color: "rgba(255,255,255,0.5)", marginTop: 10, maxWidth: "44ch" }}>
          Try a different search term or clear your filters to see the whole library.
        </p>
      </div>
      <button
        type="button"
        onClick={onClear}
        className="nv-laser-btn"
        style={{
          height: 48, padding: "0 28px", borderRadius: 8,
          fontSize: 11, letterSpacing: "0.1em", ...mono,
          display: "inline-flex", alignItems: "center", gap: 10,
          textTransform: "uppercase",
        }}
      >
        Clear filters →
      </button>
    </div>
  );
}
