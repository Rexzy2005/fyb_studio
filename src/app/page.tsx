"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useSession } from "next-auth/react";

import {
  fetchPublicTemplateList,
  type PublicTemplateListItem,
} from "@/lib/api/publicTemplates";
import { HeaderAuthSlot } from "@/components/auth/HeaderAuthSlot";
import { HeadEntryModal } from "@/components/templates/HeadEntryModal";

/* Type styles ─────────────────────────────────────────────── */
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
  fontWeight: 400,
  letterSpacing: "-0.018em",
};
const serifBody: CSSProperties = {
  fontFamily: "var(--font-fraunces)",
  fontVariationSettings: "'SOFT' 100, 'opsz' 14",
};
const script: CSSProperties = { fontFamily: "var(--font-ms-madi)" };
const mono: CSSProperties = { fontFamily: "var(--font-geist-mono)" };

function getClassYear(): number {
  const now = new Date();
  return now.getMonth() >= 7 ? now.getFullYear() + 1 : now.getFullYear();
}

/* ────────────────────────────────────────────────────────────
   Page
   ─────────────────────────────────────────────────────────── */
export default function Home() {
  const { data: session } = useSession();
  const isHead = Boolean(session?.user?.isDepartmentHead);
  const [headEntry, setHeadEntry] = useState<{ id: string; name: string } | null>(null);
  const [templates, setTemplates] = useState<PublicTemplateListItem[]>([]);
  const classYear = getClassYear();

  const heroRef = useRef<HTMLElement | null>(null);
  const stackRef = useRef<HTMLDivElement | null>(null);
  const yearRef = useRef<HTMLDivElement | null>(null);

  /* Load templates */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchPublicTemplateList();
        if (!cancelled) setTemplates(list);
      } catch (err) {
        if (!cancelled) console.warn("[home] teaser fetch failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* Reveal-on-scroll */
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
      { threshold: 0.12, rootMargin: "0px 0px -80px 0px" }
    );
    document
      .querySelectorAll<HTMLElement>(".reveal, .reveal-kinetic, .fyb-curtain")
      .forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [templates.length]);

  /* Hero — pointer parallax + gentle idle on the card stack */
  useEffect(() => {
    const wrap = heroRef.current;
    const stack = stackRef.current;
    if (!wrap || !stack) return;
    let raf = 0;
    let target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };
    let idleStart = performance.now();

    function onMove(e: PointerEvent) {
      const r = wrap!.getBoundingClientRect();
      target = {
        x: (e.clientX - r.left - r.width / 2) / r.width,
        y: (e.clientY - r.top - r.height / 2) / r.height,
      };
      idleStart = performance.now();
    }
    function onLeave() {
      target = { x: 0, y: 0 };
    }
    function tick(now: number) {
      current.x += (target.x - current.x) * 0.07;
      current.y += (target.y - current.y) * 0.07;
      const idle = (now - idleStart) / 1000;
      const ix = Math.sin(idle * 0.55) * 0.05;
      const iy = Math.cos(idle * 0.42) * 0.04;
      stack!.querySelectorAll<HTMLElement>("[data-stack-card]").forEach((card) => {
        const depth = parseFloat(card.dataset.depth ?? "1");
        const baseR = parseFloat(card.dataset.baseRot ?? "0");
        const bx = parseFloat(card.dataset.baseX ?? "0");
        const by = parseFloat(card.dataset.baseY ?? "0");
        const bs = parseFloat(card.dataset.baseScale ?? "1");
        const dx = (current.x + ix) * 38 * depth;
        const dy = (current.y + iy) * 28 * depth;
        const rot = baseR + (current.x + ix) * 6 * depth;
        card.style.transform =
          `translate(calc(-50% + ${bx + dx}px), calc(-50% + ${by + dy}px))` +
          ` rotate(${rot}deg) scale(${bs})`;
      });
      raf = requestAnimationFrame(tick);
    }

    wrap.addEventListener("pointermove", onMove);
    wrap.addEventListener("pointerleave", onLeave);
    raf = requestAnimationFrame(tick);
    return () => {
      wrap.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("pointerleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [templates.length]);

  /* Pinned hero year — scales/translates with scroll */
  useEffect(() => {
    const el = yearRef.current;
    if (!el) return;
    let raf = 0;
    function tick() {
      raf = 0;
      const y = window.scrollY;
      const max = window.innerHeight * 0.85;
      const t = Math.min(1, Math.max(0, y / max));
      const scale = 1 - t * 0.18;
      const ty = -t * 40;
      el!.style.transform = `translateY(${ty}px) scale(${scale})`;
      el!.style.opacity = String(1 - t * 0.55);
    }
    function onScroll() {
      if (!raf) raf = requestAnimationFrame(tick);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    tick();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  /* Comet cursor — three lerp-following nodes */
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const main = makeDot("main");
    const t1 = makeDot("t1");
    const t2 = makeDot("t2");
    document.body.append(main, t1, t2);
    function makeDot(kind: "main" | "t1" | "t2") {
      const d = document.createElement("div");
      d.className = `fyb-cursor ${kind}`;
      return d;
    }

    const target = { x: -200, y: -200 };
    const c0 = { x: -200, y: -200 };
    const c1 = { x: -200, y: -200 };
    const c2 = { x: -200, y: -200 };
    let raf = 0;

    function onMove(e: PointerEvent) {
      target.x = e.clientX;
      target.y = e.clientY;
      const isHot = (e.target as HTMLElement | null)?.closest(
        "a, button, [data-magnet]"
      );
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

  const onTemplateClick = useCallback(
    (e: MouseEvent, t: PublicTemplateListItem) => {
      if (!isHead) return;
      e.preventDefault();
      setHeadEntry({ id: t.id, name: t.name });
    },
    [isHead]
  );

  const heroPicks = templates.slice(0, 3);
  const featurePicks = templates.slice(0, 3);
  const galleryPicks = templates.slice(0, 6);
  const yearImage = templates[0]?.coverUrl;

  return (
    <div className="fyb-cinema relative min-h-dvh overflow-x-clip" style={serifBody}>
      {/* Ambient glow blobs */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div
          className="fyb-blob a"
          style={{
            background: "radial-gradient(circle, var(--accent) 0%, transparent 65%)",
            width: 720,
            height: 720,
            top: -200,
            right: -260,
          }}
        />
        <div
          className="fyb-blob b"
          style={{
            background: "radial-gradient(circle, var(--gold) 0%, transparent 70%)",
            width: 620,
            height: 620,
            bottom: -240,
            left: -200,
            opacity: 0.35,
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
              Studio
            </span>
          </Link>
          <nav className="flex items-center gap-6">
            <Link
              href="/templates"
              className="hidden text-[11px] uppercase tracking-[0.32em] text-[var(--paper)]/80 underline-offset-[6px] hover:text-[var(--paper)] hover:underline sm:inline"
            >
              Gallery
            </Link>
            <a
              href="#showing"
              className="hidden text-[11px] uppercase tracking-[0.32em] text-[var(--paper)]/80 underline-offset-[6px] hover:text-[var(--paper)] hover:underline sm:inline"
            >
              Now showing
            </a>
            <HeaderAuthSlot />
          </nav>
        </div>
      </header>

      {/* HERO — film title card */}
      <section ref={heroRef} className="relative z-10">
        <div className="mx-auto max-w-[92rem] px-5 sm:px-10">
          <div className="grid gap-12 pb-20 pt-10 lg:grid-cols-12 lg:gap-x-12 lg:pb-32 lg:pt-16">
            <div className="relative lg:col-span-7">
              <div
                className="fyb-rise text-[var(--accent)] text-[clamp(58px,11vw,128px)] leading-[0.9]"
                style={{ ...script, animationDelay: "60ms" }}
              >
                Class of
              </div>

              <div ref={yearRef} className="-mt-3 will-change-transform">
                <ImageClippedYear year={classYear} src={yearImage} />
              </div>

              <h1
                className="fyb-rise mt-10 text-balance text-[36px] leading-[1.05] sm:text-[52px]"
                style={{
                  ...serif,
                  fontVariationSettings: "'SOFT' 60, 'opsz' 144",
                  fontWeight: 700,
                  animationDelay: "320ms",
                }}
              >
                <Scramble text="Made it to final year. " />
                <em
                  className="text-[var(--accent)]"
                  style={{ ...script, fontStyle: "normal" }}
                >
                  Now make it loud.
                </em>
              </h1>

              <p
                className="fyb-rise mt-6 max-w-md text-[15px] leading-[1.7] text-[var(--paper-soft)]"
                style={{ ...serifBody, animationDelay: "420ms" }}
              >
                Sign-out tees. Face caps. FYB-week banners.{" "}
                <em>&ldquo;Face of the Finalist&rdquo;</em> posters. Built in minutes,
                ready for print and the timeline.
              </p>

              <div
                className="fyb-rise mt-8 flex flex-wrap items-center gap-3"
                style={{ animationDelay: "520ms" }}
              >
                <Magnet>
                  <Link
                    href="/templates"
                    data-magnet
                    className="group inline-flex items-center gap-3 bg-[var(--accent)] px-7 py-4 text-[12px] font-semibold uppercase tracking-[0.26em] text-[var(--night)] transition hover:bg-[var(--paper)]"
                  >
                    Open the gallery
                    <ArrowSlash />
                  </Link>
                </Magnet>
                <a
                  href="#showing"
                  className="inline-flex items-center gap-2 border-b border-[var(--paper)]/30 pb-1 text-[12px] font-semibold uppercase tracking-[0.26em] text-[var(--paper)] hover:border-[var(--paper)]"
                >
                  Now showing
                </a>
              </div>
            </div>

            <div
              ref={stackRef}
              className="fyb-rise relative hidden lg:col-span-5 lg:block"
              style={{ height: 560, animationDelay: "440ms" }}
            >
              <HeroCardStack picks={heroPicks} year={classYear} />
            </div>
          </div>
        </div>
      </section>

      {/* DIVIDER — seam */}
      <Seam label={`No. ${String(classYear).slice(-2)}`} />

      {/* NOW SHOWING — three featured templates as cinema scenes */}
      <section id="showing" className="relative z-10">
        <div className="mx-auto max-w-[92rem] px-5 sm:px-10 sm:pt-12">
          <div className="reveal grid items-end gap-8 sm:grid-cols-12">
            <h2
              className="text-balance text-[44px] leading-[1] sm:col-span-7 sm:text-[80px]"
              style={{ ...serif, fontWeight: 700 }}
            >
              Now{" "}
              <em
                className="not-italic text-[var(--accent)]"
                style={{ ...script, fontStyle: "normal" }}
              >
                showing.
              </em>
            </h2>
            <p
              className="max-w-md text-[15px] leading-[1.7] text-[var(--paper-soft)] sm:col-span-5"
              style={serifBody}
            >
              A short reel of what your sign-out can look like. Pick one — drop your
              details in. The studio renders the rest.
            </p>
          </div>

          <div className="mt-12 space-y-4 sm:mt-20 sm:space-y-6">
            {featurePicks.length === 0
              ? [0, 1, 2].map((i) => (
                  <FeatureScene
                    key={`p-${i}`}
                    index={i}
                    template={null}
                    onClick={() => {}}
                  />
                ))
              : featurePicks.map((t, i) => (
                  <FeatureScene
                    key={t.id}
                    index={i}
                    template={t}
                    onClick={(e) => onTemplateClick(e, t)}
                  />
                ))}
          </div>
        </div>
      </section>

      <Seam label="The library" />

      {/* GALLERY — small reel */}
      <section className="relative z-10">
        <div className="mx-auto max-w-[92rem] px-5 py-16 sm:px-10 sm:py-24">
          <div className="reveal flex flex-wrap items-end justify-between gap-4">
            <h2
              className="text-balance text-[36px] leading-[1] sm:text-[64px]"
              style={{ ...serif, fontWeight: 700 }}
            >
              Pick a template.{" "}
              <em
                className="not-italic text-[var(--accent)]"
                style={{ ...script, fontStyle: "normal" }}
              >
                make it yours.
              </em>
            </h2>
            <Link
              href="/templates"
              className="border-b border-[var(--paper)]/30 pb-1 text-[12px] font-semibold uppercase tracking-[0.26em] hover:border-[var(--paper)]"
            >
              See the whole library →
            </Link>
          </div>

          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {(galleryPicks.length ? galleryPicks : new Array(6).fill(null)).map(
              (t, idx) =>
                t ? (
                  <div
                    key={t.id}
                    className="reveal"
                    style={{ ["--reveal-delay" as never]: `${idx * 60}ms` }}
                  >
                    <GalleryTile t={t} onClick={onTemplateClick} index={idx} />
                  </div>
                ) : (
                  <div
                    key={`s-${idx}`}
                    className="aspect-[4/5] w-full animate-pulse border border-[var(--rule)] bg-white/5"
                  />
                )
            )}
          </div>
        </div>
      </section>

      {/* DEPT HEADS */}
      <section className="relative z-10 border-y border-[var(--rule)] bg-[var(--night-2)]">
        <div className="mx-auto grid max-w-[92rem] gap-12 px-5 py-20 sm:px-10 sm:py-32 lg:grid-cols-12 lg:gap-16">
          <div className="reveal lg:col-span-5">
            <div
              className="text-[10px] uppercase tracking-[0.36em] text-[var(--accent)]"
              style={mono}
            >
              For the Heads
            </div>
            <h2
              className="mt-3 text-balance text-[40px] leading-[1.02] sm:text-[64px]"
              style={{ ...serif, fontWeight: 700 }}
            >
              Reserve a design for{" "}
              <em
                className="not-italic text-[var(--accent)]"
                style={{ ...script, fontStyle: "normal" }}
              >
                your department.
              </em>
            </h2>
            <p
              className="mt-5 max-w-md text-[15px] leading-[1.7] text-[var(--paper-soft)]"
              style={serifBody}
            >
              Heads can lock a template exclusively for their department. A passcode
              shaped like <span style={mono}>SWE3467</span> gates access for sixty
              minutes per device. No collisions. No copycats.
            </p>

            <div className="mt-7 grid gap-3 text-[13px]" style={serifBody}>
              <Bullet>
                <em>One lock per template.</em> Other depts only see the cover.
              </Bullet>
              <Bullet>
                <em>Rotate on the fly.</em> Generate a fresh passcode whenever.
              </Bullet>
              <Bullet>
                <em>Set it free.</em> Unlock when sign-out week is done.
              </Bullet>
            </div>

            <div className="mt-8">
              <Magnet>
                <Link
                  href="/templates"
                  data-magnet
                  className="group inline-flex items-center gap-3 bg-[var(--paper)] px-6 py-3.5 text-[12px] font-semibold uppercase tracking-[0.26em] text-[var(--night)] transition hover:bg-[var(--accent)] hover:text-[var(--night)]"
                >
                  Find a design to lock
                  <ArrowSlash />
                </Link>
              </Magnet>
            </div>
          </div>

          <div
            className="reveal lg:col-span-7"
            style={{ ["--reveal-delay" as never]: "120ms" }}
          >
            <LockTicket year={classYear} />
          </div>
        </div>
      </section>

      {/* CLOSING — kinetic billboard */}
      <section className="relative z-10">
        <div className="mx-auto max-w-[92rem] px-5 py-28 sm:px-10 sm:py-40">
          <p
            className="reveal-kinetic text-balance leading-[0.92]"
            style={{
              ...display,
              fontSize: "clamp(64px, 14vw, 260px)",
            }}
          >
            <KineticLine>See you on the</KineticLine>
            <br />
            <KineticLine accent indexOffset={14}>
              other side.
            </KineticLine>
          </p>

          <div
            className="reveal mt-14 flex flex-col items-start gap-6 sm:flex-row sm:items-center"
            style={{ ["--reveal-delay" as never]: "200ms" }}
          >
            <Magnet>
              <Link
                href="/templates"
                data-magnet
                className="group inline-flex items-center gap-3 bg-[var(--accent)] px-8 py-5 text-[12px] font-semibold uppercase tracking-[0.26em] text-[var(--night)] transition hover:bg-[var(--paper)]"
              >
                Start designing
                <ArrowSlash />
              </Link>
            </Magnet>
            <span
              className="text-[44px] text-[var(--gold)] sm:text-[60px]"
              style={script}
            >
              — Class of {classYear}
            </span>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-[var(--rule)]">
        <div className="mx-auto flex max-w-[92rem] flex-wrap items-center justify-between gap-4 px-5 py-7 text-[10px] uppercase tracking-[0.36em] text-[var(--paper-faint)] sm:px-10">
          <span style={mono}>FYB Studio · {classYear}</span>
          <span style={mono}>Built for the bell ↗</span>
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

function ArrowSlash() {
  return (
    <span
      aria-hidden
      className="inline-block transition-transform group-hover:translate-x-1"
    >
      ↗
    </span>
  );
}

function Bullet({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span
        className="mt-2 inline-block h-[2px] w-4 bg-[var(--accent)]"
        aria-hidden
      />
      <span>{children}</span>
    </div>
  );
}

function Seam({ label }: { label: string }) {
  return (
    <div className="relative z-10">
      <div className="mx-auto flex max-w-[92rem] items-center gap-4 px-5 py-7 sm:px-10">
        <span
          className="text-[10px] uppercase tracking-[0.36em] text-[var(--paper-faint)]"
          style={mono}
        >
          {label}
        </span>
        <div className="h-px flex-1 bg-[var(--rule)]" />
        <span
          className="fyb-flicker text-[10px] uppercase tracking-[0.36em] text-[var(--accent)]"
          style={mono}
        >
          ●  on
        </span>
      </div>
    </div>
  );
}

/* Headline scramble — locks in after a brief jitter */
function Scramble({ text }: { text: string }) {
  const [out, setOut] = useState(text);
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setOut(text);
      return;
    }
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ-/0123456789";
    let frame = 0;
    const dur = 36; // frames total
    let raf = 0;

    function step() {
      frame++;
      let next = "";
      for (let i = 0; i < text.length; i++) {
        const ch = text[i]!;
        const reveal = i < (frame / dur) * text.length;
        if (reveal || ch === " ") next += ch;
        else next += chars[(Math.random() * chars.length) | 0];
      }
      setOut(next);
      if (frame < dur) raf = requestAnimationFrame(step);
      else setOut(text);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [text]);
  return <span>{out}</span>;
}

function Magnet({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      className="fyb-magnet"
      onPointerMove={(e) => {
        const el = ref.current;
        if (!el) return;
        if (window.matchMedia && !window.matchMedia("(hover: hover)").matches) return;
        const r = el.getBoundingClientRect();
        const dx = (e.clientX - (r.left + r.width / 2)) * 0.3;
        const dy = (e.clientY - (r.top + r.height / 2)) * 0.3;
        el.style.transform = `translate(${dx}px, ${dy}px)`;
      }}
      onPointerLeave={() => {
        if (ref.current) ref.current.style.transform = "";
      }}
    >
      {children}
    </div>
  );
}

function ImageClippedYear({ year, src }: { year: number; src?: string }) {
  // Fall back to a cinematic radial mesh if no template cover loaded yet.
  const fallback = `radial-gradient(circle at 30% 30%, var(--accent) 0%, transparent 55%), radial-gradient(circle at 70% 70%, var(--gold) 0%, transparent 60%), linear-gradient(135deg, var(--accent) 0%, var(--gold) 100%)`;
  const bg = src ? `url(${src})` : fallback;

  return (
    <div className="fyb-rise" style={{ animationDelay: "180ms" }}>
      <div
        className="fyb-clip-text leading-[0.78] text-[clamp(112px,26vw,20rem)]"
        style={{
          ...display,
          backgroundImage: bg,
          backgroundSize: src ? "180% 180%" : "200% 200%",
          backgroundPosition: "50% 50%",
          backgroundRepeat: "no-repeat",
        }}
        aria-label={`${year}`}
      >
        {year}
      </div>
    </div>
  );
}

function HeroCardStack({
  picks,
  year,
}: {
  picks: PublicTemplateListItem[];
  year: number;
}) {
  const positions = [
    { rotate: -10, x: -130, y: 30, z: 1, scale: 0.86, depth: 0.6 },
    { rotate: 6, x: 0, y: -10, z: 3, scale: 1.0, depth: 1.0 },
    { rotate: -3, x: 130, y: 50, z: 2, scale: 0.82, depth: 0.45 },
  ];
  return (
    <div className="relative h-full w-full">
      {positions.map((p, i) => {
        const t = picks[i];
        return (
          <div
            key={i}
            data-stack-card
            data-base-x={p.x}
            data-base-y={p.y}
            data-base-rot={p.rotate}
            data-base-scale={p.scale}
            data-depth={p.depth}
            style={{
              zIndex: p.z,
              transform: `translate(calc(-50% + ${p.x}px), calc(-50% + ${p.y}px)) rotate(${p.rotate}deg) scale(${p.scale})`,
            }}
          >
            <div className="relative h-[440px] w-[320px] border border-[var(--paper)]/30 bg-[var(--night-2)] shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
              <div className="absolute inset-0 ring-1 ring-inset ring-white/5" aria-hidden />
              <div className="relative h-[calc(100%-40px)] w-full overflow-hidden">
                {t ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={t.coverUrl}
                    alt={t.name}
                    className="h-full w-full object-contain p-3"
                  />
                ) : (
                  <FallbackPlate variant={i} year={year} />
                )}
              </div>
              <div
                className="flex h-[40px] items-center justify-between border-t border-white/10 bg-[var(--night-2)] px-3 text-[9px] uppercase tracking-[0.28em] text-[var(--paper-faint)]"
                style={mono}
              >
                <span>FYB · {year}</span>
                <span className="truncate">{t?.name ?? "Reel"}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FallbackPlate({ variant, year }: { variant: number; year: number }) {
  if (variant === 0) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[var(--night-2)] p-6 text-center text-[var(--paper)]">
        <div
          className="text-[10px] uppercase tracking-[0.32em] text-[var(--paper-faint)]"
          style={mono}
        >
          Sign-out tee
        </div>
        <div style={{ ...display, fontSize: 88, lineHeight: 0.85 }}>
          SIGNED
          <br />
          OUT
        </div>
        <div className="text-[44px] text-[var(--accent)]" style={script}>
          Class of {year}
        </div>
      </div>
    );
  }
  if (variant === 1) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-between gap-2 bg-[var(--night)] p-5 text-center text-[var(--paper)]">
        <div
          className="w-full text-left text-[9px] uppercase tracking-[0.32em] text-[var(--paper-faint)]"
          style={mono}
        >
          Face of the Finalist
        </div>
        <div className="aspect-square w-3/4 bg-[var(--accent)]" />
        <div>
          <div style={{ ...serif, fontWeight: 700, fontSize: 36, lineHeight: 0.95 }}>
            Adaeze
            <br />
            Nwosu
          </div>
          <div className="mt-1 text-[40px] text-[var(--gold)]" style={script}>
            the storyteller
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-[var(--accent)] p-6 text-center text-[var(--night)]">
      <div className="text-[10px] uppercase tracking-[0.32em]" style={mono}>
        Banner
      </div>
      <div style={{ ...display, fontSize: 70, lineHeight: 0.9 }}>
        ANKARA
        <br />
        DAY
      </div>
      <div className="text-[40px] text-[var(--night)]" style={script}>
        Software Eng.
      </div>
    </div>
  );
}

function FeatureScene({
  index,
  template,
  onClick,
}: {
  index: number;
  template: PublicTemplateListItem | null;
  onClick: (e: MouseEvent) => void;
}) {
  const flipped = index % 2 === 1;
  return (
    <Link
      href={template ? `/templates/${template.id}/use` : "/templates"}
      onClick={(e) => template && onClick(e)}
      className={
        "fyb-curtain group relative grid items-center gap-6 overflow-hidden border border-[var(--rule)] bg-[var(--night-2)] p-5 sm:gap-10 sm:p-8 lg:grid-cols-12 " +
        (flipped ? "lg:[direction:rtl]" : "")
      }
      style={{ ["--curtain-delay" as never]: `${index * 100}ms` }}
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-[var(--night)] sm:aspect-[3/4] lg:col-span-5 lg:[direction:ltr]">
        {template ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={template.coverUrl}
            alt={template.name}
            className="h-full w-full object-contain p-4 transition-transform duration-700 ease-out group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[10px] uppercase tracking-[0.32em] text-[var(--paper-faint)]" style={mono}>
            Loading reel · 0{index + 1}
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/5" />
      </div>

      <div className="flex flex-col gap-4 lg:col-span-7 lg:[direction:ltr]">
        <div
          className="text-[10px] uppercase tracking-[0.36em] text-[var(--accent)]"
          style={mono}
        >
          Reel · {String(index + 1).padStart(2, "0")}
        </div>
        <h3
          className="text-balance text-[36px] leading-[1] sm:text-[68px]"
          style={{ ...serif, fontWeight: 700 }}
        >
          {template ? (
            template.name
          ) : (
            <>Untitled drop.</>
          )}
        </h3>
        <p className="max-w-md text-[14px] leading-[1.7] text-[var(--paper-soft)]" style={serifBody}>
          Every field below the cover is editable — names, photos, colors. Open it,
          drop your details in, watch the design re-flow.
        </p>
        <div className="mt-2 inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.26em] text-[var(--paper)]/80">
          <span className="border-b border-[var(--accent)] pb-1 text-[var(--accent)]">
            Use template
          </span>
          <ArrowSlash />
        </div>
      </div>
    </Link>
  );
}

function GalleryTile({
  t,
  onClick,
  index,
}: {
  t: PublicTemplateListItem;
  onClick: (e: MouseEvent, t: PublicTemplateListItem) => void;
  index: number;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  return (
    <Link
      ref={ref}
      href={`/templates/${t.id}/use`}
      onClick={(e) => onClick(e, t)}
      onPointerMove={(e) => {
        const el = ref.current;
        if (!el) return;
        if (!window.matchMedia("(hover: hover)").matches) return;
        const r = el.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = `perspective(900px) rotateX(${-y * 6}deg) rotateY(${x * 8}deg) translateY(-2px)`;
      }}
      onPointerLeave={() => {
        if (ref.current) ref.current.style.transform = "";
      }}
      className="group relative block aspect-[4/5] overflow-hidden border border-[var(--rule)] bg-[var(--night-2)] transition-transform duration-300 will-change-transform"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={t.coverUrl}
        alt={t.name}
        className="h-full w-full object-contain p-3 transition-transform duration-500 group-hover:scale-[1.04]"
      />
      <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/5" />
      <div
        className="absolute left-2.5 top-2.5 bg-[var(--accent)] px-1.5 py-0.5 text-[9px] uppercase tracking-[0.32em] text-[var(--night)]"
        style={mono}
      >
        {String(index + 1).padStart(2, "0")}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-2 bg-linear-to-t from-[var(--night)] via-[var(--night)]/60 to-transparent p-3 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
        <div className="truncate text-[12px]" style={{ ...displayWide, fontWeight: 700 }}>
          {t.name}
        </div>
      </div>
    </Link>
  );
}

function LockTicket({ year }: { year: number }) {
  return (
    <div className="relative mx-auto max-w-md text-[var(--night)]">
      <div
        className="absolute -top-3 left-6 z-10 bg-[var(--accent)] px-3 py-1 text-[10px] uppercase tracking-[0.32em] text-[var(--night)]"
        style={mono}
      >
        Exclusive
      </div>
      <div className="relative bg-[var(--paper)] shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
        <div className="border-2 border-dashed border-[var(--night)]/40 p-6 sm:p-8">
          <div
            className="flex items-start justify-between text-[10px] uppercase tracking-[0.28em] text-[var(--night)]/65"
            style={mono}
          >
            <span>Lock receipt</span>
            <span>No. {year}-04</span>
          </div>
          <div className="mt-5" style={{ ...display, fontSize: 56, lineHeight: 0.88 }}>
            DESIGN
            <br />
            LOCKED
          </div>
          <div className="mt-5 grid gap-3 text-sm">
            <Field label="Department" value="Software Engineering" />
            <Field label="Template" value={`Sign-out Tee · Class of ${year}`} />
            <Field label="Locked by" value="Amina Okafor (Head)" />
          </div>
          <div className="my-6 border-t border-dashed border-[var(--night)]/40" />
          <div
            className="text-[10px] uppercase tracking-[0.28em] text-[var(--night)]/65"
            style={mono}
          >
            Passcode
          </div>
          <div className="mt-1 text-[40px] tracking-[0.18em]" style={mono}>
            SWE3467
          </div>
          <div className="my-6 border-t border-dashed border-[var(--night)]/40" />
          <div
            className="flex items-center justify-between text-[10px] uppercase tracking-[0.28em] text-[var(--night)]/65"
            style={mono}
          >
            <span>Valid · 60 minutes / device</span>
            <span>Rotatable</span>
          </div>
        </div>
        <div
          aria-hidden
          className="absolute inset-y-0 left-[42px] w-[1px] border-l border-dashed border-[var(--night)]/30"
        />
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span
        className="w-28 shrink-0 text-[10px] uppercase tracking-[0.26em] text-[var(--night)]/65"
        style={mono}
      >
        {label}
      </span>
      <span className="text-[14px]" style={serifBody}>
        {value}
      </span>
    </div>
  );
}

function KineticLine({
  children,
  accent,
  indexOffset = 0,
}: {
  children: string;
  accent?: boolean;
  indexOffset?: number;
}) {
  const chars = children.split("");
  return (
    <span
      className={accent ? "text-[var(--accent)]" : ""}
      style={
        accent
          ? { ...script, fontStyle: "normal", fontWeight: 400, letterSpacing: "0" }
          : undefined
      }
    >
      {chars.map((ch, i) => (
        <span
          key={i}
          className="kinetic-letter"
          style={{ ["--ki-i" as never]: i + indexOffset } as CSSProperties}
        >
          {ch === " " ? " " : ch}
        </span>
      ))}
    </span>
  );
}
