"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from "react";
import { useSession } from "next-auth/react";

import {
  fetchPublicTemplateList,
  type PublicTemplateListItem,
} from "@/lib/api/publicTemplates";
import { HeaderAuthSlot } from "@/components/auth/HeaderAuthSlot";
import { HeadEntryModal } from "@/components/templates/HeadEntryModal";

export default function Home() {
  const { data: session } = useSession();
  const isHead = Boolean(session?.user?.isDepartmentHead);
  const [headEntry, setHeadEntry] = useState<
    | { id: string; name: string }
    | null
  >(null);

  const onTeaserActivate = useCallback(
    (e: MouseEvent, t: PublicTemplateListItem) => {
      if (!isHead) return;
      e.preventDefault();
      setHeadEntry({ id: t.id, name: t.name });
    },
    [isHead]
  );

  const heroRef = useRef<HTMLDivElement | null>(null);
  const howRef = useRef<HTMLElement | null>(null);
  const [howStep, setHowStep] = useState<0 | 1 | 2>(0);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });
  const [reduceMotion, setReduceMotion] = useState(false);

  const demo = useMemo(
    () => [
      {
        title: "Sign-out Tee",
        project: "SIGNED OUT",
        name: "Amina Okafor",
        dept: "Computer Science (400L)",
        date: "Class of 2026",
      },
      {
        title: "Face Cap",
        project: "FACE OF THE FINALIST",
        name: "Amina Okafor",
        dept: "Computer Science",
        date: "Vote Amina",
      },
      {
        title: "Department Banner",
        project: "FYB WEEK — ANKARA DAY",
        name: "Computer Science",
        dept: "Class of 2026",
        date: "Photo-ready",
      },
    ],
    []
  );
  const [demoIndex, setDemoIndex] = useState(0);

  const fieldTimeline = useMemo(
    () => [
      {
        label: "Name",
        value: "Amina Okafor",
      },
      {
        label: "Dept",
        value: "Computer Science (400L)",
      },
      {
        label: "Nickname",
        value: "The Pace Setter",
      },
      {
        label: "Quote",
        value: "No more lectures. Only level up.",
      },
    ],
    []
  );
  const [activeField, setActiveField] = useState(0);

  const [teaser, setTeaser] = useState<PublicTemplateListItem[]>([]);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const update = () => setReduceMotion(Boolean(mq.matches));
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    const id = window.setInterval(() => {
      setDemoIndex((i) => (i + 1) % demo.length);
    }, 2400);
    return () => window.clearInterval(id);
  }, [demo.length, reduceMotion]);

  useEffect(() => {
    if (reduceMotion) return;
    const id = window.setInterval(() => {
      setActiveField((i) => (i + 1) % fieldTimeline.length);
    }, 1400);
    return () => window.clearInterval(id);
  }, [fieldTimeline.length, reduceMotion]);

  useEffect(() => {
    let raf = 0;
    const el = heroRef.current;
    if (!el) return;
    if (reduceMotion) return;

    function onMove(e: PointerEvent) {
      const r = el?.getBoundingClientRect();
      if (!r) return;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = (e.clientX - cx) / Math.max(1, r.width);
      const dy = (e.clientY - cy) / Math.max(1, r.height);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setTilt({ rx: clamp(-dy * 6, -6, 6), ry: clamp(dx * 8, -8, 8) });
      });
    }

    function onLeave() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setTilt({ rx: 0, ry: 0 }));
    }

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [reduceMotion]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchPublicTemplateList();
        if (cancelled) return;
        setTeaser(list.slice(0, 9));
      } catch (err) {
        if (!cancelled) console.warn("[home] teaser fetch failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const section = howRef.current;
    if (!section) return;
    if (reduceMotion) return;

    let raf = 0;
    function tick() {
      raf = 0;
      const r = section?.getBoundingClientRect();
      if (!r) return;
      const vh = window.innerHeight || 1;
      const start = vh * 0.15;
      const end = vh * 0.85;
      const t = clamp((start - r.top) / Math.max(1, r.height - (end - start)), 0, 1);
      const idx = t < 0.34 ? 0 : t < 0.67 ? 1 : 2;
      setHowStep(idx as 0 | 1 | 2);
    }

    function onScroll() {
      if (raf) return;
      raf = requestAnimationFrame(tick);
    }

    tick();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reduceMotion]);

  return (
    <div className="min-h-dvh bg-zinc-50 dark:bg-zinc-950">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-24 left-1/2 h-130 w-130 -translate-x-1/2 rounded-full bg-zinc-200/40 blur-3xl dark:bg-zinc-800/50" />
        <div className="absolute -top-10 -right-35 h-105 w-105 rounded-full bg-emerald-200/25 blur-3xl dark:bg-emerald-900/10" />
        <div className="absolute -bottom-55 -left-40 h-130 w-130 rounded-full bg-zinc-200/30 blur-3xl dark:bg-zinc-800/40" />
      </div>

      <header className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-6">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="h-4 w-4 rounded-full bg-zinc-900 dark:bg-zinc-100" />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight text-zinc-950 dark:text-zinc-100">FYB Studio</div>
            <div className="text-[11px] text-zinc-600 dark:text-zinc-300">Design your sign-out. Print it. Post it.</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/templates"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-900 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
          >
            Browse templates
          </Link>
          <HeaderAuthSlot />
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4">
        {/* Hero */}
        <section ref={heroRef} className="grid items-center gap-10 pb-20 pt-12 lg:grid-cols-12 lg:pb-28 lg:pt-20">
          <div className="lg:col-span-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-medium text-zinc-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-[fybPing_1.8s_ease-out_infinite] rounded-full bg-emerald-500/35 motion-reduce:animate-none" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              </span>
              FYB-ready in minutes
            </div>

            <h1 className="mt-4 text-balance text-4xl font-semibold leading-[1.05] tracking-tight text-zinc-950 dark:text-zinc-100 sm:text-5xl">
              Your FYB week, designed like a brand.
            </h1>
            <p className="mt-4 max-w-prose text-pretty text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              Sign-out tees, face caps, “Face of the Finalist”, department banners — start from a template, personalize it fast, export a sharp PNG.
            </p>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/templates"
                className="inline-flex h-11 items-center justify-center rounded-2xl bg-zinc-900 px-5 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                Browse templates
              </Link>
              <a
                href="#how"
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-zinc-200 bg-white px-5 text-sm font-medium text-zinc-900 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                Watch it update live
              </a>
            </div>
          </div>

          {/* Visual */}
          <div className="lg:col-span-7">
            <div
              className="relative mx-auto max-w-2xl"
              style={{ perspective: "1200px" }}
            >
              <div
                className="relative overflow-hidden rounded-[28px] border border-zinc-200 bg-white shadow-[0_24px_90px_rgba(0,0,0,0.10)] will-change-transform motion-reduce:transform-none dark:border-zinc-800 dark:bg-zinc-900"
                style={{
                  transform: reduceMotion
                    ? "none"
                    : `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg) translateZ(0)`,
                  transition: "transform 420ms cubic-bezier(0.22, 1, 0.36, 1)",
                }}
              >
                <div className="absolute inset-0 bg-linear-to-br from-white via-white to-zinc-50 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900" />
                <div className="absolute inset-0 opacity-60 mask-[radial-gradient(circle_at_30%_20%,black,transparent_65%)]">
                  <div className="absolute -top-24 left-12 h-56 w-56 rounded-full bg-emerald-200/50 blur-3xl dark:bg-emerald-900/15" />
                </div>

                <div className="relative p-6 sm:p-8">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                      <div className="h-2.5 w-2.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                      <div className="h-2.5 w-2.5 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                    </div>
                    <div className="flex items-center gap-2 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Live preview
                    </div>
                  </div>

                  <div className="mt-6 grid gap-4">
                    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{demo[demoIndex]?.title}</div>
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Auto-balance</div>
                      </div>

                      <div className="mt-3 grid gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950/40 sm:grid-cols-12">
                        {/* Left: form-like fields (animated focus) */}
                        <div className="relative sm:col-span-5">
                          <div className="flex items-center justify-between">
                            <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Details</div>
                            <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Live</div>
                          </div>

                          {/* Cursor */}
                          <div className="pointer-events-none absolute left-2 top-8.5 hidden h-3 w-3 rounded-full bg-zinc-900 shadow-[0_8px_20px_rgba(0,0,0,0.18)] transition-all duration-500 ease-out motion-reduce:hidden dark:bg-zinc-100 sm:block"
                            style={{
                              transform: reduceMotion
                                ? "none"
                                : `translateY(${activeField * 54}px)`,
                            }}
                          />

                          <div className="mt-3 space-y-2">
                            {fieldTimeline.map((f, idx) => {
                              const isActive = idx === activeField;
                              const showCaret = isActive && !reduceMotion;
                              return (
                                <div
                                  key={f.label}
                                  className={
                                    "rounded-xl border bg-white px-3 py-2 transition-shadow duration-300 dark:bg-zinc-900/30 " +
                                    (isActive
                                      ? "border-emerald-200 shadow-[0_0_0_3px_rgba(16,185,129,0.18)] dark:border-emerald-900/50"
                                      : "border-zinc-200 dark:border-zinc-800")
                                  }
                                >
                                  <div className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">{f.label}</div>
                                  <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                                    <span className={"truncate " + (isActive ? "" : "opacity-85")}>{f.value}</span>
                                    {showCaret ? (
                                      <span className="inline-block h-3 w-0.5 translate-y-px bg-zinc-900/60 align-middle animate-[fybBlink_1.1s_steps(2,end)_infinite] dark:bg-zinc-100/60" />
                                    ) : null}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Right: preview (updates in sync) */}
                        <div className="sm:col-span-7">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Main text</div>
                              <div
                                key={`p-${demoIndex}`}
                                className="mt-1 truncate text-sm font-semibold text-zinc-950 transition-opacity duration-500 ease-out dark:text-zinc-100"
                              >
                                {demo[demoIndex]?.project}
                              </div>
                              <div className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                                <span className="font-medium text-zinc-700 dark:text-zinc-200">{fieldTimeline[0]?.value}</span>
                                <span className="mx-2 text-zinc-300 dark:text-zinc-700">•</span>
                                <span>{fieldTimeline[1]?.value}</span>
                              </div>
                              <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                                <span className="rounded-lg bg-zinc-50 px-2 py-1 dark:bg-zinc-800/50">
                                  {fieldTimeline[2]?.value}
                                </span>
                              </div>
                              <div className="mt-2 text-[11px] italic text-zinc-500 dark:text-zinc-400">
                                “{fieldTimeline[3]?.value}”
                              </div>
                            </div>

                            <div className="rounded-xl bg-zinc-900 px-3 py-2 text-[11px] font-semibold text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900">
                              Download PNG
                            </div>
                          </div>

                          <div className="mt-4 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
                            <span>{demo[demoIndex]?.date}</span>
                            <span className="inline-flex items-center gap-1">
                              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              Saved
                            </span>
                          </div>

                          <div className="mt-3 h-1 overflow-hidden rounded-full bg-zinc-200/70 dark:bg-zinc-700/50">
                            <div
                              className={
                                "h-1 rounded-full bg-emerald-500/80 " +
                                (reduceMotion
                                  ? "w-[92%]"
                                  : "w-[92%] animate-[fybProgress_2.4s_cubic-bezier(0.22,1,0.36,1)_infinite]")
                              }
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <HeroMiniCard label="Choose" active />
                      <HeroMiniCard label="Personalize" />
                      <HeroMiniCard label="Export" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="pointer-events-none absolute -inset-6 -z-10 rounded-[36px] bg-linear-to-br from-zinc-200/40 to-transparent blur-2xl dark:from-zinc-800/40" />
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how" ref={howRef} className="scroll-mt-24 pb-20">
          <div className="grid items-start gap-10 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <div className="text-xs font-semibold tracking-wide text-zinc-900 dark:text-zinc-100">How it works</div>
              <div className="mt-2 text-pretty text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                Choose a template, add your details, export — ready for print and socials.
              </div>

              <div className="mt-6 space-y-3">
                <HowStepChip index={0} active={howStep === 0} title="Pick a vibe" />
                <HowStepChip index={1} active={howStep === 1} title="Add your name, department & shout-outs" />
                <HowStepChip index={2} active={howStep === 2} title="Export and share (or send to print)" />
              </div>
            </div>

            <div className="lg:col-span-8">
              <div className="relative overflow-hidden rounded-[28px] border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <div className="absolute inset-0 bg-linear-to-br from-zinc-50 to-white dark:from-zinc-950 dark:to-zinc-900" />
                <div className="absolute inset-0 opacity-60 mask-[radial-gradient(circle_at_50%_40%,black,transparent_70%)]">
                  <div className="absolute -top-24 left-20 h-64 w-64 rounded-full bg-zinc-200/60 blur-3xl dark:bg-zinc-800/40" />
                  <div className="absolute -bottom-28 right-12 h-64 w-64 rounded-full bg-emerald-200/30 blur-3xl dark:bg-emerald-900/10" />
                </div>

                <div className="relative p-5 sm:p-8">
                  <HowVisual step={howStep} reduceMotion={reduceMotion} />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Workspace showcase */}
        <section className="pb-24">
          <div className="grid items-start gap-10 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <div className="text-xs font-semibold tracking-wide text-zinc-900 dark:text-zinc-100">
                Workspace
              </div>
              <h2 className="mt-2 text-pretty text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-100">
                Watch it edit like the real thing.
              </h2>
              <p className="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                This is the exact vibe of the “Use template” workspace — type your name, department and shout-outs, and see your FYB design update instantly.
              </p>

              <div className="mt-6 flex flex-col gap-3">
                <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                  Desktop shows the full workspace: preview + form side-by-side.
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
                  Mobile shows the sticky top bar + full-screen preview + sheet form.
                </div>
              </div>
            </div>

            <div className="lg:col-span-8">
              <WorkspaceShowcase reduceMotion={reduceMotion} />
            </div>
          </div>
        </section>

        {/* Templates teaser */}
        <section className="pb-24">
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="text-xs font-semibold tracking-wide text-zinc-900 dark:text-zinc-100">Templates</div>
              <div className="mt-2 text-pretty text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                Templates for sign-outs, face caps, flyers, and banners — ready to customize.
              </div>
            </div>
            <Link
              href="/templates"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-900 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
            >
              See all
            </Link>
          </div>

          <div className="mt-6 columns-2 gap-3 sm:columns-3 lg:columns-4">
            {(teaser.length ? teaser : new Array(8).fill(null)).map((t, idx) => (
              <div
                key={(t as PublicTemplateListItem | null)?.id ?? `s-${idx}`}
                className="mb-3 break-inside-avoid overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
              >
                {t ? (
                  <TeaserTile template={t} onActivate={onTeaserActivate} />
                ) : (
                  <div className="aspect-4/5 w-full animate-pulse bg-zinc-100 dark:bg-zinc-800/60" />
                )}
              </div>
            ))}
          </div>
        </section>
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

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function HeroMiniCard({ label, active }: { label: string; active?: boolean }) {
  return (
    <div
      className={
        "rounded-2xl border bg-white p-3 text-center text-xs font-medium shadow-sm transition dark:bg-zinc-900 " +
        (active
          ? "border-emerald-200 text-zinc-900 dark:border-emerald-900/40 dark:text-zinc-100"
          : "border-zinc-200 text-zinc-700 dark:border-zinc-800 dark:text-zinc-200")
      }
    >
      {label}
    </div>
  );
}

function WorkspaceShowcase({ reduceMotion }: { reduceMotion: boolean }) {
  const steps = useMemo(
    () => [
      {
        field: "Name",
        value: "Amina Okafor",
        sub: "Computer Science (400L)",
        badge: "SIGNED OUT",
        cx: 248,
        cy: 146,
      },
      {
        field: "Department",
        value: "Computer Science",
        sub: "Class of 2026",
        badge: "FYB WEEK",
        cx: 270,
        cy: 210,
      },
      {
        field: "Shout-out",
        value: "No dulling — we made it",
        sub: "Signed by the squad",
        badge: "FACE CAP",
        cx: 292,
        cy: 266,
      },
      {
        field: "Tagline",
        value: "Class of 2026",
        sub: "Photo-ready",
        badge: "BANNER",
        cx: 314,
        cy: 312,
      },
    ],
    []
  );

  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (reduceMotion) return;
    const id = window.setInterval(() => setIdx((i) => (i + 1) % steps.length), 2200);
    return () => window.clearInterval(id);
  }, [reduceMotion, steps.length]);

  const s = steps[idx] ?? steps[0]!;
  const cursorStyle = useMemo(
    () =>
    ({
      // Use CSS vars in keyframes; keep it subtle.
      "--cx": `${s.cx}px`,
      "--cy": `${s.cy}px`,
      animation: "fybCursor 2.2s cubic-bezier(0.22,1,0.36,1) infinite",
    } as CSSProperties & Record<"--cx" | "--cy", string>),
    [s.cx, s.cy]
  );

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="absolute inset-0 bg-linear-to-br from-zinc-50 to-white dark:from-zinc-950 dark:to-zinc-900" />
      <div className="absolute inset-0 opacity-60 mask-[radial-gradient(circle_at_40%_20%,black,transparent_70%)]">
        <div className="absolute -top-24 left-20 h-64 w-64 rounded-full bg-zinc-200/60 blur-3xl dark:bg-zinc-800/40" />
        <div className="absolute -bottom-28 right-12 h-64 w-64 rounded-full bg-emerald-200/30 blur-3xl dark:bg-emerald-900/10" />
      </div>

      <div className="relative p-4 sm:p-6">
        {/* Desktop */}
        <div className="hidden lg:block">
          <div className="rounded-2xl border border-zinc-200 bg-white/70 p-4 shadow-sm backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/30">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">Use workspace (desktop)</div>
              <div className="inline-flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                <span className={"h-1.5 w-1.5 rounded-full bg-emerald-500 " + (reduceMotion ? "" : "animate-pulse")} />
                Live
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-12">
              {/* Preview */}
              <div className="lg:col-span-8">
                <div className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 shadow-sm dark:border-zinc-800 dark:bg-zinc-800/30">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.06)_1px,transparent_0)] bg-size-[14px_14px] opacity-30 dark:opacity-20" />

                  <div className="relative p-5">
                    <div className="flex items-center justify-between">
                      <div className="text-[11px] font-semibold text-zinc-900 dark:text-zinc-100">{s.badge}</div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">FYB Studio</div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                      <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">{s.field}</div>
                      <div className="mt-1 text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-100">
                        {s.value}
                        <span className="ml-1 inline-block h-4 w-0.5 translate-y-0.5 bg-zinc-900/60 align-middle animate-[fybBlink_1.1s_steps(2,end)_infinite] motion-reduce:animate-none dark:bg-zinc-100/60" />
                      </div>
                      <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{s.sub}</div>

                      <div className="mt-5 grid grid-cols-3 gap-3">
                        <div className="h-10 rounded-xl bg-zinc-50 dark:bg-zinc-800/60" />
                        <div className="h-10 rounded-xl bg-zinc-50 dark:bg-zinc-800/60" />
                        <div className="h-10 rounded-xl bg-emerald-600/90" />
                      </div>
                    </div>

                    <div className="pointer-events-none absolute inset-0">
                      <div
                        className={"absolute left-6 top-6 h-20 w-20 rounded-full bg-emerald-400/10 blur-2xl " +
                          (reduceMotion ? "" : "animate-[fybGlow_2.2s_ease-in-out_infinite]")}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Form */}
              <div className="lg:col-span-4">
                <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">Edit fields</div>
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Auto-save</div>
                  </div>

                  <div className="mt-3 space-y-3">
                    <WorkspaceField
                      label="Name"
                      value={s.field === "Name" ? s.value : "Amina Okafor"}
                      active={s.field === "Name"}
                      reduceMotion={reduceMotion}
                    />
                    <WorkspaceField
                      label="Department"
                      value={s.field === "Department" ? s.value : "Computer Science"}
                      active={s.field === "Department"}
                      reduceMotion={reduceMotion}
                    />
                    <WorkspaceField
                      label="Shout-out"
                      value={s.field === "Shout-out" ? s.value : "No dulling"}
                      active={s.field === "Shout-out"}
                      reduceMotion={reduceMotion}
                    />
                    <WorkspaceField
                      label="Tagline"
                      value={s.field === "Tagline" ? s.value : "Class of 2026"}
                      active={s.field === "Tagline"}
                      reduceMotion={reduceMotion}
                    />
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <div className="flex-1 rounded-xl bg-zinc-100 px-3 py-2 text-[11px] font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                      Preview updates instantly
                    </div>
                    <div className="rounded-xl bg-zinc-900 px-3 py-2 text-[11px] font-semibold text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900">
                      Export
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Cursor pass (video-like) */}
            {!reduceMotion ? (
              <div
                className="pointer-events-none absolute left-0 top-0 h-6 w-6"
                style={cursorStyle}
              >
                <div className="h-6 w-6 rounded-full bg-zinc-950/10 ring-2 ring-emerald-500/30 dark:bg-white/10" />
              </div>
            ) : null}
          </div>
        </div>

        {/* Mobile */}
        <div className="lg:hidden">
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white/70 shadow-sm backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/30">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">Use workspace (mobile)</div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Preview</div>
            </div>

            <div className="relative bg-zinc-50 p-4 dark:bg-zinc-900/40">
              <div className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <div className="absolute inset-0 bg-linear-to-br from-white to-zinc-50 dark:from-zinc-950 dark:to-zinc-900" />
                <div className="relative p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-[11px] font-semibold text-zinc-900 dark:text-zinc-100">{s.badge}</div>
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400">FYB</div>
                  </div>
                  <div className="mt-3 text-lg font-semibold tracking-tight text-zinc-950 dark:text-zinc-100">
                    {s.value}
                  </div>
                  <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">{s.sub}</div>
                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <div className="h-9 rounded-xl bg-zinc-50 dark:bg-zinc-800/60" />
                    <div className="h-9 rounded-xl bg-emerald-600/90" />
                  </div>
                </div>
              </div>

              {/* Bottom sheet */}
              <div
                className={
                  "mt-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 " +
                  (reduceMotion ? "" : "animate-[fybFloat_2.6s_ease-in-out_infinite]")
                }
              >
                <div className="flex items-center justify-between">
                  <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">Edit</div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Auto-save</div>
                </div>
                <div className="mt-3 space-y-2">
                  <WorkspaceField
                    label={s.field}
                    value={s.value}
                    active
                    reduceMotion={reduceMotion}
                    compact
                  />
                </div>
                <div className="mt-3 h-1 overflow-hidden rounded-full bg-zinc-200/70 dark:bg-zinc-700/50">
                  <div
                    className={
                      "h-1 rounded-full bg-emerald-500/80 " +
                      (reduceMotion
                        ? "w-[78%]"
                        : "w-[78%] animate-[fybProgress_2.2s_cubic-bezier(0.22,1,0.36,1)_infinite]")
                    }
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkspaceField({
  label,
  value,
  active,
  reduceMotion,
  compact,
}: {
  label: string;
  value: string;
  active?: boolean;
  reduceMotion: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={
        "rounded-xl border px-3 py-2 transition " +
        (active
          ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/40 dark:bg-emerald-900/10"
          : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950/40")
      }
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">{label}</div>
        {active ? (
          <div className="text-[10px] font-medium text-emerald-700 dark:text-emerald-300">Typing</div>
        ) : null}
      </div>
      <div className={(compact ? "mt-1 text-xs" : "mt-1 text-[11px]") + " font-semibold text-zinc-900 dark:text-zinc-100"}>
        {value}
        <span
          className={
            "ml-1 inline-block h-3 w-0.5 translate-y-px bg-zinc-900/60 align-middle dark:bg-zinc-100/60 " +
            (active && !reduceMotion
              ? "animate-[fybBlink_1.1s_steps(2,end)_infinite]"
              : "opacity-0")
          }
        />
      </div>
    </div>
  );
}

function HowStepChip({
  index,
  active,
  title,
}: {
  index: number;
  active: boolean;
  title: string;
}) {
  return (
    <div
      className={
        "flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-sm transition " +
        (active
          ? "border-zinc-200 bg-white text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
          : "border-zinc-200/70 bg-white/60 text-zinc-700 dark:border-zinc-800/70 dark:bg-zinc-900/40 dark:text-zinc-200")
      }
    >
      <div
        className={
          "grid h-7 w-7 place-items-center rounded-xl text-[11px] font-semibold " +
          (active
            ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
            : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200")
        }
      >
        {index + 1}
      </div>
      <div className="text-sm font-medium">{title}</div>
    </div>
  );
}

function HowVisual({
  step,
  reduceMotion,
}: {
  step: 0 | 1 | 2;
  reduceMotion: boolean;
}) {
  return (
    <div className="relative">
      <div className="grid gap-4 sm:grid-cols-12">
        <div className="sm:col-span-5">
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between">
              <div className="h-2.5 w-24 rounded-full bg-zinc-100 dark:bg-zinc-800" />
              <div className="h-2.5 w-10 rounded-full bg-zinc-100 dark:bg-zinc-800" />
            </div>
            <div className="mt-4 space-y-3">
              <div className="h-24 rounded-xl bg-zinc-50 dark:bg-zinc-800/60" />
              <div className="h-9 rounded-xl bg-zinc-50 dark:bg-zinc-800/60" />
              <div className="h-9 rounded-xl bg-zinc-50 dark:bg-zinc-800/60" />
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">Details</div>
              <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Auto-styled</div>
            </div>
            <div className="mt-3 space-y-3">
              <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/40">
                <div className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">Name</div>
                <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                  Amina Okafor
                  <span className="inline-block h-3 w-0.5 translate-y-px bg-zinc-900/60 align-middle animate-[fybBlink_1.1s_steps(2,end)_infinite] motion-reduce:animate-none dark:bg-zinc-100/60" />
                </div>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/40">
                <div className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">Design text</div>
                <div className="mt-2 h-2 rounded-full bg-zinc-200/70 dark:bg-zinc-700/60">
                  <div
                    className={
                      "h-2 rounded-full bg-emerald-500/80 " +
                      (reduceMotion
                        ? "w-[82%]"
                        : "w-[82%] animate-[fybFill_1.6s_cubic-bezier(0.22,1,0.36,1)_infinite]")
                    }
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="sm:col-span-7">
          <div className="relative h-70 overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-50 shadow-sm dark:border-zinc-800 dark:bg-zinc-800/30 sm:h-80">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.06)_1px,transparent_0)] bg-size-[14px_14px] opacity-35 dark:opacity-20" />

            {/* Step layers */}
            <div
              className={
                "absolute inset-0 p-5 transition-all duration-700 ease-out motion-reduce:transition-none " +
                (step === 0 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3")
              }
              aria-hidden={step !== 0}
            >
              <div className="h-full rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-center justify-between">
                  <div className="h-3 w-36 rounded-full bg-zinc-100 dark:bg-zinc-800" />
                  <div className="rounded-xl bg-zinc-900 px-3 py-2 text-[11px] font-semibold text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900">
                    Choose
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="h-24 rounded-xl bg-zinc-50 ring-2 ring-emerald-500/40 dark:bg-zinc-800/60" />
                  <div className="h-24 rounded-xl bg-zinc-50 dark:bg-zinc-800/60" />
                  <div className="h-24 rounded-xl bg-zinc-50 dark:bg-zinc-800/60" />
                  <div className="h-24 rounded-xl bg-zinc-50 dark:bg-zinc-800/60" />
                </div>
              </div>
            </div>

            <div
              className={
                "absolute inset-0 p-5 transition-all duration-700 ease-out motion-reduce:transition-none " +
                (step === 1 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3")
              }
              aria-hidden={step !== 1}
            >
              <div className="h-full rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-center justify-between">
                  <div className="h-3 w-40 rounded-full bg-zinc-100 dark:bg-zinc-800" />
                  <div className="rounded-xl bg-zinc-900 px-3 py-2 text-[11px] font-semibold text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900">
                    Personalize
                  </div>
                </div>
                <div className="mt-5 space-y-3">
                  <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/40">
                    <div className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">Name</div>
                    <div className="mt-1 text-xs font-semibold text-zinc-900 dark:text-zinc-100">Amina Okafor</div>
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/40">
                    <div className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">Department</div>
                    <div className="mt-1 text-xs font-semibold text-zinc-900 dark:text-zinc-100">Computer Science</div>
                  </div>
                  <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950/40">
                    <div className="text-[10px] font-medium text-zinc-500 dark:text-zinc-400">Date</div>
                    <div className="mt-1 text-xs font-semibold text-zinc-900 dark:text-zinc-100">January 2026</div>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-emerald-600/90 px-4 py-3 text-xs font-semibold text-white shadow-sm">
                    <span>Preview updated</span>
                    <span className="inline-flex items-center gap-2">
                      <span className="h-1.5 w-1.5 rounded-full bg-white/90" />
                      Saved
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div
              className={
                "absolute inset-0 p-5 transition-all duration-700 ease-out motion-reduce:transition-none " +
                (step === 2 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3")
              }
              aria-hidden={step !== 2}
            >
              <div className="h-full rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex items-center justify-between">
                  <div className="h-3 w-32 rounded-full bg-zinc-100 dark:bg-zinc-800" />
                  <div className="rounded-xl bg-zinc-900 px-3 py-2 text-[11px] font-semibold text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900">
                    Export PNG
                  </div>
                </div>
                <div className="mt-5 rounded-2xl bg-zinc-50 p-5 dark:bg-zinc-800/60">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">Exporting…</div>
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400">High quality</div>
                  </div>
                  <div className="mt-4 h-2 rounded-full bg-zinc-200/70 dark:bg-zinc-700/60">
                    <div
                      className={
                        "h-2 rounded-full bg-zinc-900 dark:bg-zinc-100 " +
                        (reduceMotion ? "w-[92%]" : "animate-[fybProgress_1.8s_ease-in-out_infinite]")
                      }
                    />
                  </div>
                  <div className="mt-4 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
                    <span>PNG • Transparent-safe</span>
                    <span className="inline-flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Ready
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-linear-to-t from-zinc-950/10 to-transparent dark:from-black/25" />
          </div>
        </div>
      </div>
    </div>
  );
}

function TeaserTile({
  template,
  onActivate,
}: {
  template: PublicTemplateListItem;
  onActivate?: (e: MouseEvent, t: PublicTemplateListItem) => void;
}) {
  return (
    <Link
      href={`/templates/${template.id}/use`}
      onClick={onActivate ? (e) => onActivate(e, template) : undefined}
      className="group block"
    >
      <div className="relative w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800/60">
        <div className="aspect-4/5 w-full" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={template.coverUrl}
          alt={`${template.name} preview`}
          className="absolute inset-0 h-full w-full object-contain p-3 transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transition-none"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-linear-to-t from-zinc-950/10 to-transparent dark:from-black/25" />
      </div>
    </Link>
  );
}


