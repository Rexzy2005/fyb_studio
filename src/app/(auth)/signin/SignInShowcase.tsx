"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { GraduationCap } from "lucide-react";

const jkt: CSSProperties = { fontFamily: "var(--font-plus-jakarta, var(--font-geist-sans)), sans-serif" };
const mono: CSSProperties = { fontFamily: "var(--font-geist-mono), monospace" };
const sans: CSSProperties = { fontFamily: "var(--font-geist-sans), sans-serif" };

type Slide = {
  kind: "welcome" | "speed" | "price" | "export";
  eyebrow: string;
  title: string;
  subtitle: string;
  accent: string;
  /** The brand-typographic mark that REPLACES generic iconography */
  mark: { primary: string; secondary?: string };
};

const SLIDE_DURATION_MS = 4500;

export function SignInShowcase({ classYear }: { classYear: number }) {
  const SLIDES: Slide[] = [
    {
      kind: "welcome",
      eyebrow: "One-tap sign in",
      title: "Sign in to FYB Studio",
      subtitle: "Continue with Google. Your designs, edits, and downloads all where you left them.",
      accent: "#FFD700",
      mark: { primary: `'${String(classYear).slice(-2)}`, secondary: `Class of ${classYear}` },
    },
    {
      kind: "speed",
      eyebrow: "Designer-built",
      title: "Done in five minutes",
      subtitle: "From login to print-ready file. No briefs. No DMs. No waiting on a designer.",
      accent: "#FF8C42",
      mark: { primary: "5", secondary: "Minutes" },
    },
    {
      kind: "price",
      eyebrow: "One flat price",
      title: "₦1,000 per design",
      subtitle: "Pay only when you export. Edit forever, free. No subscription, no mystery quote.",
      accent: "#FFD700",
      mark: { primary: "₦1K", secondary: "Per design" },
    },
    {
      kind: "export",
      eyebrow: "Print-ready",
      title: "Hi-res PNG, on every device",
      subtitle: "Card, transfer, or USSD via Paystack. Download in two taps. Re-export free.",
      accent: "#4ECDC4",
      mark: { primary: "PNG", secondary: "Hi-res" },
    },
  ];

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [dragX, setDragX] = useState(0);
  const intervalRef = useRef<number | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const goTo = (next: number) => {
    setIndex(((next % SLIDES.length) + SLIDES.length) % SLIDES.length);
  };

  // Auto-advance (paused on hover/drag)
  useEffect(() => {
    if (paused) return;
    intervalRef.current = window.setInterval(() => {
      setIndex((i) => (i + 1) % SLIDES.length);
    }, SLIDE_DURATION_MS);
    return () => {
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
    };
  }, [paused, SLIDES.length]);

  // Brief pause after user interacts, so they have time to read
  const pauseAfterInteraction = (ms = 4500) => {
    setPaused(true);
    window.setTimeout(() => setPaused(false), ms);
  };

  // Touch / pointer swipe handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
    setPaused(true);
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;
    // Only treat as horizontal swipe if horizontal motion dominates
    if (Math.abs(dx) > Math.abs(dy)) {
      setDragX(dx);
    }
  };
  const handleTouchEnd = () => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    const offset = dragX;
    setDragX(0);
    if (!start) return;
    const dt = Date.now() - start.t;
    // Swipe threshold: 50px OR a quick flick (<300ms with 30px+)
    const fastFlick = dt < 300 && Math.abs(offset) > 30;
    const longSwipe = Math.abs(offset) > 60;
    if (fastFlick || longSwipe) {
      if (offset < 0) goTo(index + 1);
      else goTo(index - 1);
      pauseAfterInteraction();
    } else {
      // Snap back, no slide change
      setPaused(false);
    }
  };

  const current = SLIDES[index];

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full flex-col overflow-hidden touch-pan-y select-none"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      style={{ minHeight: "320px" }}
    >
      {/* Spotlight beams */}
      <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0 }}>
        {[
          { l: "10%", w: "30%", c: "rgba(255,215,0,0.06)", d: 6, dl: 0 },
          { l: "40%", w: "26%", c: "rgba(255,140,66,0.05)", d: 7, dl: 1.6 },
          { l: "70%", w: "26%", c: "rgba(168,85,247,0.04)", d: 8, dl: 3 },
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

      {/* Floating graduation caps (ambient) */}
      <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0 }}>
        {[
          { l: "8%",  t: "16%", s: 28, op: 0.14, d: 0,   sp: 18 },
          { l: "84%", t: "22%", s: 24, op: 0.12, d: 1.4, sp: 22 },
          { l: "14%", t: "78%", s: 32, op: 0.13, d: 2.8, sp: 24 },
          { l: "82%", t: "78%", s: 26, op: 0.13, d: 0.7, sp: 20 },
        ].map((c, i) => (
          <div
            key={i}
            className="nv-float-slow"
            style={{
              position: "absolute", left: c.l, top: c.t,
              color: "#FFD700", opacity: c.op,
              animationDelay: `${c.d}s`,
            }}
          >
            <div className="nv-spin-slow" style={{ animationDuration: `${c.sp}s` }}>
              <GraduationCap size={c.s} strokeWidth={1.5} />
            </div>
          </div>
        ))}
      </div>

      {/* Top: tag + swipe hint. Extra top padding on mobile to clear the
          floating header in the sign-in page layout */}
      <div
        className="relative z-10 flex items-center justify-between gap-2 px-6 sm:px-10 lg:px-12 lg:pt-12"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 64px)" }}
      >
        <div className="flex items-center gap-2">
          <span style={{ position: "relative", width: 7, height: 7, display: "inline-flex" }}>
            <span className="nv-pulse-ring" style={{ position: "absolute", inset: 0, border: "1.5px solid rgba(255,215,0,0.55)", borderRadius: "50%" }} />
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#FFD700" }} />
          </span>
          <span style={{ ...mono, fontSize: 10, letterSpacing: "0.3em", color: "rgba(255,215,0,0.7)", textTransform: "uppercase", fontWeight: 700 }}>
            What you get
          </span>
        </div>
        {/* Mobile-only swipe hint */}
        <div
          className="lg:hidden flex items-center gap-1"
          style={{
            ...mono, fontSize: 8, letterSpacing: "0.2em",
            color: "rgba(255,215,0,0.45)", textTransform: "uppercase",
          }}
          aria-hidden
        >
          <span>↤</span> swipe <span>↦</span>
        </div>
      </div>

      {/* Center: slide content with crossfade + drag offset */}
      <div
        className="relative z-10 flex flex-1 flex-col justify-center px-6 sm:px-10 lg:px-12"
        style={{
          transform: `translateX(${dragX * 0.3}px)`,
          transition: dragX === 0 ? "transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1)" : "none",
        }}
      >
        {SLIDES.map((slide, i) => {
          const active = i === index;
          return (
            <div
              key={slide.kind}
              aria-hidden={!active}
              style={{
                position: active ? "relative" : "absolute",
                top: active ? undefined : "50%",
                left: active ? undefined : "12%",
                right: active ? undefined : "12%",
                transform: active ? "translateY(0)" : "translateY(20px)",
                opacity: active ? 1 : 0,
                transition: "opacity 600ms cubic-bezier(0.16, 1, 0.3, 1), transform 600ms cubic-bezier(0.16, 1, 0.3, 1)",
                pointerEvents: active ? "auto" : "none",
              }}
            >
              {/* Eyebrow */}
              <div
                style={{
                  ...mono, fontSize: 11, letterSpacing: "0.24em",
                  color: `${slide.accent}cc`, textTransform: "uppercase",
                  fontWeight: 700, marginBottom: 18,
                }}
              >
                {slide.eyebrow}
              </div>

              {/* Typographic mark — replaces generic iconography */}
              <div
                className="mb-5 lg:mb-7 inline-flex items-baseline gap-3"
                style={{
                  padding: "10px 0",
                }}
              >
                <span
                  style={{
                    ...jkt, fontWeight: 900,
                    fontSize: "clamp(72px, 14vw, 128px)",
                    lineHeight: 0.85,
                    letterSpacing: "-0.05em",
                    fontVariantNumeric: "tabular-nums",
                    background: `linear-gradient(160deg, ${slide.accent}, #fff 90%)`,
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                    filter: `drop-shadow(0 16px 40px ${slide.accent}50)`,
                  }}
                >
                  {slide.mark.primary}
                </span>
                {slide.mark.secondary && (
                  <span
                    style={{
                      ...mono, fontSize: 11, letterSpacing: "0.22em",
                      color: `${slide.accent}cc`, textTransform: "uppercase",
                      fontWeight: 700,
                      paddingBottom: 8,
                    }}
                  >
                    {slide.mark.secondary}
                  </span>
                )}
              </div>

              {/* Title */}
              <h2
                style={{
                  ...jkt, fontWeight: 900,
                  fontSize: "clamp(26px, 6vw, 52px)",
                  lineHeight: 1,
                  letterSpacing: "-0.03em",
                  color: "#fff",
                  marginBottom: 12,
                  maxWidth: "18ch",
                }}
              >
                {slide.title}
              </h2>

              {/* Subtitle */}
              <p
                style={{
                  ...sans,
                  fontSize: "clamp(13px, 1.3vw, 15px)",
                  lineHeight: 1.55,
                  color: "rgba(255,255,255,0.6)",
                  maxWidth: "44ch",
                }}
              >
                {slide.subtitle}
              </p>
            </div>
          );
        })}
      </div>

      {/* Bottom: progress bar + dots */}
      <div className="relative z-10 px-6 pb-6 sm:px-10 lg:px-12 lg:pb-12">
        {/* Progress bar */}
        <div
          style={{
            height: 2,
            background: "rgba(255,215,0,0.1)",
            borderRadius: 2,
            overflow: "hidden",
            marginBottom: 20,
          }}
        >
          <div
            key={`bar-${index}-${paused}`}
            style={{
              height: "100%",
              background: `linear-gradient(90deg, ${current.accent}, #FFD700)`,
              width: paused ? "30%" : "100%",
              transformOrigin: "left",
              transition: paused
                ? "width 200ms ease"
                : `width ${SLIDE_DURATION_MS}ms linear`,
              boxShadow: `0 0 8px ${current.accent}`,
            }}
          />
        </div>

        {/* Step indicator + dots */}
        <div className="flex items-center justify-between">
          <div
            style={{
              ...mono, fontSize: 10, letterSpacing: "0.18em",
              color: "rgba(255,255,255,0.4)", textTransform: "uppercase",
            }}
          >
            {String(index + 1).padStart(2, "0")} / {String(SLIDES.length).padStart(2, "0")}
          </div>
          <div className="flex items-center gap-1.5">
            {SLIDES.map((s, i) => {
              const active = i === index;
              return (
                <button
                  key={s.kind}
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-label={`Slide ${i + 1}: ${s.title}`}
                  className="rounded-full transition-all"
                  style={{
                    height: 6,
                    width: active ? 28 : 6,
                    background: active ? s.accent : "rgba(255,255,255,0.18)",
                    boxShadow: active ? `0 0 12px ${s.accent}80` : "none",
                    border: "none",
                    cursor: "pointer",
                  }}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
