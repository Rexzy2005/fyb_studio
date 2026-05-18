"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";

import { useSession } from "next-auth/react";
import { HeaderAuthSlot } from "@/components/auth/HeaderAuthSlot";
import { GraduationCap } from "lucide-react";

/* ─── Type tokens ────────────────────────────────────────── */
const jkt: CSSProperties = {
  fontFamily: "var(--font-plus-jakarta, var(--font-geist-sans)), sans-serif",
};
const mono: CSSProperties = { fontFamily: "var(--font-geist-mono), monospace" };
const sans: CSSProperties = { fontFamily: "var(--font-geist-sans), sans-serif" };

/* ─── Hooks ──────────────────────────────────────────────── */
function getClassYear() {
  const now = new Date();
  return now.getMonth() >= 7 ? now.getFullYear() + 1 : now.getFullYear();
}

function fybTarget(classYear: number): Date {
  const d = new Date(classYear, 4, 15);
  return d > new Date() ? d : new Date(classYear + 1, 4, 15);
}

type Tick = { d: string; h: string; m: string; s: string } | null;

function useCountdown(target: Date): Tick {
  const [tick, setTick] = useState<Tick>(null);
  useEffect(() => {
    function compute() {
      const diff = Math.max(0, target.getTime() - Date.now());
      setTick({
        d: String(Math.floor(diff / 864e5)).padStart(2, "0"),
        h: String(Math.floor((diff % 864e5) / 36e5)).padStart(2, "0"),
        m: String(Math.floor((diff % 36e5) / 6e4)).padStart(2, "0"),
        s: String(Math.floor((diff % 6e4) / 1e3)).padStart(2, "0"),
      });
    }
    compute();
    const id = setInterval(compute, 1000);
    return () => clearInterval(id);
  }, [target]);
  return tick;
}

function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { el.classList.add("nv-visible"); obs.disconnect(); } },
      { threshold: 0.07 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return ref;
}

function useStagger() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { el.classList.add("nv-visible"); obs.disconnect(); } },
      { threshold: 0.06 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return ref;
}

function useCounter(target: number, duration = 1400) {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        obs.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const p = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - p, 4);
          setValue(Math.floor(eased * target));
          if (p < 1) requestAnimationFrame(tick);
          else setValue(target);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.4 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [target, duration]);
  return { value, ref };
}


/* ─── Page ───────────────────────────────────────────────── */
const WELCOME_STORAGE_KEY = "fyb_welcomed_v1";

// External-store snapshot: returns true if the visitor has already seen the
// welcome ceremony. Read at render time via useSyncExternalStore so we avoid
// setState-in-effect and stay hydration-safe (SSR snapshot = true → no modal
// in server HTML; client snapshot flips to false post-hydration for new
// visitors). The `tick` ref lets the close handler force a re-snapshot.
const welcomeStore = (() => {
  const listeners = new Set<() => void>();
  return {
    subscribe(cb: () => void) {
      listeners.add(cb);
      return () => { listeners.delete(cb); };
    },
    getSnapshot(): boolean {
      try { return window.localStorage.getItem(WELCOME_STORAGE_KEY) === "1"; }
      catch { return false; }
    },
    getServerSnapshot(): boolean {
      return true;
    },
    markWelcomed() {
      try { window.localStorage.setItem(WELCOME_STORAGE_KEY, "1"); }
      catch { /* ignore */ }
      listeners.forEach((cb) => cb());
    },
  };
})();

export default function Home() {
  const classYear = getClassYear();
  const hasWelcomed = useSyncExternalStore(
    welcomeStore.subscribe,
    welcomeStore.getSnapshot,
    welcomeStore.getServerSnapshot,
  );

  // Ceremony state machine. Curtain (`loading`) plays on every visit so the
  // brand entrance is consistent. The celebration modal only shows for
  // first-time visitors - returning users skip straight to `done` once the
  // curtain finishes.
  const [phase, setPhase] = useState<"loading" | "celebration" | "done">("loading");

  const showLoading = phase === "loading";
  const showCelebration = !hasWelcomed && phase === "celebration";

  // Lock body scroll for the curtain (always) and the celebration modal
  // (when shown). Released once the user dismisses, or once a returning
  // visitor's curtain finishes.
  useEffect(() => {
    const locked = showLoading || showCelebration;
    if (!locked) return;
    const prevOverflow = document.body.style.overflow;
    const prevOverscroll = document.body.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.body.style.overscrollBehavior = "none";
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.overscrollBehavior = prevOverscroll;
    };
  }, [showLoading, showCelebration]);

  const handleLoadingDone = useCallback(() => {
    // First-timers see the celebration; returning visitors skip it.
    setPhase(welcomeStore.getSnapshot() ? "done" : "celebration");
  }, []);

  const handleCelebrationClose = useCallback(() => {
    setPhase("done");
    welcomeStore.markWelcomed();
  }, []);

  return (
    <>
      {showLoading && <LoadingScreen onDone={handleLoadingDone} />}
      {showCelebration && <CelebrationModal classYear={classYear} onClose={handleCelebrationClose} />}
      {/* Fractal noise overlay */}
      <div
        aria-hidden
        style={{
          position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundRepeat: "repeat", backgroundSize: "200px 200px",
          opacity: 0.03, mixBlendMode: "overlay",
        }}
      />
      {/* Moving scan line */}
      <div
        aria-hidden
        style={{
          position: "fixed", top: 0, left: 0, right: 0, height: 2, zIndex: 1,
          background: "linear-gradient(to bottom, transparent, rgba(255,255,255,0.06), transparent)",
          animation: "nv-scan 8s linear infinite",
          pointerEvents: "none",
        }}
      />

      <div className="relative min-h-dvh overflow-x-clip"
        style={{ background: "#050505", color: "#fff", ...jkt }}>
        <AuroraCursor />
        <CapArcOnScroll />
        <TopNav />
        <Hero classYear={classYear} />
        <MarqueeStrip />
        <StatsStrip />
        <HowItWorks />
        <WallOfClass classYear={classYear} />
        <MemoryLane classYear={classYear} />
        <DepartmentSection />
        <PricingSection />
        <FaqSection />
        <ClosingCta classYear={classYear} />
        <FooterSection classYear={classYear} />
      </div>

      <MobileBottomNav />
    </>
  );
}

/* ─── Top Nav ────────────────────────────────────────────── */
const NAV_LINKS = [
  ["Templates", "/templates"],
  ["How it works", "#how"],
  ["Departments", "#departments"],
  ["Pricing", "#pricing"],
  ["FAQ", "#faq"],
] as const;

function TopNav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const classYear = getClassYear();
  const { status } = useSession();
  // Auth-aware CTA: hide "Get started" / "Sign in" once the user is signed in.
  // Their avatar slot covers navigation from that point on.
  const isAuthed = status === "authenticated";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  return (
    <>
      <header
        className="sticky top-0 z-30"
        style={{
          borderBottom: scrolled ? "1px solid rgba(255,215,0,0.14)" : "1px solid rgba(255,255,255,0.04)",
          backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
          background: scrolled ? "rgba(6,6,6,0.92)" : "rgba(6,6,6,0.55)",
          transition: "background 280ms ease, border-color 280ms ease, box-shadow 280ms ease",
          boxShadow: scrolled ? "0 8px 30px rgba(0,0,0,0.4)" : "none",
        }}
      >
        <div className="mx-auto flex h-16 items-center justify-between gap-3 px-4 sm:gap-6 sm:px-8 lg:px-10"
          style={{ maxWidth: 1480 }}>

          {/* Brand mark - logo is the "FYB" so it reads `[logo]studio` as one
              continuous unit. Class-year micro-text sits below. */}
          <Link href="/" className="flex shrink-0 items-center gap-1.5 group">
            <span
              aria-hidden
              style={{
                position: "relative",
                display: "inline-flex",
                width: 36, height: 36,
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo.jpg"
                alt="FYB"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </span>
            <span style={{ ...jkt, fontSize: 18, fontWeight: 700, color: "#fff", letterSpacing: "-0.02em", lineHeight: 1 }}>
              studio
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-1">
            {NAV_LINKS.map(([label, href]) => (
              <Link
                key={label}
                href={href}
                className="relative inline-flex items-center"
                style={{
                  ...mono, fontSize: 11, letterSpacing: "0.08em",
                  color: "rgba(255,255,255,0.55)", textDecoration: "none",
                  padding: "8px 14px", borderRadius: 8,
                  transition: "color 200ms, background 200ms",
                  textTransform: "uppercase",
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.color = "#fff";
                  e.currentTarget.style.background = "rgba(255,215,0,0.06)";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.color = "rgba(255,255,255,0.55)";
                  e.currentTarget.style.background = "transparent";
                }}
              >
                {label}
              </Link>
            ))}
          </nav>

          {/* Right cluster */}
          <div className="flex shrink-0 items-center gap-2">
            {/* Avatar slot is only rendered once authenticated - the unauth
                "Sign in" fallback is intentionally hidden here so the navbar
                shows just one CTA ("Get started"). */}
            {isAuthed && (
              <div className="hidden sm:block">
                <HeaderAuthSlot />
              </div>
            )}
            {!isAuthed && (
              <Link
                href="/signin"
                className="nv-laser-btn hidden lg:inline-flex"
                style={{
                  height: 40, padding: "0 22px",
                  borderRadius: 8, fontSize: 11,
                  letterSpacing: "0.1em", ...mono,
                  alignItems: "center", gap: 8,
                  textTransform: "uppercase",
                }}
              >
                Get started
              </Link>
            )}
            {/* Mobile hamburger */}
            <button
              type="button"
              aria-label={mobileOpen ? "Close menu" : "Open menu"}
              onClick={() => setMobileOpen(v => !v)}
              className="lg:hidden inline-flex items-center justify-center"
              style={{
                width: 40, height: 40, borderRadius: 10,
                border: "1px solid rgba(255,215,0,0.22)",
                background: "rgba(255,215,0,0.05)",
                color: "#FFD700",
              }}
            >
              {mobileOpen ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Section underline gradient - only when scrolled */}
        {scrolled && (
          <div
            aria-hidden
            style={{
              position: "absolute", left: 0, right: 0, bottom: -1, height: 1,
              background: "linear-gradient(90deg, transparent, rgba(255,215,0,0.4), rgba(255,107,107,0.4), rgba(168,85,247,0.4), transparent)",
            }}
          />
        )}
      </header>

      {/* Mobile menu drawer */}
      {mobileOpen && (
        <div
          className="lg:hidden"
          style={{
            position: "fixed", inset: 0,
            zIndex: 60,
            background: "rgba(5,5,5,0.97)",
            backdropFilter: "blur(20px)",
            paddingTop: 64,
            display: "flex", flexDirection: "column",
          }}
          onClick={() => setMobileOpen(false)}
        >
          <nav className="flex flex-col p-6 gap-2" style={{ flex: 1 }}>
            {NAV_LINKS.map(([label, href], i) => (
              <Link
                key={label}
                href={href}
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 py-3"
                style={{
                  ...jkt, fontSize: 22, fontWeight: 800, color: "#fff",
                  letterSpacing: "-0.02em", borderBottom: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <span style={{ ...mono, fontSize: 9, color: "rgba(255,215,0,0.5)", minWidth: 28 }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                {label}
              </Link>
            ))}

            {!isAuthed && (
              <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 12 }}>
                <Link
                  href="/signin"
                  onClick={() => setMobileOpen(false)}
                  className="nv-laser-btn"
                  style={{ height: 56, padding: "0 28px", borderRadius: 10, fontSize: 13, letterSpacing: "0.1em", ...mono, display: "inline-flex", alignItems: "center", justifyContent: "center", textTransform: "uppercase" }}
                >
                  Get started
                </Link>
              </div>
            )}
          </nav>
          <div style={{ padding: "20px 24px", borderTop: "1px solid rgba(255,255,255,0.05)", textAlign: "center", ...mono, fontSize: 9, letterSpacing: "0.22em", color: "rgba(255,215,0,0.4)", textTransform: "uppercase" }}>
            FYB Studio · Class of {classYear}
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Floating graduation hats background ────────────────── */

const HAT_POSITIONS = [
  { x: "7%",  y: "18%", sz: 40, op: 0.18, dur: 13, delay: 0,   spin: false },
  { x: "21%", y: "70%", sz: 30, op: 0.14, dur: 10, delay: 2.8, spin: true  },
  { x: "38%", y: "32%", sz: 48, op: 0.16, dur: 15, delay: 4.2, spin: false },
  { x: "60%", y: "60%", sz: 32, op: 0.13, dur: 11, delay: 1.1, spin: true  },
  { x: "76%", y: "22%", sz: 46, op: 0.19, dur: 14, delay: 5.6, spin: false },
  { x: "88%", y: "66%", sz: 26, op: 0.14, dur: 9,  delay: 3.3, spin: true  },
  { x: "48%", y: "80%", sz: 42, op: 0.15, dur: 16, delay: 6.7, spin: false },
  { x: "13%", y: "52%", sz: 24, op: 0.13, dur: 10, delay: 7.1, spin: true  },
  { x: "68%", y: "42%", sz: 36, op: 0.17, dur: 17, delay: 2.4, spin: false },
  { x: "32%", y: "86%", sz: 28, op: 0.14, dur: 11, delay: 8.2, spin: true  },
  { x: "53%", y: "12%", sz: 44, op: 0.16, dur: 14, delay: 3.8, spin: false },
  { x: "82%", y: "86%", sz: 22, op: 0.13, dur: 8,  delay: 5.3, spin: true  },
] as const;

function FloatingHats() {
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0, overflow: "hidden" }}>
      {HAT_POSITIONS.map((h, i) => (
        <div key={i} style={{
          position: "absolute", left: h.x, top: h.y,
          animation: `nv-hat-drift ${h.dur}s ease-in-out ${h.delay}s infinite`,
        }}>
          <div style={{
            opacity: h.op,
            color: "#FFD700",
            ...(h.spin ? { animation: `nv-spin-cw ${h.dur * 5}s linear ${h.delay}s infinite` } : {}),
          }}>
            <GraduationCap size={h.sz} strokeWidth={1.5} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Cap toss launch (initial load - 14 caps fly across the sky) ── */
// Deterministic seeded values - Math.random would cause SSR/CSR hydration
// mismatches because the module re-evaluates on the client with new values.
const TOSS_CAPS = Array.from({ length: 14 }).map((_, i) => {
  const seedA = Math.sin(i * 12.9898 + 1) * 43758.5453;
  const seedB = Math.sin(i * 78.233 + 2) * 43758.5453;
  const seedC = Math.sin(i * 39.346 + 3) * 43758.5453;
  const seedD = Math.sin(i * 91.5347 + 4) * 43758.5453;
  const seedE = Math.sin(i * 27.917 + 5) * 43758.5453;
  const rA = seedA - Math.floor(seedA);
  const rB = seedB - Math.floor(seedB);
  const rC = seedC - Math.floor(seedC);
  const rD = seedD - Math.floor(seedD);
  const rE = seedE - Math.floor(seedE);
  const left = 5 + i * 6.5 + rA * 3;
  const x = (rB - 0.5) * 70; // vw of horizontal arc
  const delay = i * 0.08 + rC * 0.2;
  const dur = 2.8 + rD * 1.6;
  const sz = 24 + Math.floor(rE * 22);
  const color = ["#FFD700", "#FF8C42", "#FF6B6B", "#4ECDC4", "#A855F7"][i % 5];
  return { left, x, delay, dur, sz, color };
});

function CapTossLayer() {
  // Defer to client-only render. Avoids any chance of hydration mismatch from
  // floating-point precision drift between server and client when computing
  // the pseudo-random positions/sizes. setState lives inside setTimeout so
  // the effect itself is async-only (React 19 purity-rule compliant).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(id);
  }, []);
  if (!mounted) return null;
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 1 }}>
      {TOSS_CAPS.map((c, i) => (
        <div
          key={i}
          className="nv-cap-toss"
          style={{
            position: "absolute",
            left: `${c.left}%`,
            bottom: "-40px",
            color: c.color,
            ["--cap-x" as string]: `${c.x}vw`,
            ["--cap-delay" as string]: `${c.delay}s`,
            ["--cap-dur" as string]: `${c.dur}s`,
            filter: `drop-shadow(0 4px 12px ${c.color}40)`,
          }}
        >
          <GraduationCap size={c.sz} strokeWidth={1.8} />
        </div>
      ))}
    </div>
  );
}

/* ─── Spotlight beams (stadium feel) ── */
function SpotlightLayer() {
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0 }}>
      {/* Three angled beams */}
      {[
        { top: "-20%", left: "-10%", w: "30%", h: "140%", color: "rgba(255,215,0,0.07)", dur: 6, delay: 0 },
        { top: "-20%", left: "20%",  w: "22%", h: "140%", color: "rgba(255,140,66,0.05)", dur: 7, delay: 1.8 },
        { top: "-20%", left: "55%",  w: "26%", h: "140%", color: "rgba(168,85,247,0.05)", dur: 8, delay: 3.4 },
      ].map((b, i) => (
        <div
          key={i}
          className="nv-spotlight"
          style={{
            position: "absolute",
            top: b.top, left: b.left, width: b.w, height: b.h,
            background: `linear-gradient(180deg, transparent 0%, ${b.color} 20%, ${b.color} 80%, transparent 100%)`,
            transformOrigin: "top center",
            ["--beam-dur" as string]: `${b.dur}s`,
            ["--beam-delay" as string]: `${b.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

/* ─── Aurora cursor follow ── */
function AuroraCursor() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    let tx = window.innerWidth / 2;
    let ty = window.innerHeight / 2;
    let cx = tx, cy = ty;
    const handleMove = (e: globalThis.MouseEvent) => {
      tx = e.clientX;
      ty = e.clientY;
    };
    const tick = () => {
      cx += (tx - cx) * 0.08;
      cy += (ty - cy) * 0.08;
      if (ref.current) {
        ref.current.style.left = `${cx}px`;
        ref.current.style.top = `${cy}px`;
      }
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener("mousemove", handleMove);
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      cancelAnimationFrame(raf);
    };
  }, []);
  return <div ref={ref} className="nv-aurora" aria-hidden />;
}

/* ─── Cap arc on scroll past hero ── */
function CapArcOnScroll() {
  const [show, setShow] = useState(false);
  const [key, setKey] = useState(0);
  const lastFire = useRef(0);
  useEffect(() => {
    const onScroll = () => {
      const trigger = window.innerHeight * 0.6;
      const past = window.scrollY > trigger;
      const now = Date.now();
      if (past && !show && now - lastFire.current > 8000) {
        lastFire.current = now;
        setKey((k) => k + 1);
        setShow(true);
        setTimeout(() => setShow(false), 2600);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [show]);
  if (!show) return null;
  return (
    <div key={key} className="nv-cap-arc" style={{ color: "#FFD700", filter: "drop-shadow(0 8px 24px rgba(255,215,0,0.5))" }}>
      <GraduationCap size={64} strokeWidth={1.5} />
    </div>
  );
}

/* ─── Scoreboard flip number ── */
function FlipNum({ value, color = "#FFD700" }: { value: string; color?: string }) {
  const [display, setDisplay] = useState(value);
  // Derive "flipping" synchronously from value vs display - no setState in effect.
  const flipping = display !== value;
  useEffect(() => {
    if (display === value) return;
    const t = setTimeout(() => setDisplay(value), 250);
    return () => clearTimeout(t);
  }, [value, display]);
  return (
    <span
      className={flipping ? "nv-flip-num" : undefined}
      style={{
        ...mono,
        display: "inline-block",
        minWidth: "1.6ch",
        textAlign: "center",
        fontWeight: 800,
        fontVariantNumeric: "tabular-nums",
        lineHeight: 1,
        background: `linear-gradient(150deg, ${color}, #FF8C42)`,
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
      }}
    >
      {display}
    </span>
  );
}

/* ─── Hero ───────────────────────────────────────────────── */
const AVATAR_COLS = ["rgba(255,215,0,0.2)", "rgba(255,107,107,0.18)", "rgba(78,205,196,0.18)", "rgba(168,85,247,0.18)", "rgba(249,115,22,0.18)"] as const;

function Hero({ classYear }: { classYear: number }) {
  const target = fybTarget(classYear);
  const tick = useCountdown(target);
  const { status } = useSession();
  const isAuthed = status === "authenticated";

  return (
    <section
      className="relative"
      style={{
        minHeight: "calc(100dvh - 64px)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background:
          "radial-gradient(ellipse 80% 45% at 50% 5%, rgba(255,180,0,0.06), transparent 60%), radial-gradient(ellipse 70% 50% at 50% 95%, rgba(168,85,247,0.05), transparent 65%), #060606",
      }}
    >
      <ParticleCanvas />
      <FloatingHats />
      <SpotlightLayer />
      <CapTossLayer />

      {/* Decorative side rails - film-strip vibe */}
      <div aria-hidden className="hidden md:block" style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0 }}>
        <div style={{ position: "absolute", top: 0, bottom: 0, left: "8%", width: 1, background: "linear-gradient(to bottom, transparent, rgba(255,215,0,0.12) 20%, rgba(255,215,0,0.12) 80%, transparent)" }} />
        <div style={{ position: "absolute", top: 0, bottom: 0, right: "8%", width: 1, background: "linear-gradient(to bottom, transparent, rgba(168,85,247,0.12) 20%, rgba(168,85,247,0.12) 80%, transparent)" }} />
      </div>

      {/* Floating poster cards behind the headline - depth/parallax feel */}
      <HeroPosterStack />

      {/* Dot grid (subtle) */}
      <div aria-hidden style={{
        position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0,
        backgroundImage: "radial-gradient(rgba(255,215,0,0.05) 1px, transparent 1px)",
        backgroundSize: "32px 32px",
        maskImage: "radial-gradient(ellipse 75% 65% at 50% 50%, rgba(0,0,0,0.85) 0%, transparent 80%)",
        WebkitMaskImage: "radial-gradient(ellipse 75% 65% at 50% 50%, rgba(0,0,0,0.85) 0%, transparent 80%)",
      }} />

      {/* CENTERED CONTENT STAGE */}
      <div
        className="relative flex-1 mx-auto w-full flex flex-col items-center justify-center text-center"
        style={{
          maxWidth: 1280,
          paddingLeft: "clamp(20px,5vw,72px)",
          paddingRight: "clamp(20px,5vw,72px)",
          paddingTop: "clamp(48px,8vw,96px)",
          paddingBottom: "clamp(100px,10vw,120px)",
          zIndex: 2,
        }}
      >
        {/* Gold eyebrow badge */}
        <div
          style={{
            display: "inline-flex", alignItems: "center", gap: 10,
            border: "1px solid rgba(255,215,0,0.28)", borderRadius: 100,
            padding: "8px 18px 8px 12px",
            background: "rgba(255,215,0,0.06)",
            boxShadow: "0 0 30px rgba(255,215,0,0.08)",
            marginBottom: "clamp(28px,4vw,44px)",
          }}
        >
          <span style={{ position: "relative", width: 8, height: 8, display: "inline-flex" }}>
            <span className="nv-pulse-ring" style={{ position: "absolute", inset: 0, border: "1.5px solid rgba(255,215,0,0.55)", borderRadius: "50%" }} />
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#FFD700" }} />
          </span>
          <span style={{ ...mono, fontSize: 10, letterSpacing: "0.22em", color: "rgba(255,215,0,0.85)", textTransform: "uppercase", fontWeight: 700 }}>
            Class of {classYear} · Live now
          </span>
        </div>

        {/* THE HEADLINE - much bigger, centered, shimmering */}
        <h1
          style={{
            ...jkt, fontWeight: 900,
            textTransform: "uppercase",
            margin: 0,
            lineHeight: 0.84,
            letterSpacing: "-0.04em",
          }}
        >
          <div style={{ fontSize: "clamp(56px, 11vw, 160px)", color: "rgba(255,255,255,0.96)" }}>
            <AnimatedWords text="IT'S YOUR" delay={50} />
          </div>
          <div style={{ fontSize: "clamp(76px, 17vw, 260px)", marginTop: "clamp(4px,0.5vw,8px)" }}>
            <span
              className="nv-shimmer-text nv-stretch"
              style={{ display: "inline-block", whiteSpace: "wrap" }}
            >
              FINAL YEAR
            </span>
          </div>
        </h1>

        {/* Tagline */}
        <p
          style={{
            ...sans,
            fontSize: "clamp(15px, 1.4vw, 19px)",
            lineHeight: 1.55,
            color: "rgba(255,255,255,0.6)",
            maxWidth: "48ch",
            marginTop: "clamp(28px, 4vw, 44px)",
            fontWeight: 500,
          }}
        >
          Designer-built FYB templates. Pick one, drop your details in, walk away with a
          {" "}<span style={{ color: "#FFD700", fontWeight: 600 }}>print-ready PNG in five minutes</span>{" "}
          for ₦1,000 flat. No briefs. No DMs. No waiting list.
        </p>

        {/* Trust strip with separators */}
        <div
          style={{
            marginTop: "clamp(24px,3vw,32px)",
            display: "flex", flexWrap: "wrap",
            alignItems: "center", justifyContent: "center", gap: 14,
            ...mono, fontSize: 10, letterSpacing: "0.18em",
            color: "rgba(255,255,255,0.45)", textTransform: "uppercase",
          }}
        >
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#FFD700" }} />
            ₦1,000 flat
          </span>
          <span style={{ opacity: 0.3 }}>·</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#FF6B6B" }} />
            5-min export
          </span>
          <span style={{ opacity: 0.3 }}>·</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#4ECDC4" }} />
            Print-ready PNG
          </span>
          <span style={{ opacity: 0.3 }}>·</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#A855F7" }} />
            Edit free forever
          </span>
        </div>

        {/* CTAs */}
        <div
          className="flex flex-col sm:flex-row"
          style={{ gap: 14, marginTop: "clamp(32px,4vw,48px)", width: "100%", maxWidth: 520 }}
        >
          <Link
            href="/templates"
            className="nv-laser-btn w-full sm:flex-1"
            style={{ height: 58, padding: "0 36px", borderRadius: 10, fontSize: 13, letterSpacing: "0.06em", ...mono, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 10 }}
          >
            Open the studio
          </Link>
          {!isAuthed && (
          <Link
            href="/signin"
            className="nv-ghost-btn w-full sm:w-auto"
            style={{ height: 58, padding: "0 32px", borderRadius: 10, fontSize: 12, letterSpacing: "0.06em", ...mono, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
          >
            Sign in
          </Link>
          )}
        </div>

        {/* Avatars + countdown stack */}
        <div
          style={{
            marginTop: "clamp(40px,5vw,64px)",
            display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "center",
            gap: "clamp(16px,3vw,32px)",
          }}
        >
          {/* Social proof */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex" }}>
              {["AO", "CS", "EF", "MI", "BT"].map((init, i) => (
                <div
                  key={init}
                  style={{
                    width: 32, height: 32, borderRadius: "50%",
                    background: AVATAR_COLS[i],
                    border: "2px solid rgba(255,215,0,0.25)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    marginLeft: i === 0 ? 0 : -10,
                    zIndex: 5 - i, position: "relative",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
                  }}
                >
                  <span style={{ ...mono, fontSize: 7, fontWeight: 800, color: "rgba(255,255,255,0.95)" }}>{init}</span>
                </div>
              ))}
            </div>
            <div style={{ textAlign: "left" }}>
              <div style={{ ...mono, fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.7)", letterSpacing: "0.05em" }}>
                2,400+ finalists
              </div>
              <div style={{ ...mono, fontSize: 8, letterSpacing: "0.18em", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", marginTop: 1 }}>
                already on stage
              </div>
            </div>
          </div>

          {/* Stadium countdown - now centered & on its own pedestal */}
          {tick && (
            <div
              style={{
                display: "flex", alignItems: "center", gap: 12,
                paddingLeft: 18, paddingRight: 0,
                borderLeft: "1px solid rgba(255,215,0,0.18)",
                perspective: 600,
              }}
            >
              <div>
                <div style={{ ...mono, fontSize: 8, letterSpacing: "0.22em", color: "rgba(255,215,0,0.5)", textTransform: "uppercase", marginBottom: 6 }}>
                  Kick-off in
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  {[{ v: tick.d, u: "D" }, { v: tick.h, u: "H" }, { v: tick.m, u: "M" }, { v: tick.s, u: "S" }].map(({ v, u }, idx) => (
                    <span key={u} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      <span
                        style={{
                          display: "inline-flex",
                          justifyContent: "center",
                          alignItems: "center",
                          minWidth: 38,
                          height: 44,
                          padding: "0 6px",
                          fontSize: "clamp(20px, 2.2vw, 28px)",
                          background: "linear-gradient(180deg, rgba(255,215,0,0.1), rgba(255,140,66,0.05))",
                          border: "1px solid rgba(255,215,0,0.25)",
                          borderRadius: 8,
                          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 8px 24px rgba(255,140,66,0.1)",
                        }}
                      >
                        <FlipNum value={v} color={["#FFD700", "#FF8C42", "#FF6B6B", "#4ECDC4"][idx]} />
                      </span>
                      <span style={{ ...mono, fontSize: 8, letterSpacing: "0.2em", color: "rgba(255,215,0,0.4)" }}>{u}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Scroll cue */}
      <div
        aria-hidden
        style={{
          position: "absolute", bottom: 28, left: "50%", transform: "translateX(-50%)",
          zIndex: 2, display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
        }}
      >
        <span style={{ ...mono, fontSize: 8, letterSpacing: "0.3em", color: "rgba(255,215,0,0.45)", textTransform: "uppercase" }}>
          Walk the journey
        </span>
        <div style={{ width: 1, height: 40, background: "rgba(255,215,0,0.12)", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: "40%", background: "rgba(255,215,0,0.7)", animation: "nv-scan 2s ease-in-out infinite" }} />
        </div>
      </div>
    </section>
  );
}

/* ─── Hero Poster Stack - floating poster cards behind the headline ─── */
const HERO_POSTERS = [
  { rot: -16, x: -42, y: -18, c: "#FFD700",  tag: "FYB · 01", side: "left",  scale: 0.92 },
  { rot:  18, x:  44, y: -22, c: "#A855F7",  tag: "SIGN-OUT", side: "right", scale: 0.96 },
  { rot:  -8, x: -34, y:  28, c: "#FF6B6B",  tag: "POSTER",   side: "left",  scale: 0.88 },
  { rot:  12, x:  36, y:  30, c: "#4ECDC4",  tag: "BANNER",   side: "right", scale: 0.90 },
] as const;

function HeroPosterStack() {
  return (
    <div
      aria-hidden
      className="hidden lg:block"
      style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1, overflow: "hidden" }}
    >
      {HERO_POSTERS.map((p, i) => {
        const baseLeft = p.side === "left" ? "9%" : "auto";
        const baseRight = p.side === "right" ? "9%" : "auto";
        const baseTop = "50%";
        return (
          <div
            key={i}
            className="nv-float-slow"
            style={{
              position: "absolute",
              left: baseLeft, right: baseRight,
              top: baseTop,
              transform: `translate(${p.x}%, calc(-50% + ${p.y}%)) rotate(${p.rot}deg) scale(${p.scale})`,
              animationDelay: `${i * 0.6}s`,
              animationDuration: `${5 + i * 0.4}s`,
              opacity: 0.55,
              willChange: "transform",
            }}
          >
            <div
              style={{
                width: 130,
                height: 170,
                background: `linear-gradient(150deg, ${p.c}, ${p.c}40 65%, rgba(0,0,0,0.4))`,
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.15)",
                padding: 12,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                boxShadow: `0 30px 60px rgba(0,0,0,0.6), 0 0 50px ${p.c}25`,
                position: "relative",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ ...mono, fontSize: 7, letterSpacing: "0.18em", color: "rgba(255,255,255,0.85)", textTransform: "uppercase" }}>
                  {p.tag}
                </span>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#fff", opacity: 0.7 }} />
              </div>
              <div style={{ display: "flex", justifyContent: "center", opacity: 0.6, color: "#fff" }}>
                <GraduationCap size={36} strokeWidth={1.4} />
              </div>
              <div>
                <div style={{ ...jkt, fontWeight: 800, fontSize: 11, color: "#fff", letterSpacing: "-0.01em", textTransform: "uppercase", lineHeight: 1.1 }}>
                  Class of<br />2026
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Marquee Strip ──────────────────────────────────────── */
const MARQUEE_TOP = "YOU MADE IT · FINAL YEAR · YOUR MOMENT · FOUR YEARS OF HARD WORK · THIS IS IT · FYB STUDIO · PICK · FILL · EXPORT · PRINT-READY · YOUR DESIGN · SIGN-OUT WEEK · ";
const MARQUEE_BOT = "₦1,000 FLAT · FIVE MINUTES START TO FINISH · PRINT-READY PNG · EDIT FREE FOREVER · NO WAITING LIST · NO BRIEF · NO DM CHAINS · JUST YOUR NAME · JUST YOUR PHOTO · ";

function MarqueeStrip() {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    let lastY = window.scrollY;
    let velocity = 0;
    const tick = () => {
      const y = window.scrollY;
      const delta = Math.abs(y - lastY);
      velocity = velocity * 0.86 + delta * 0.14;
      lastY = y;
      const target = Math.max(8, 28 - Math.min(20, velocity * 0.9));
      if (rootRef.current) {
        rootRef.current.style.setProperty("--marquee-speed", `${target}s`);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div ref={rootRef} style={{
      borderTop: "1px solid rgba(255,215,0,0.1)",
      borderBottom: "1px solid rgba(255,215,0,0.1)",
      overflow: "hidden",
      background: "linear-gradient(90deg, rgba(255,215,0,0.04) 0%, rgba(255,107,107,0.03) 50%, rgba(168,85,247,0.03) 100%)",
    }}>
      {/* Top row - forward, gold */}
      <div style={{ padding: "12px 0 8px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <div className="nv-marquee-track" style={{ display: "flex", width: "max-content" }}>
          {[0, 1].map(k => (
            <span key={k} style={{ ...mono, fontSize: 10, letterSpacing: "0.18em", color: "rgba(255,215,0,0.65)", whiteSpace: "nowrap" }}>
              {MARQUEE_TOP}{MARQUEE_TOP}
            </span>
          ))}
        </div>
      </div>
      {/* Bottom row - reverse, coral/white */}
      <div style={{ padding: "8px 0 12px" }}>
        <div className="nv-marquee-track-rev" style={{ display: "flex", width: "max-content" }}>
          {[0, 1].map(k => (
            <span key={k} style={{ ...mono, fontSize: 10, letterSpacing: "0.14em", color: "rgba(255,140,140,0.4)", whiteSpace: "nowrap" }}>
              {MARQUEE_BOT}{MARQUEE_BOT}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Stats Strip ────────────────────────────────────────── */
const STATS: Array<{ raw: number; suffix: string; label: string; prefix?: string; color: string }> = [
  { raw: 2400, suffix: "+",    label: "Final year finalists served",   color: "#FFD700", },
  { raw: 5,    suffix: " min", label: "Start to print-ready file",     color: "#FF6B6B", },
  { raw: 1000, suffix: "",     label: "Naira flat. No subscriptions.", prefix: "₦", color: "#A855F7" },
  { raw: 100,  suffix: "%",    label: "Print-quality on every export", color: "#4ECDC4", },
];

function StatsStrip() {
  const ref = useStagger();
  return (
    <div style={{ padding: "clamp(48px,7vw,88px) 0", borderBottom: "1px solid rgba(255,255,255,0.05)", background: "rgba(255,215,0,0.015)" }}>
      <div className="mx-auto px-5 sm:px-8" style={{ maxWidth: 1400 }}>
        <div style={{ ...mono, fontSize: 9, letterSpacing: "0.22em", color: "rgba(255,215,0,0.4)", textTransform: "uppercase", marginBottom: 40 }}>
          Trusted by finalists
        </div>
        <div ref={ref} className="nv-stagger grid grid-cols-2 gap-10 sm:grid-cols-4">
          {STATS.map(s => (
            <StatItem key={s.label} raw={s.raw} suffix={s.suffix} label={s.label} prefix={s.prefix} color={s.color} />
          ))}
        </div>
      </div>
    </div>
  );
}

function StatItem({ raw, suffix, label, prefix, color }: { raw: number; suffix: string; label: string; prefix?: string; color: string }) {
  const { value, ref } = useCounter(raw, 1600);
  return (
    <div>
      {/* Colored accent bar */}
      <div style={{ width: 28, height: 3, background: color, borderRadius: 2, marginBottom: 12, opacity: 0.8 }} />
      <div style={{ ...jkt, fontWeight: 800, fontSize: "clamp(32px, 4vw, 56px)", letterSpacing: "-0.035em", lineHeight: 1, fontVariantNumeric: "tabular-nums",
        background: `linear-gradient(130deg, #fff 30%, ${color} 120%)`,
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
        {prefix ?? ""}
        <span ref={ref}>{value.toLocaleString()}</span>
        {suffix}
      </div>
      <div style={{ ...mono, fontSize: 10, letterSpacing: "0.08em", color: "rgba(255,255,255,0.28)", marginTop: 10, textTransform: "uppercase", lineHeight: 1.5 }}>
        {label}
      </div>
    </div>
  );
}

/* ─── How It Works ───────────────────────────────────────── */
const STEPS = [
  {
    num: "01", label: "PICK", color: "#FF6B6B",
    title: "A design that already looks finished.",
    desc: "Every template was built by a designer. Fonts, layout, palette, spacing locked. You only see the fields that are yours. Your name. Your department. Your photo.",
    badge: "00:00 → 00:30",
  },
  {
    num: "02", label: "FILL", color: "#A855F7",
    title: "Your details. Live preview.",
    desc: "Type your name and watch the design update instantly. No brief to write. No DMs to send. No two-day wait for a revision that still misses the mark.",
    badge: "00:30 → 03:00",
  },
  {
    num: "03", label: "EXPORT", color: "#4ECDC4",
    title: "₦1,000. Print-ready. Yours forever.",
    desc: "Pay via Paystack - card, bank transfer, USSD. One high-resolution PNG delivered to your device. If anything goes wrong, your dashboard holds a Resume button.",
    badge: "03:00 → 05:00",
  },
] as const;

function HowItWorks() {
  const ref = useStagger();
  const headerRef = useReveal();
  return (
    <section
      id="how"
      style={{
        position: "relative",
        padding: "clamp(96px, 12vw, 160px) 0",
        background:
          "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(168,85,247,0.07), transparent 65%), rgba(168,85,247,0.015)",
        overflow: "hidden",
      }}
    >
      {/* Faint timer rings (decorative) */}
      <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0 }}>
        <div style={{ position: "absolute", top: "8%", left: "-10%", width: 600, height: 600, borderRadius: "50%", border: "1px dashed rgba(255,215,0,0.06)" }} />
        <div style={{ position: "absolute", bottom: "-20%", right: "-10%", width: 700, height: 700, borderRadius: "50%", border: "1px dashed rgba(168,85,247,0.06)" }} />
      </div>

      <div className="mx-auto px-5 sm:px-8" style={{ maxWidth: 1400, position: "relative", zIndex: 1 }}>
        {/* Section header - scoreboard-style "5 MIN" centerpiece */}
        <div ref={headerRef} className="nv-stagger" style={{ textAlign: "center", marginBottom: "clamp(48px,6vw,80px)" }}>
          <NvEyebrow color="rgba(168,85,247,0.7)">How it works</NvEyebrow>
          <div style={{ marginTop: 18, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <h2 style={{ ...jkt, fontWeight: 800, fontSize: "clamp(28px, 4vw, 56px)", lineHeight: 0.95, letterSpacing: "-0.025em", textTransform: "uppercase" }}>
              Open. Fill. Export.<br />
              Done in
            </h2>
            <div style={{ display: "flex", alignItems: "center", gap: "clamp(6px,1vw,12px)", marginTop: 6 }}>
              <span className="nv-led-digit" style={{ fontSize: "clamp(100px, 18vw, 240px)", lineHeight: 0.85, letterSpacing: "-0.04em" }}>5</span>
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 4, marginLeft: 4 }}>
                <span style={{ ...mono, fontSize: "clamp(14px,1.6vw,22px)", letterSpacing: "0.22em", color: "rgba(255,215,0,0.9)", fontWeight: 800, textTransform: "uppercase", lineHeight: 1 }}>
                  Minutes
                </span>
                <span style={{ ...mono, fontSize: "clamp(8px,0.9vw,10px)", letterSpacing: "0.3em", color: "rgba(255,255,255,0.32)", textTransform: "uppercase", lineHeight: 1 }}>
                  flat. Every time.
                </span>
              </div>
            </div>
          </div>
          <p style={{ ...sans, fontSize: "clamp(14px,1.3vw,17px)", color: "rgba(255,255,255,0.42)", marginTop: 24, maxWidth: "54ch", marginLeft: "auto", marginRight: "auto", lineHeight: 1.65 }}>
            Three steps. No briefs. No DMs. No back-and-forth. Watch the demos play below - that&apos;s the whole story.
          </p>
        </div>

        {/* Connecting rail (desktop only, between cards) */}
        <div className="hidden lg:block" style={{ position: "relative", height: 0 }}>
          <div className="nv-rail" style={{ position: "absolute", left: "16.66%", right: "16.66%", top: 170, opacity: 0.65 }} aria-hidden />
        </div>

        {/* Steps grid - now with live demos */}
        <div ref={ref} className="nv-stagger grid gap-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))" }}>
          {STEPS.map((step, i) => (
            <div
              key={step.num}
              className="nv-step-card"
              style={{
                position: "relative",
                borderRadius: 24,
                background: "linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01))",
                border: `1px solid ${step.color}24`,
                boxShadow: `0 0 0 1px ${step.color}06 inset, 0 30px 80px rgba(0,0,0,0.35), 0 0 80px ${step.color}10`,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Top accent line */}
              <div aria-hidden style={{ height: 3, background: `linear-gradient(90deg, transparent, ${step.color}, transparent)` }} />

              {/* Header row */}
              <div style={{ padding: "22px 26px 0", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <div style={{ ...mono, fontSize: 10, letterSpacing: "0.22em", color: step.color, textTransform: "uppercase", fontWeight: 700 }}>
                    Step {step.num} · {step.label}
                  </div>
                  <div style={{ ...mono, fontSize: 9, letterSpacing: "0.18em", color: "rgba(255,255,255,0.32)", marginTop: 4, textTransform: "uppercase" }}>
                    ⏱ {step.badge}
                  </div>
                </div>
                {/* Huge LED step number in corner */}
                <div
                  style={{
                    ...mono,
                    fontSize: 56, fontWeight: 900,
                    lineHeight: 0.85,
                    background: `linear-gradient(180deg, ${step.color}, ${step.color}40)`,
                    WebkitBackgroundClip: "text",
                    backgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    opacity: 0.85,
                    userSelect: "none",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {step.num}
                </div>
              </div>

              {/* Demo stage */}
              <div
                style={{
                  margin: "18px 18px 0",
                  borderRadius: 16,
                  background: "linear-gradient(180deg, rgba(0,0,0,0.45), rgba(0,0,0,0.2))",
                  border: "1px solid rgba(255,255,255,0.05)",
                  position: "relative",
                  height: 220,
                  overflow: "hidden",
                }}
              >
                {/* Scanline overlay */}
                <div aria-hidden style={{
                  position: "absolute", inset: 0, pointerEvents: "none",
                  background: "repeating-linear-gradient(0deg, transparent 0, transparent 2px, rgba(255,255,255,0.02) 2px, rgba(255,255,255,0.02) 3px)",
                }} />
                {/* "LIVE" badge */}
                <div style={{
                  position: "absolute", top: 10, right: 10, zIndex: 4,
                  display: "inline-flex", alignItems: "center", gap: 6,
                  background: "rgba(0,0,0,0.5)",
                  border: `1px solid ${step.color}40`,
                  padding: "3px 8px", borderRadius: 100,
                  ...mono, fontSize: 8, letterSpacing: "0.18em",
                  color: step.color, textTransform: "uppercase", fontWeight: 700,
                }}>
                  <span style={{ position: "relative", width: 6, height: 6, display: "inline-flex" }}>
                    <span className="nv-pulse-ring" style={{ position: "absolute", inset: 0, border: `1.5px solid ${step.color}`, borderRadius: "50%" }} />
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: step.color }} />
                  </span>
                  Live
                </div>

                {i === 0 && <PickDemo color={step.color} />}
                {i === 1 && <FillDemo color={step.color} />}
                {i === 2 && <ExportDemo color={step.color} />}
              </div>

              {/* Text content */}
              <div style={{ padding: "22px 26px 28px" }}>
                <div style={{ ...jkt, fontWeight: 800, fontSize: "clamp(17px, 1.4vw, 21px)", lineHeight: 1.25, color: "#fff", marginBottom: 10, letterSpacing: "-0.02em" }}>
                  {step.title}
                </div>
                <p style={{ ...sans, fontSize: 13.5, lineHeight: 1.7, color: "rgba(255,255,255,0.45)", margin: 0 }}>
                  {step.desc}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA strip below */}
        <div style={{ marginTop: "clamp(40px,5vw,64px)", display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: 14 }}>
          <Link
            href="/templates"
            className="nv-laser-btn"
            style={{
              height: 54, padding: "0 36px",
              borderRadius: 8, fontSize: 12,
              letterSpacing: "0.05em", ...mono,
              display: "inline-flex", alignItems: "center", gap: 10,
            }}
          >
            Start the 5-minute timer
          </Link>
          <div style={{ ...mono, fontSize: 10, letterSpacing: "0.18em", color: "rgba(255,255,255,0.3)", textTransform: "uppercase" }}>
            No card needed yet
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── How-It-Works live demos ─────────────────────────────── */

function PickDemo({ color }: { color: string }) {
  // 4 stacked cards that fan out; one auto-cycles "to the front" every cycle
  const CARDS: Array<{ tint: string; restRot: number; restX: number; restY: number; tag: string; delay: number }> = [
    { tint: "#FFD700", restRot: -10, restX: -54, restY: 16, tag: "FYB-01", delay: 0    },
    { tint: "#A855F7", restRot:  -3, restX: -18, restY:  6, tag: "SIGN-OUT", delay: 1.8 },
    { tint: "#FF6B6B", restRot:   4, restX:  18, restY:  4, tag: "BANNER",   delay: 3.6 },
    { tint: "#4ECDC4", restRot:  11, restX:  54, restY: 14, tag: "POSTER",   delay: 5.4 },
  ];
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {/* Fake cursor pointer */}
      <div aria-hidden style={{ position: "absolute", top: 28, left: 28, color: "#fff", opacity: 0.4, zIndex: 6 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M3 2l7 18 2-8 8-2L3 2z" />
        </svg>
      </div>

      {CARDS.map((c, i) => (
        <div
          key={i}
          className="nv-pick-card"
          style={{
            position: "absolute",
            width: 78, height: 104,
            borderRadius: 8,
            background: `linear-gradient(140deg, ${c.tint}, ${c.tint}80)`,
            border: "1px solid rgba(255,255,255,0.15)",
            boxShadow: "0 8px 20px rgba(0,0,0,0.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            ["--rest-x" as string]: `${c.restX}px`,
            ["--rest-y" as string]: `${c.restY}px`,
            ["--rest-rot" as string]: `${c.restRot}deg`,
            ["--pick-delay" as string]: `${c.delay}s`,
            ["--pick-accent" as string]: color,
            transform: `translate(${c.restX}px, ${c.restY}px) rotate(${c.restRot}deg)`,
          }}
        >
          <div style={{ color: "#fff", opacity: 0.85 }}>
            <GraduationCap size={32} strokeWidth={1.5} />
          </div>
          <div style={{
            position: "absolute", bottom: 6, left: 6,
            ...mono, fontSize: 7, letterSpacing: "0.12em",
            color: "rgba(255,255,255,0.85)",
            background: "rgba(0,0,0,0.4)",
            padding: "2px 5px", borderRadius: 2,
            textTransform: "uppercase",
          }}>
            {c.tag}
          </div>
        </div>
      ))}
    </div>
  );
}

const FILL_FIELDS = [
  { label: "FULL NAME",  value: "Muiz Ibraheem", typeMs: 80 },
  { label: "DEPARTMENT", value: "Computer Sci.", typeMs: 90 },
  { label: "MATRIC NO.", value: "CSC/2021/041",  typeMs: 100 },
] as const;

function FillDemo({ color }: { color: string }) {
  const [fieldIdx, setFieldIdx] = useState(0);
  const [text, setText] = useState("");
  const [previewName, setPreviewName] = useState("");
  const [previewDept, setPreviewDept] = useState("");

  useEffect(() => {
    let active = true;
    const target = FILL_FIELDS[fieldIdx];
    setText("");
    let i = 0;
    const id = setInterval(() => {
      if (!active) return;
      i++;
      const slice = target.value.slice(0, i);
      setText(slice);
      if (fieldIdx === 0) setPreviewName(slice);
      if (fieldIdx === 1) setPreviewDept(slice);
      if (i >= target.value.length) {
        clearInterval(id);
        setTimeout(() => {
          if (!active) return;
          if (fieldIdx === 0) setPreviewName(target.value);
          if (fieldIdx === 1) setPreviewDept(target.value);
          setFieldIdx((idx) => (idx + 1) % FILL_FIELDS.length);
        }, 900);
      }
    }, target.typeMs);
    return () => { active = false; clearInterval(id); };
  }, [fieldIdx]);

  return (
    <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: "1.05fr 1fr", gap: 10, padding: 16, alignItems: "center" }}>
      {/* Input panel */}
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {FILL_FIELDS.map((f, i) => {
          const isActive = i === fieldIdx;
          const isDone = i < fieldIdx || (i === fieldIdx && text === f.value);
          const display = isActive ? text : isDone ? f.value : "";
          return (
            <div
              key={f.label}
              style={{
                background: isActive ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.02)",
                border: `1px solid ${isActive ? color + "60" : "rgba(255,255,255,0.06)"}`,
                borderRadius: 6,
                padding: "5px 8px",
                transition: "all 200ms ease",
              }}
            >
              <div style={{ ...mono, fontSize: 7, letterSpacing: "0.18em", color: isActive ? color : "rgba(255,255,255,0.32)" }}>
                {f.label}
              </div>
              <div style={{ ...sans, fontSize: 11, color: "#fff", marginTop: 1, minHeight: 14, display: "flex", alignItems: "center" }}>
                {display}
                {isActive && (
                  <span
                    style={{
                      display: "inline-block", width: 1.5, height: 11, marginLeft: 1,
                      background: color, animation: "nv-fill-caret 700ms steps(1) infinite",
                    }}
                    aria-hidden
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Live mini-preview poster */}
      <div
        style={{
          aspectRatio: "3 / 4",
          background: `linear-gradient(155deg, #1a1408, #050505)`,
          borderRadius: 6,
          border: `1px solid ${color}30`,
          padding: 10,
          display: "flex", flexDirection: "column",
          justifyContent: "space-between",
          position: "relative",
          overflow: "hidden",
          boxShadow: `0 6px 18px rgba(0,0,0,0.4), 0 0 24px ${color}10`,
        }}
      >
        <div aria-hidden style={{ position: "absolute", top: 4, right: 4, opacity: 0.18, color: "#FFD700" }}>
          <GraduationCap size={28} strokeWidth={1} />
        </div>
        <div>
          <div style={{ ...mono, fontSize: 6, letterSpacing: "0.2em", color: "rgba(255,215,0,0.6)" }}>CLASS OF</div>
          <div style={{ ...jkt, fontSize: 14, fontWeight: 800, color: "#FFD700", letterSpacing: "-0.02em" }}>2026</div>
        </div>
        <div>
          <div
            style={{
              ...jkt, fontWeight: 800, fontSize: 14,
              color: "#fff", lineHeight: 1.05, letterSpacing: "-0.02em",
              textTransform: "uppercase", minHeight: 14,
              transition: "all 100ms ease",
            }}
          >
            {previewName || <span style={{ color: "rgba(255,255,255,0.18)" }}>YOUR NAME</span>}
          </div>
          <div style={{ ...mono, fontSize: 7, letterSpacing: "0.14em", color: "rgba(255,255,255,0.5)", marginTop: 4, minHeight: 9, textTransform: "uppercase" }}>
            {previewDept || "your dept."}
          </div>
        </div>
      </div>
    </div>
  );
}

// Confetti dots pre-computed at module load (no Math.random in render)
const EXPORT_DOTS = Array.from({ length: 14 }).map((_, i) => {
  const angle = (i / 14) * Math.PI * 2;
  // Deterministic pseudo-random based on index
  const seed = Math.sin(i * 12.9898) * 43758.5453;
  const rand = seed - Math.floor(seed);
  const dist = 50 + rand * 30;
  const x = Math.cos(angle) * dist;
  const y = Math.sin(angle) * dist;
  const palette = ["#FFD700", "#FF8C42", "#FF6B6B", "#4ECDC4", "#A855F7"];
  const rotSeed = Math.sin((i + 7) * 78.233) * 43758.5453;
  const rotRand = rotSeed - Math.floor(rotSeed);
  return { x, y, c: palette[i % palette.length], r: rotRand * 360 };
});

function ExportDemo({ color }: { color: string }) {
  const dots = EXPORT_DOTS;

  return (
    <div style={{ position: "absolute", inset: 0, padding: 16, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
      {/* Fake payment chip */}
      <div style={{
        alignSelf: "flex-start",
        display: "inline-flex", alignItems: "center", gap: 6,
        ...mono, fontSize: 8, letterSpacing: "0.18em",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 100,
        padding: "5px 10px",
        color: "rgba(255,255,255,0.7)",
      }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ECDC4" }} />
        PAYSTACK · ₦1,000
      </div>

      {/* Center: success burst (animated pop) */}
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 3, pointerEvents: "none" }}>
        <div
          className="nv-export-pop"
          style={{
            width: 56, height: 56,
            borderRadius: "50%",
            background: `linear-gradient(140deg, ${color}, ${color}80)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 0 0 6px ${color}20, 0 0 30px ${color}80`,
          }}
        >
          <CheckMark />
        </div>
        {/* Confetti */}
        {dots.map((d, i) => (
          <span
            key={i}
            className="nv-export-pop"
            style={{
              position: "absolute", top: "50%", left: "50%",
              width: 5, height: 8, borderRadius: 1,
              background: d.c,
              transform: `translate(${d.x}px, ${d.y}px) rotate(${d.r}deg)`,
              animationDelay: "0.1s",
              opacity: 0.9,
            }}
            aria-hidden
          />
        ))}
      </div>

      {/* Bottom: progress bar + file pill */}
      <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 8 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
            <span style={{ ...mono, fontSize: 8, letterSpacing: "0.18em", color: "rgba(255,255,255,0.45)" }}>
              EXPORTING PNG…
            </span>
            <span style={{ ...mono, fontSize: 8, color: color, letterSpacing: "0.18em" }}>
              2× SCALE
            </span>
          </div>
          <div style={{ position: "relative", height: 6, borderRadius: 100, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
            <div
              className="nv-export-bar-fill"
              style={{
                position: "absolute", left: 0, top: 0, bottom: 0,
                background: `linear-gradient(90deg, ${color}, #FFD700)`,
                boxShadow: `0 0 10px ${color}`,
                borderRadius: 100,
              }}
            />
          </div>
        </div>
        <div
          className="nv-export-file"
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "rgba(255,255,255,0.06)",
            border: `1px solid ${color}40`,
            borderRadius: 6,
            padding: "6px 10px",
            ...mono, fontSize: 9,
            color: "#fff",
            alignSelf: "flex-start",
          }}
        >
          <FileIcon color={color} />
          your_design.png
          <span style={{ color: "rgba(255,255,255,0.4)", marginLeft: "auto" }}>· 2.4 MB</span>
        </div>
      </div>
    </div>
  );
}

function CheckMark() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="4 12 10 18 20 6" />
    </svg>
  );
}

function FileIcon({ color }: { color: string }) {
  return (
    <svg width="12" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}


/* ─── Sign-Out Week Lineup ───────────────────────────────────
   A festival-lineup-style program for sign-out week - every day of the
   final week as a styled card, like a music-festival playbill. No
   photos required, all typographic. */
const SIGNOUT_WEEK: Array<{
  day: string;
  date: string;
  title: string;
  vibe: string;
  blurb: string;
  color: string;
}> = [
  { day: "Mon", date: "Day 01", title: "Corporate Day",  vibe: "Suit & tie",       blurb: "Blazers, ties, heels, briefcases. The class shows up looking like the LinkedIn version of itself.", color: "#FFD700" },
  { day: "Tue", date: "Day 02", title: "Costume Day",    vibe: "Pick a character", blurb: "Superheroes, anime, cartoons, throwback villains. The group chat decides the theme by Sunday night.",   color: "#FF8C42" },
  { day: "Wed", date: "Day 03", title: "Old School Day", vibe: "Throwback fits",   blurb: "70s flares, 90s denim, school uniforms reimagined. Mama's wardrobe meets the gram.",                   color: "#FF6B6B" },
  { day: "Thu", date: "Day 04", title: "Cultural Day",   vibe: "Heritage on",      blurb: "Ankara, agbada, gele, isi-agu, atiku. Every state shows up, every culture takes a bow.",               color: "#4ECDC4" },
  { day: "Fri", date: "Day 05", title: "Jersey Day",     vibe: "Squad colours",    blurb: "Football kits, basketball jerseys, dept colours. Pick your team. Wear it loud.",                       color: "#A855F7" },
  { day: "Sat", date: "Day 06", title: "Party Night",    vibe: "Headline event",   blurb: "DJ booked. Decor up. The night every flyer, banner, and save-the-date has been pointing to.",          color: "#EC4899" },
] as const;

function WallOfClass({ classYear }: { classYear: number }) {
  const headerRef = useReveal();
  return (
    <section
      style={{
        position: "relative",
        padding: "clamp(96px, 12vw, 160px) 0",
        background:
          "radial-gradient(ellipse 60% 50% at 50% 0%, rgba(255,215,0,0.05), transparent 65%), rgba(255,255,255,0.012)",
        borderTop: "1px solid rgba(255,215,0,0.08)",
        borderBottom: "1px solid rgba(255,215,0,0.08)",
        overflow: "hidden",
      }}
      id="wall"
    >
      {/* Background flourishes */}
      <div aria-hidden style={{ position: "absolute", inset: 0, opacity: 0.04, pointerEvents: "none", color: "#FFD700" }}>
        <div style={{ position: "absolute", top: "8%", left: "6%", fontSize: 120, fontWeight: 900, transform: "rotate(-12deg)", ...jkt }}>★</div>
        <div style={{ position: "absolute", top: "70%", right: "8%", fontSize: 160, fontWeight: 900, transform: "rotate(8deg)", ...jkt }}>♛</div>
        <div style={{ position: "absolute", top: "30%", right: "20%", fontSize: 80, fontWeight: 900, transform: "rotate(15deg)", ...jkt }}>FYB</div>
      </div>

      <div className="mx-auto px-5 sm:px-8" style={{ maxWidth: 1400, position: "relative" }}>
        <div ref={headerRef} className="nv-stagger" style={{ textAlign: "center", marginBottom: "clamp(40px,5vw,72px)" }}>
          <NvEyebrow color="rgba(255,215,0,0.7)">Seven days, one ceremony</NvEyebrow>
          <h2 style={{ ...jkt, fontWeight: 800, fontSize: "clamp(32px, 6vw, 84px)", lineHeight: 0.95, letterSpacing: "-0.03em", textTransform: "uppercase", marginTop: 18 }}>
            Sign-out week <span className="nv-shimmer-text">{classYear}</span>
          </h2>
          <p style={{ ...sans, fontSize: "clamp(14px,1.3vw,17px)", color: "rgba(255,255,255,0.4)", marginTop: 18, maxWidth: "60ch", marginLeft: "auto", marginRight: "auto", lineHeight: 1.65 }}>
            The week your campus turns into a stage. Every day deserves a poster - a flyer for the hangout, a banner for the photoshoot, a save-the-date for the party.
          </p>
        </div>

        {/* Festival-lineup grid - flex so wrapped rows centre instead of
            stretching their last items full-width. */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: "clamp(16px, 2vw, 22px)",
            padding: "20px 0 40px",
          }}
        >
          {SIGNOUT_WEEK.map((d, i) => (
            <div key={d.day} className="lineup-card-slot">
              <LineupCard {...d} index={i} />
            </div>
          ))}
        </div>

        {/* CTA */}
        <div style={{ textAlign: "center", marginTop: "clamp(28px,4vw,52px)" }}>
          <Link
            href="/templates"
            className="nv-laser-btn"
            style={{
              height: 52,
              padding: "0 32px",
              borderRadius: 8,
              fontSize: 12,
              letterSpacing: "0.06em",
              ...mono,
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            Design your week - browse templates
          </Link>
        </div>
      </div>
    </section>
  );
}

function LineupCard({
  day, date, title, vibe, blurb, color, index,
}: {
  day: string; date: string; title: string; vibe: string; blurb: string; color: string; index: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{
        position: "relative",
        padding: "22px 22px 20px",
        background: "linear-gradient(180deg, rgba(20,16,4,0.55), rgba(8,8,8,0.45))",
        border: `1px solid ${color}28`,
        borderRadius: 14,
        boxShadow:
          `inset 0 1px 0 rgba(255,255,255,0.04), 0 18px 36px rgba(0,0,0,0.35)`,
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(24px)",
        transition: `opacity 700ms cubic-bezier(0.22, 0.61, 0.36, 1) ${index * 60}ms, transform 800ms cubic-bezier(0.22, 0.61, 0.36, 1) ${index * 60}ms`,
        overflow: "hidden",
      }}
    >
      {/* Top accent stripe */}
      <div
        aria-hidden
        style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
        }}
      />

      {/* Day chip + date */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div
          style={{
            display: "inline-flex", alignItems: "baseline", gap: 8,
          }}
        >
          <span
            style={{
              ...jkt, fontWeight: 900,
              fontSize: 30, lineHeight: 1,
              letterSpacing: "-0.04em",
              background: `linear-gradient(140deg, #fff, ${color})`,
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
              textTransform: "uppercase",
            }}
          >
            {day}
          </span>
          <span style={{ ...mono, fontSize: 9, letterSpacing: "0.22em", color: `${color}cc`, textTransform: "uppercase", fontWeight: 700 }}>
            {date}
          </span>
        </div>
        <span
          aria-hidden
          style={{
            width: 8, height: 8, borderRadius: "50%",
            background: color,
            boxShadow: `0 0 14px ${color}90`,
          }}
        />
      </div>

      {/* Title */}
      <h3
        style={{
          ...jkt, fontWeight: 800, fontSize: 22, lineHeight: 1.1,
          letterSpacing: "-0.02em", color: "#fff",
          marginBottom: 6,
        }}
      >
        {title}
      </h3>

      {/* Vibe tag */}
      <div
        style={{
          ...mono, fontSize: 9, letterSpacing: "0.22em",
          color: "rgba(255,255,255,0.45)", textTransform: "uppercase",
          marginBottom: 14, fontWeight: 700,
        }}
      >
        {vibe}
      </div>

      {/* Blurb */}
      <p style={{ ...sans, fontSize: 12.5, lineHeight: 1.6, color: "rgba(255,255,255,0.5)", margin: 0 }}>
        {blurb}
      </p>

      {/* Bottom rule */}
      <div
        style={{
          marginTop: 16,
          paddingTop: 12,
          borderTop: "1px dashed rgba(255,255,255,0.06)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          ...mono, fontSize: 8, letterSpacing: "0.2em",
          color: "rgba(255,255,255,0.3)", textTransform: "uppercase",
        }}
      >
        <span>Class of the year</span>
        <span style={{ color, opacity: 0.7 }}>★</span>
      </div>
    </div>
  );
}



/* ─── Memory Lane (4 years in 30 seconds) ─────────────────── */
const MEMORY_STOPS: Array<{
  year: string;
  level: string;
  title: string;
  line: string;
  color: string;
  emoji: string;
}> = [
  {
    year: "100",
    level: "Fresher",
    title: "First lecture, first dream.",
    line: "JAMB scaled. The hall packed. Everyone looked like a senior. You sat in the front row that week. Just that week.",
    color: "#FFD700",
    emoji: "📚",
  },
  {
    year: "200",
    level: "Sophomore",
    title: "You picked a side.",
    line: "Major decided. First real all-nighter. First crush in your project group. First time the canteen ran out at 8pm and you swore never again.",
    color: "#FF8C42",
    emoji: "✏️",
  },
  {
    year: "300",
    level: "Junior",
    title: "The world said welcome.",
    line: "Industrial training. First salary alert. The bus to work that made you grow up overnight. You came back with a different walk.",
    color: "#FF6B6B",
    emoji: "💼",
  },
  {
    year: "400",
    level: "Final Year",
    title: "Project. Defense. Done.",
    line: "Defense survived. Convocation gown ordered. Your name on a noticeboard. The week is now. The pictures must slap.",
    color: "#A855F7",
    emoji: "🎓",
  },
];

function MemoryLane({ classYear }: { classYear: number }) {
  const headerRef = useReveal();
  return (
    <section
      style={{
        position: "relative",
        padding: "clamp(96px, 12vw, 160px) 0",
        background:
          "radial-gradient(ellipse 70% 60% at 50% 100%, rgba(168,85,247,0.05), transparent 70%)",
        overflow: "hidden",
      }}
      id="memory"
    >
      {/* Side rails - film strip feel */}
      <div aria-hidden style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 24, display: "flex", flexDirection: "column", justifyContent: "space-around", opacity: 0.06 }}>
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} style={{ width: 16, height: 12, background: "#fff", margin: "0 auto", borderRadius: 1 }} />
        ))}
      </div>
      <div aria-hidden style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 24, display: "flex", flexDirection: "column", justifyContent: "space-around", opacity: 0.06 }}>
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} style={{ width: 16, height: 12, background: "#fff", margin: "0 auto", borderRadius: 1 }} />
        ))}
      </div>

      <div className="mx-auto px-5 sm:px-8" style={{ maxWidth: 1000, position: "relative" }}>
        <div ref={headerRef} className="nv-stagger" style={{ textAlign: "center", marginBottom: "clamp(56px,7vw,96px)" }}>
          <NvEyebrow color="rgba(168,85,247,0.8)">Memory lane</NvEyebrow>
          <h2 style={{ ...jkt, fontWeight: 800, fontSize: "clamp(32px, 5.5vw, 76px)", lineHeight: 0.95, letterSpacing: "-0.03em", textTransform: "uppercase", marginTop: 18 }}>
            Four years.<br />
            <span className="nv-shimmer-text">One unforgettable week.</span>
          </h2>
          <p style={{ ...sans, fontSize: "clamp(14px,1.3vw,17px)", color: "rgba(255,255,255,0.4)", marginTop: 18, maxWidth: "52ch", marginLeft: "auto", marginRight: "auto", lineHeight: 1.65 }}>
            Scroll through the journey. Then make a poster that says what no caption could.
          </p>
        </div>

        {/* Vertical timeline */}
        <div style={{ position: "relative", padding: "20px 0" }}>
          {/* Center spine (left on mobile via .memory-lane-spine class) */}
          <div
            aria-hidden
            className="memory-lane-spine"
            style={{
              position: "absolute",
              left: "50%",
              top: 0, bottom: 0,
              width: 2,
              background:
                "linear-gradient(180deg, transparent, rgba(255,215,0,0.5) 10%, rgba(255,140,66,0.5) 40%, rgba(255,107,107,0.5) 70%, rgba(168,85,247,0.6) 90%, transparent)",
              transform: "translateX(-50%)",
              borderRadius: 2,
            }}
          />

          {MEMORY_STOPS.map((m, i) => (
            <MemoryStop key={m.year} {...m} index={i} side={i % 2 === 0 ? "left" : "right"} />
          ))}
        </div>

        {/* Ticket stub finale */}
        <div style={{ marginTop: "clamp(56px,7vw,96px)", display: "flex", justifyContent: "center", padding: "0 12px" }}>
          <TicketStub classYear={classYear} />
        </div>
      </div>
    </section>
  );
}

function MemoryStop({
  year, level, title, line, color, emoji, index, side,
}: {
  year: string; level: string; title: string; line: string; color: string; emoji: string; index: number; side: "left" | "right";
}) {
  const ref = useRef<HTMLDivElement>(null);
  // visible toggles in BOTH directions as the card enters / leaves the viewport.
  // Scrolling down past a card emerges it from the spine. Scrolling back up
  // past it retracts back into the spine. The animation replays both ways.
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        setVisible(entry.isIntersecting);
      },
      { threshold: 0.35, rootMargin: "0px 0px -10% 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const isLeft = side === "left";

  return (
    <div
      ref={ref}
      className="memory-stop"
      data-visible={visible ? "true" : "false"}
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 60px 1fr",
        alignItems: "center",
        gap: 12,
        marginBottom: "clamp(40px, 6vw, 72px)",
      }}
    >
      {/* Left card - emerges from the center spine and slides outward */}
      <div
        className="memory-card-slot memory-card-slot-left"
        data-empty={!isLeft}
        style={{
          gridColumn: 1,
          justifySelf: "end",
          maxWidth: 420,
          textAlign: "right",
          visibility: isLeft ? "visible" : "hidden",
          opacity: isLeft ? (visible ? 1 : 0) : 0,
          transform: isLeft
            ? visible
              ? "translateX(0) scale(1)"
              : "translateX(80px) scale(0.86)"
            : undefined,
          transformOrigin: "right center",
          transition: `opacity 700ms cubic-bezier(0.22, 0.61, 0.36, 1) ${index * 60}ms, transform 800ms cubic-bezier(0.22, 0.61, 0.36, 1) ${index * 60}ms`,
          filter: isLeft && !visible ? "blur(6px)" : "blur(0)",
          willChange: "transform, opacity, filter",
        }}
      >
        {isLeft && <MemoryCard year={year} level={level} title={title} line={line} color={color} emoji={emoji} side="left" />}
      </div>

      {/* Center dot - pulse appears with the card */}
      <div className="memory-dot-col" style={{ gridColumn: 2, display: "flex", justifyContent: "center", position: "relative" }}>
        <div style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          {/* Glow halo */}
          <span
            aria-hidden
            style={{
              position: "absolute", inset: -16,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${color}55, transparent 60%)`,
              opacity: visible ? 1 : 0,
              transition: `opacity 600ms ease ${index * 60 + 80}ms`,
              filter: "blur(5px)",
            }}
          />
          {/* Burst ring - flashes outward as the card emerges */}
          <span
            aria-hidden
            style={{
              position: "absolute", inset: 0,
              width: 22, height: 22,
              borderRadius: "50%",
              border: `2px solid ${color}`,
              opacity: visible ? 0 : 0,
              transform: visible ? "scale(2.6)" : "scale(0.6)",
              transition: visible
                ? `opacity 700ms ease ${index * 60}ms, transform 700ms cubic-bezier(0.22, 0.61, 0.36, 1) ${index * 60}ms`
                : "none",
              animation: visible ? `none` : undefined,
            }}
          />
          <div
            style={{
              width: 22, height: 22,
              borderRadius: "50%",
              background: color,
              border: `2px solid ${color}`,
              boxShadow: visible
                ? `0 0 0 6px ${color}25, 0 0 30px ${color}80`
                : "none",
              transform: visible ? "scale(1)" : "scale(0.5)",
              transition: `transform 600ms cubic-bezier(0.34, 1.56, 0.64, 1) ${index * 60}ms, box-shadow 600ms ease ${index * 60 + 100}ms`,
            }}
          />
        </div>
      </div>

      {/* Right card - emerges from center spine sliding right */}
      <div
        className="memory-card-slot memory-card-slot-right"
        data-empty={isLeft}
        style={{
          gridColumn: 3,
          justifySelf: "start",
          maxWidth: 420,
          textAlign: "left",
          visibility: !isLeft ? "visible" : "hidden",
          opacity: !isLeft ? (visible ? 1 : 0) : 0,
          transform: !isLeft
            ? visible
              ? "translateX(0) scale(1)"
              : "translateX(-80px) scale(0.86)"
            : undefined,
          transformOrigin: "left center",
          transition: `opacity 700ms cubic-bezier(0.22, 0.61, 0.36, 1) ${index * 60}ms, transform 800ms cubic-bezier(0.22, 0.61, 0.36, 1) ${index * 60}ms`,
          filter: !isLeft && !visible ? "blur(6px)" : "blur(0)",
          willChange: "transform, opacity, filter",
        }}
      >
        {!isLeft && <MemoryCard year={year} level={level} title={title} line={line} color={color} emoji={emoji} side="right" />}
      </div>
    </div>
  );
}

function MemoryCard({
  year, level, title, line, color, emoji, side,
}: {
  year: string; level: string; title: string; line: string; color: string; emoji: string; side: "left" | "right";
}) {
  return (
    <div
      style={{
        position: "relative",
        padding: "20px 24px",
        background: "rgba(255,255,255,0.025)",
        border: `1px solid ${color}30`,
        borderRadius: 12,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.05), 0 12px 30px rgba(0,0,0,0.25)`,
      }}
    >
      <div className="memory-card-head" style={{ display: "flex", alignItems: "baseline", gap: 10, justifyContent: side === "left" ? "flex-end" : "flex-start", marginBottom: 6 }}>
        <span
          style={{
            ...jkt, fontWeight: 800, fontSize: 32, lineHeight: 1,
            background: `linear-gradient(140deg, #fff, ${color})`,
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
          }}
        >
          {year}L
        </span>
        <span style={{ ...mono, fontSize: 9, letterSpacing: "0.18em", color: `${color}cc`, textTransform: "uppercase" }}>
          {level}
        </span>
        <span style={{ fontSize: 20 }} aria-hidden>{emoji}</span>
      </div>
      <h3 style={{ ...jkt, fontWeight: 700, fontSize: 18, color: "#fff", letterSpacing: "-0.02em", marginBottom: 8, lineHeight: 1.2 }}>
        {title}
      </h3>
      <p style={{ ...sans, fontSize: 13.5, color: "rgba(255,255,255,0.55)", lineHeight: 1.65 }}>
        {line}
      </p>
    </div>
  );
}

function TicketStub({ classYear }: { classYear: number }) {
  return (
    <div className="nv-ticket" style={{ maxWidth: 520, width: "100%", display: "flex", alignItems: "center", gap: "clamp(12px,3vw,24px)", flexWrap: "wrap" }}>
      <div style={{ flex: 0, color: "#FFD700" }}>
        <GraduationCap size={48} strokeWidth={1.5} />
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ ...mono, fontSize: 9, letterSpacing: "0.22em", color: "rgba(255,215,0,0.5)", textTransform: "uppercase" }}>
          Admit one
        </div>
        <div style={{ ...jkt, fontWeight: 800, fontSize: 22, color: "#fff", letterSpacing: "-0.02em" }}>
          Class of {classYear}
        </div>
        <div style={{ ...sans, fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
          One unforgettable week · Doors open: FYB month
        </div>
      </div>
      <div style={{ flex: 0, ...mono, fontSize: 8, letterSpacing: "0.18em", color: "rgba(255,215,0,0.4)", writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
        NO · TX · REFUND
      </div>
    </div>
  );
}

/* ─── Department Section ─────────────────────────────────── */
const RESERVE_PERKS = [
  { title: "One-tap reserve",  body: "Lock a design to your dept instantly." },
  { title: "Auto-access",      body: "Members sign in and they're in. No codes." },
  { title: "Release any time", body: "Free it after sign-out week. Zero fees." },
] as const;

function DepartmentSection() {
  const headerRef = useReveal();
  const cardRef = useReveal();
  return (
    <section
      style={{
        position: "relative",
        padding: "clamp(96px, 12vw, 160px) 0",
        background:
          "radial-gradient(ellipse 70% 50% at 10% 50%, rgba(78,205,196,0.06), transparent 60%), rgba(78,205,196,0.018)",
        overflow: "hidden",
      }}
      id="departments"
    >
      {/* Decorative dept code grid in background */}
      <div aria-hidden style={{ position: "absolute", top: "8%", right: "-10%", opacity: 0.04, color: "#4ECDC4", pointerEvents: "none" }}>
        <div style={{ ...mono, fontSize: 280, fontWeight: 900, letterSpacing: "-0.05em", lineHeight: 1 }}>FYB</div>
      </div>

      <div className="mx-auto px-5 sm:px-8" style={{ maxWidth: 1400, position: "relative" }}>
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-20">
          {/* LEFT: text */}
          <div ref={headerRef} className="nv-stagger">
            <NvEyebrow color="rgba(78,205,196,0.75)">For department heads</NvEyebrow>
            <h2 style={{ ...jkt, fontWeight: 800, fontSize: "clamp(32px, 5vw, 72px)", lineHeight: 0.92, letterSpacing: "-0.03em", textTransform: "uppercase", marginTop: 18, maxWidth: "14ch" }}>
              Reserved for<br />
              <span
                style={{
                  background: "linear-gradient(140deg, #4ECDC4 0%, #FFD700 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                your department.
              </span>
            </h2>
            <p style={{ ...sans, fontSize: "clamp(15px, 1.3vw, 18px)", lineHeight: 1.65, color: "rgba(255,255,255,0.55)", marginTop: 22, maxWidth: "42ch" }}>
              Reserve a template for your department. Members get
              <span style={{ color: "#4ECDC4", fontWeight: 600 }}> automatic access</span>. Outsiders see a polite &ldquo;reserved&rdquo; message.
            </p>

            {/* Perks grid (2x2) */}
            <div
              style={{
                marginTop: 28, marginBottom: 32,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 12,
              }}
            >
              {RESERVE_PERKS.map((p) => (
                <div
                  key={p.title}
                  style={{
                    background: "rgba(78,205,196,0.04)",
                    border: "1px solid rgba(78,205,196,0.18)",
                    borderRadius: 12,
                    padding: "14px 16px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ECDC4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span style={{ ...mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "#4ECDC4", textTransform: "uppercase" }}>
                      {p.title}
                    </span>
                  </div>
                  <p style={{ ...sans, fontSize: 13, lineHeight: 1.55, color: "rgba(255,255,255,0.55)", margin: 0 }}>
                    {p.body}
                  </p>
                </div>
              ))}
            </div>

            <Link
              href="/templates"
              className="nv-laser-btn"
              style={{ height: 54, padding: "0 32px", borderRadius: 8, fontSize: 12, letterSpacing: "0.1em", ...mono, display: "inline-flex", alignItems: "center", gap: 10 }}
            >
              Reserve a design →
            </Link>
          </div>

          {/* RIGHT: Reservation certificate card */}
          <div ref={cardRef} className="nv-reveal">
            <ReservationCertificate />
          </div>
        </div>
      </div>
    </section>
  );
}

function ReservationCertificate() {
  return (
    <div
      style={{
        position: "relative",
        background:
          "linear-gradient(180deg, rgba(20,28,28,0.95), rgba(8,12,12,0.95))",
        border: "1px solid rgba(78,205,196,0.28)",
        borderRadius: 18,
        padding: "clamp(28px, 3.5vw, 44px)",
        boxShadow:
          "0 30px 80px rgba(0,0,0,0.4), 0 0 80px rgba(78,205,196,0.08), inset 0 1px 0 rgba(255,255,255,0.04)",
        overflow: "hidden",
      }}
    >
      {/* Top accent bar (rainbow over teal) */}
      <div
        aria-hidden
        style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 3,
          background:
            "linear-gradient(90deg, #4ECDC4, #FFD700, #4ECDC4)",
        }}
      />

      {/* Watermark in background */}
      <div
        aria-hidden
        style={{
          position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
          opacity: 0.04, color: "#4ECDC4", pointerEvents: "none",
        }}
      >
        <svg width="280" height="280" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.6" aria-hidden>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      </div>

      <div style={{ position: "relative" }}>
        {/* Top row: status */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <span
            style={{
              ...mono, fontSize: 9, letterSpacing: "0.2em",
              color: "#4ECDC4", textTransform: "uppercase",
              padding: "5px 10px",
              border: "1px solid rgba(78,205,196,0.3)",
              borderRadius: 100,
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "rgba(78,205,196,0.06)",
              fontWeight: 700,
            }}
          >
            <span
              style={{
                position: "relative", width: 6, height: 6, display: "inline-flex",
              }}
            >
              <span className="nv-pulse-ring" style={{ position: "absolute", inset: 0, border: "1.5px solid #4ECDC4", borderRadius: "50%" }} />
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ECDC4" }} />
            </span>
            Reserved · Active
          </span>
          <span style={{ ...mono, fontSize: 9, letterSpacing: "0.15em", color: "rgba(78,205,196,0.5)", textTransform: "uppercase" }}>
            cert · #SWE-2026
          </span>
        </div>

        {/* Big "RESERVED" headline */}
        <div style={{ ...jkt, fontWeight: 800, fontSize: "clamp(28px, 3.5vw, 44px)", letterSpacing: "-0.03em", color: "#fff", marginBottom: 4, lineHeight: 1, textTransform: "uppercase" }}>
          Reserved
        </div>
        <div style={{ ...mono, fontSize: 10, letterSpacing: "0.18em", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: 28 }}>
          Sign-out · Class of 2026
        </div>

        {/* Details rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, borderTop: "1px dashed rgba(78,205,196,0.2)", paddingTop: 22 }}>
          <CertRow k="Department" v="Software Engineering" highlight />
          <CertRow k="Members" v="48 finalists · all granted" />
          <CertRow k="Reserved by" v="Amina Okafor (Head)" />
          <CertRow k="Reserved on" v="May 12 · 5:42 PM" />
        </div>

        {/* Auto-access banner */}
        <div
          style={{
            marginTop: 22,
            padding: "14px 16px",
            borderRadius: 10,
            background: "linear-gradient(140deg, rgba(78,205,196,0.1), rgba(255,215,0,0.05))",
            border: "1px solid rgba(78,205,196,0.25)",
            display: "flex", alignItems: "center", gap: 12,
          }}
        >
          <div
            style={{
              flexShrink: 0,
              width: 36, height: 36,
              borderRadius: 8,
              background: "rgba(78,205,196,0.18)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#4ECDC4",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...mono, fontSize: 9, letterSpacing: "0.16em", color: "#4ECDC4", textTransform: "uppercase", fontWeight: 700, marginBottom: 2 }}>
              No passcode needed
            </div>
            <div style={{ ...sans, fontSize: 12, color: "rgba(255,255,255,0.65)", lineHeight: 1.45 }}>
              Members from this dept get auto-access on sign-in. Outsiders see a friendly &ldquo;reserved for SWE&rdquo; message.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CertRow({ k, v, highlight }: { k: string; v: string; highlight?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "baseline" }}>
      <span style={{ ...mono, fontSize: 9, letterSpacing: "0.14em", color: "rgba(255,255,255,0.32)", textTransform: "uppercase", minWidth: 92, flexShrink: 0 }}>{k}</span>
      <span
        style={{
          ...sans, fontSize: 14,
          color: highlight ? "#4ECDC4" : "rgba(255,255,255,0.75)",
          fontWeight: highlight ? 700 : 500,
          letterSpacing: "-0.01em",
        }}
      >
        {v}
      </span>
    </div>
  );
}

/* ─── Pricing ────────────────────────────────────────────── */
const PRICE_FEATURES = [
  { i: "✓", t: "Unlimited editing", s: "Pay only when you export." },
  { i: "✓", t: "Print-ready PNG", s: "High-resolution. Ready for the printer." },
  { i: "✓", t: "Free resume", s: "Lost network? Pick up where you stopped." },
  { i: "✓", t: "Paystack receipt", s: "Card, transfer, or USSD." },
  { i: "✓", t: "Re-export forever", s: "Edit and re-download the same design free." },
] as const;

type PriceRow = { label: string; price: string; revision: string; color: string; winner?: boolean };
const PRICE_COMPARE: PriceRow[] = [
  { label: "Campus designer", price: "₦5,000+", revision: "2-3 day wait", color: "rgba(255,255,255,0.3)" },
  { label: "DIY in Canva",    price: "Hours of fiddling", revision: "Still looks DIY", color: "rgba(255,255,255,0.3)" },
  { label: "FYB Studio",      price: "₦1,000", revision: "Done in 5 min", color: "#FFD700", winner: true },
];

function PricingSection() {
  const ref = useReveal();
  const headerRef = useReveal();
  return (
    <section
      style={{
        position: "relative",
        padding: "clamp(96px, 12vw, 160px) 0",
        background:
          "radial-gradient(ellipse 80% 50% at 50% 100%, rgba(255,215,0,0.06), transparent 70%), rgba(255,215,0,0.014)",
        overflow: "hidden",
      }}
      id="pricing"
    >
      {/* Decorative coins/sparkles in background */}
      <div aria-hidden style={{ position: "absolute", top: "12%", right: "5%", opacity: 0.06, color: "#FFD700", pointerEvents: "none" }}>
        <div style={{ ...jkt, fontSize: 180, fontWeight: 900, transform: "rotate(-12deg)", letterSpacing: "-0.05em" }}>₦</div>
      </div>
      <div aria-hidden style={{ position: "absolute", bottom: "10%", left: "8%", opacity: 0.04, color: "#FFD700", pointerEvents: "none" }}>
        <div style={{ ...jkt, fontSize: 120, fontWeight: 900, transform: "rotate(8deg)", letterSpacing: "-0.05em" }}>1K</div>
      </div>

      <div className="mx-auto px-5 sm:px-8" style={{ maxWidth: 1400, position: "relative" }}>
        {/* Centered header */}
        <div ref={headerRef} className="nv-stagger" style={{ textAlign: "center", marginBottom: "clamp(48px,6vw,80px)" }}>
          <NvEyebrow color="rgba(255,215,0,0.8)">Pricing</NvEyebrow>
          <h2 style={{ ...jkt, fontWeight: 800, fontSize: "clamp(32px, 5.5vw, 80px)", lineHeight: 0.92, letterSpacing: "-0.03em", textTransform: "uppercase", marginTop: 18 }}>
            One price.<br />
            <span className="nv-shimmer-text">No surprises.</span>
          </h2>
          <p style={{ ...sans, fontSize: "clamp(14px, 1.3vw, 17px)", lineHeight: 1.65, color: "rgba(255,255,255,0.45)", marginTop: 18, maxWidth: "54ch", marginLeft: "auto", marginRight: "auto" }}>
            Edit as many designs as you want for free. The ₦1,000 only kicks in when you choose to export the print-ready PNG. No subscription. No starter tier. No mystery quote.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-12 lg:gap-12 lg:items-stretch">
          {/* LEFT: comparison table */}
          <div className="lg:col-span-5" style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 10 }}>
            <div style={{ ...mono, fontSize: 9, letterSpacing: "0.2em", color: "rgba(255,255,255,0.35)", textTransform: "uppercase", marginBottom: 6 }}>
              Compare
            </div>
            {PRICE_COMPARE.map((c) => (
              <div
                key={c.label}
                className="price-compare-row"
                style={{
                  padding: "16px 20px",
                  borderRadius: 12,
                  background: c.winner
                    ? "linear-gradient(140deg, rgba(255,215,0,0.12), rgba(255,140,66,0.06))"
                    : "rgba(255,255,255,0.025)",
                  border: c.winner ? "1px solid rgba(255,215,0,0.35)" : "1px solid rgba(255,255,255,0.06)",
                  boxShadow: c.winner ? "0 12px 30px rgba(255,180,0,0.12)" : "none",
                  display: "grid",
                  gridTemplateColumns: "1.5fr auto 1fr",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <span style={{ ...jkt, fontSize: 14, fontWeight: c.winner ? 800 : 600, color: c.winner ? "#fff" : "rgba(255,255,255,0.75)" }}>
                  {c.label}
                  {c.winner && (
                    <span style={{ ...mono, fontSize: 8, marginLeft: 10, letterSpacing: "0.18em", color: "#FFD700", textTransform: "uppercase", verticalAlign: "middle" }}>
                      Winner
                    </span>
                  )}
                </span>
                <span
                  className="price-compare-price"
                  style={{
                    ...mono, fontSize: 16, fontWeight: 800,
                    color: c.color, letterSpacing: "-0.01em",
                    textAlign: "right",
                  }}
                >
                  {c.price}
                </span>
                <span className="price-compare-revision" style={{ ...mono, fontSize: 10, letterSpacing: "0.08em", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", textAlign: "right" }}>
                  {c.revision}
                </span>
              </div>
            ))}

            {/* Tiny note */}
            <div style={{ ...sans, fontSize: 12, color: "rgba(255,255,255,0.35)", marginTop: 12, fontStyle: "italic", textAlign: "center" }}>
              Less than a shawarma. More than a designer&apos;s quote.
            </div>
          </div>

          {/* RIGHT: pricing card */}
          <div ref={ref} className="nv-reveal lg:col-span-7">
            <div
              style={{
                position: "relative",
                background:
                  "linear-gradient(180deg, rgba(20,16,4,0.96), rgba(8,6,2,0.96))",
                border: "1px solid rgba(255,215,0,0.3)",
                borderRadius: 20,
                padding: "clamp(28px, 3.5vw, 48px)",
                boxShadow:
                  "0 40px 100px rgba(0,0,0,0.5), 0 0 100px rgba(255,180,0,0.1), inset 0 1px 0 rgba(255,255,255,0.05)",
                overflow: "hidden",
              }}
            >
              {/* Top gold gradient bar */}
              <div
                aria-hidden
                style={{
                  position: "absolute", top: 0, left: 0, right: 0, height: 4,
                  background: "linear-gradient(90deg, #FFD700, #FF8C42, #FFD700)",
                }}
              />

              {/* "Most popular" ribbon */}
              <div
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  padding: "5px 12px",
                  borderRadius: 100,
                  background: "rgba(255,215,0,0.12)",
                  border: "1px solid rgba(255,215,0,0.3)",
                  ...mono, fontSize: 9, letterSpacing: "0.22em", color: "#FFD700",
                  textTransform: "uppercase", fontWeight: 700,
                  marginBottom: 18,
                }}
              >
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#FFD700" }} />
                Per-design pricing
              </div>

              {/* The big price */}
              <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 8, flexWrap: "wrap" }}>
                <span
                  className="nv-shimmer-text"
                  style={{
                    ...jkt, fontWeight: 900,
                    fontSize: "clamp(64px, 9vw, 120px)",
                    lineHeight: 1, letterSpacing: "-0.04em",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  ₦1,000
                </span>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ ...mono, fontSize: 11, letterSpacing: "0.18em", color: "rgba(255,215,0,0.7)", textTransform: "uppercase", fontWeight: 700 }}>
                    flat
                  </span>
                  <span style={{ ...mono, fontSize: 9, letterSpacing: "0.18em", color: "rgba(255,255,255,0.35)", textTransform: "uppercase" }}>
                    per design · one-time
                  </span>
                </div>
              </div>

              {/* Features grid */}
              <ul
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: 14,
                  borderTop: "1px dashed rgba(255,215,0,0.2)",
                  paddingTop: 22, marginTop: 18, marginBottom: 28,
                }}
              >
                {PRICE_FEATURES.map((f) => (
                  <li
                    key={f.t}
                    style={{
                      display: "flex", alignItems: "flex-start", gap: 10,
                    }}
                  >
                    <span
                      style={{
                        flexShrink: 0,
                        width: 22, height: 22, borderRadius: "50%",
                        background: "rgba(255,215,0,0.14)",
                        border: "1px solid rgba(255,215,0,0.3)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "#FFD700", fontSize: 12, fontWeight: 700,
                        marginTop: 1,
                      }}
                    >
                      {f.i}
                    </span>
                    <div>
                      <div style={{ ...jkt, fontWeight: 700, fontSize: 14, color: "#fff", letterSpacing: "-0.01em" }}>
                        {f.t}
                      </div>
                      <div style={{ ...sans, fontSize: 12, color: "rgba(255,255,255,0.45)", marginTop: 2, lineHeight: 1.4 }}>
                        {f.s}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <Link
                href="/templates"
                className="nv-laser-btn"
                style={{
                  width: "100%", height: 60,
                  borderRadius: 10, fontSize: 13,
                  letterSpacing: "0.1em", ...mono,
                  display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 10,
                  textTransform: "uppercase",
                }}
              >
                Start designing
              </Link>
              <p style={{ ...mono, fontSize: 9, letterSpacing: "0.18em", color: "rgba(255,255,255,0.32)", textTransform: "uppercase", textAlign: "center", marginTop: 14 }}>
                No card needed yet · Pay only on export
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── FAQ ────────────────────────────────────────────────── */
const FAQ_ITEMS = [
  { q: "Do I need design experience?", a: "No. Every template carries the design intent - fonts, layout, colour rules - and exposes only the fields that matter (your name, your department, your photo). Type, replace, export." },
  { q: "What does the ₦1,000 cover?", a: "One high-resolution PNG export of one design. Editing is always free. If your download fails after payment, you can resume from your dashboard at no extra cost." },
  { q: "How does the department reserve work?", a: "If you're a department head, you can reserve any template for your department in one tap. Members of your department get access automatically when they sign in - no passcodes, no codes to share. Outsiders see a polite 'Reserved for [Department]' message. Release the reservation any time, no monthly fee." },
  { q: "Can I edit a downloaded design later?", a: "Yes - your edits are saved locally on the device you used. Open the design from your dashboard and pick up where you left off. A second download is a fresh ₦1,000." },
  { q: "Is my payment secure?", a: "Payments are processed by Paystack. We never see your card details. Every payment is verified server-side before the download unlocks. You receive an email receipt with the Paystack reference." },
  { q: "What if my download fails mid-way?", a: "Your payment is reserved the moment Paystack confirms it. If the browser dies, network drops, or you close the tab - your dashboard shows a Resume button waiting for you. No extra charge." },
];

function FaqSection() {
  return (
    <section style={{ padding: "clamp(80px, 10vw, 140px) 0", background: "rgba(249,115,22,0.018)" }} id="faq">
      <div className="mx-auto px-5 sm:px-8" style={{ maxWidth: 1400 }}>
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <NvEyebrow color="rgba(249,115,22,0.7)">FAQ</NvEyebrow>
            <h2 style={{ ...jkt, fontWeight: 800, fontSize: "clamp(30px, 4vw, 60px)", lineHeight: 0.95, letterSpacing: "-0.025em", textTransform: "uppercase", marginTop: 16 }}>
              You asked. We answered.
            </h2>
            <p style={{ ...sans, fontSize: 15, lineHeight: 1.6, color: "rgba(255,255,255,0.4)", marginTop: 16, maxWidth: "32ch" }}>
              Real questions from finalists who&apos;ve been exactly where you are.
            </p>
          </div>
          <div className="lg:col-span-8" style={{ display: "flex", flexDirection: "column" }}>
            {FAQ_ITEMS.map(item => <FaqRow key={item.q} q={item.q} a={item.a} />)}
          </div>
        </div>
      </div>
    </section>
  );
}

function FaqRow({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      <button type="button" onClick={() => setOpen(v => !v)}
        className="flex w-full items-start justify-between gap-6 py-5 text-left"
        style={{ background: "transparent", border: "none", cursor: "pointer" }}>
        <span style={{ ...sans, fontSize: "clamp(15px, 1.2vw, 17px)", fontWeight: 600, color: open ? "#fff" : "rgba(255,255,255,0.75)", lineHeight: 1.4, transition: "color 200ms" }}>
          {q}
        </span>
        <span style={{ ...mono, fontSize: 16, color: open ? "#F97316" : "rgba(255,255,255,0.22)", flexShrink: 0, marginTop: 2, transition: "color 200ms, transform 300ms", transform: open ? "rotate(45deg)" : "none" }} aria-hidden>
          +
        </span>
      </button>
      {open && (
        <div style={{ ...sans, fontSize: "clamp(14px, 1.1vw, 15px)", lineHeight: 1.75, color: "rgba(255,255,255,0.42)", paddingBottom: 22, maxWidth: "58ch" }}>
          {a}
        </div>
      )}
    </div>
  );
}

/* ─── Closing CTA ────────────────────────────────────────── */
function ClosingCta({ classYear }: { classYear: number }) {
  const ref = useReveal();
  return (
    <section style={{
      padding: "clamp(80px, 12vw, 160px) 0",
      position: "relative", overflow: "hidden",
      background: "linear-gradient(135deg, rgba(255,107,107,0.07) 0%, rgba(168,85,247,0.07) 40%, rgba(255,215,0,0.06) 80%, rgba(78,205,196,0.05) 100%)",
    }}>
      {/* Rainbow gradient top line */}
      <div aria-hidden style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 3,
        background: "linear-gradient(90deg, #FFD700, #FF6B6B, #A855F7, #4ECDC4, #84CC16, #F97316, #FFD700)",
        zIndex: 1,
      }} />

      {/* Canvas confetti */}
      <ConfettiCanvas />

      {/* Floating decoration - glowing graduation cap */}
      <div aria-hidden style={{ position: "absolute", top: "10%", right: "5%", pointerEvents: "none", zIndex: 0 }}>
        <svg width="120" height="120" viewBox="0 0 80 80" fill="none" style={{ opacity: 0.18, filter: "drop-shadow(0 0 20px rgba(255,215,0,0.4))" }}>
          <polygon points="40,8 72,24 40,40 8,24" fill="#FFD700" />
          <polygon points="40,44 64,32 64,52 40,64 16,52 16,32" fill="rgba(255,215,0,0.5)" />
          <rect x="66" y="24" width="3" height="20" rx="1.5" fill="#FFD700" />
          <circle cx="69" cy="48" r="4" fill="rgba(255,107,107,0.8)" />
        </svg>
      </div>
      <div aria-hidden style={{ position: "absolute", bottom: "15%", right: "14%", width: 100, height: 100, pointerEvents: "none", zIndex: 0 }}>
        <div className="nv-spin-slow" style={{ width: "100%", height: "100%", borderRadius: "50%", border: "1px solid rgba(168,85,247,0.15)" }} />
        <div className="nv-spin-rev" style={{ position: "absolute", inset: 18, borderRadius: "50%", border: "1px dashed rgba(255,215,0,0.12)" }} />
      </div>
      <div aria-hidden style={{ position: "absolute", top: "50%", left: "3%", width: 60, height: 60, pointerEvents: "none", zIndex: 0 }}>
        <div className="nv-spin-rev" style={{ width: "100%", height: "100%", borderRadius: "50%", border: "1px solid rgba(255,107,107,0.12)" }} />
      </div>

      <div className="mx-auto px-5 sm:px-8" style={{ maxWidth: 1400, position: "relative", zIndex: 1 }}>
        <div ref={ref} className="nv-reveal">
          <div style={{ ...mono, fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: 24, display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ width: 24, height: 2, background: "linear-gradient(90deg,#FFD700,#FF6B6B)", display: "inline-block", borderRadius: 2 }} />
            <span style={{ background: "linear-gradient(90deg,#FFD700,#FF8C42)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
              FYB Studio · Class of {classYear}
            </span>
          </div>

          <h2 style={{ ...jkt, fontWeight: 800, fontSize: "clamp(40px, 7.5vw, 110px)", lineHeight: 0.92, letterSpacing: "-0.03em", textTransform: "uppercase", maxWidth: "16ch", marginBottom: 32 }}>
            <span style={{ color: "#fff" }}>Final year </span>
            <span style={{
              background: "linear-gradient(130deg, #FFD700 0%, #FF8C42 50%, #FF6B6B 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
            }}>only happens once.</span>
          </h2>

          <p style={{ ...sans, fontSize: "clamp(16px, 1.4vw, 20px)", lineHeight: 1.65, color: "rgba(255,255,255,0.45)", maxWidth: "52ch", marginBottom: 40 }}>
            Four years of lectures, exams, and early mornings led here. The
            sign-out tee, the poster, the FYB-week banner should feel as big as
            this moment. Designer-quality in five minutes, for the cost of a meal.
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center" }}>
            <Link href="/templates" className="nv-laser-btn"
              style={{ height: 62, padding: "0 52px", borderRadius: 8, fontSize: 14, letterSpacing: "0.06em", ...mono }}>
              Pick your template
            </Link>
            <Link href="/signin" className="nv-ghost-btn"
              style={{ height: 62, padding: "0 36px", borderRadius: 8, fontSize: 12, letterSpacing: "0.08em", ...mono, textTransform: "uppercase" }}>
              Sign in with Google
            </Link>
          </div>

          <p style={{ ...mono, fontSize: 10, letterSpacing: "0.14em", color: "rgba(255,255,255,0.2)", textTransform: "uppercase", marginTop: 40 }}>
            No waiting list. No brief. No mystery quote. Just your design.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ─── Footer ─────────────────────────────────────────────── */
function FooterSection({ classYear }: { classYear: number }) {
  return (
    <footer
      style={{
        position: "relative",
        background:
          "radial-gradient(ellipse 90% 70% at 50% 0%, rgba(255,215,0,0.04), transparent 65%), rgba(0,0,0,0.6)",
        paddingTop: "clamp(80px, 10vw, 120px)",
        paddingBottom: "clamp(80px, 8vw, 120px)",
        overflow: "hidden",
      }}
    >
      {/* Top rainbow gradient bar */}
      <div
        aria-hidden
        style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 3,
          background: "linear-gradient(90deg, #FFD700, #FF6B6B, #A855F7, #4ECDC4, #84CC16, #F97316, #FFD700)",
        }}
      />

      {/* Floating decorative caps */}
      <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
        {[
          { x: "8%",  y: "20%", s: 28, op: 0.08, d: 0 },
          { x: "85%", y: "30%", s: 36, op: 0.06, d: 1.4 },
          { x: "20%", y: "75%", s: 24, op: 0.07, d: 2.8 },
          { x: "75%", y: "70%", s: 32, op: 0.06, d: 0.7 },
        ].map((c, i) => (
          <div
            key={i}
            className="nv-float-slow"
            style={{ position: "absolute", left: c.x, top: c.y, color: "#FFD700", opacity: c.op, animationDelay: `${c.d}s` }}
          >
            <GraduationCap size={c.s} strokeWidth={1.5} />
          </div>
        ))}
      </div>

      <div className="mx-auto px-5 sm:px-8" style={{ maxWidth: 1400, position: "relative" }}>
        {/* HERO PAYOFF - giant brand mark */}
        <div style={{ textAlign: "center", marginBottom: "clamp(56px,7vw,96px)" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
            <span
              aria-hidden
              style={{
                position: "relative", width: 8, height: 8, display: "inline-flex",
              }}
            >
              <span className="nv-pulse-ring" style={{ position: "absolute", inset: 0, border: "1.5px solid rgba(255,215,0,0.55)", borderRadius: "50%" }} />
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#FFD700" }} />
            </span>
            <span style={{ ...mono, fontSize: 10, letterSpacing: "0.3em", color: "rgba(255,215,0,0.65)", textTransform: "uppercase", fontWeight: 700 }}>
              The Studio · Class of {classYear}
            </span>
          </div>

          <h3
            className="nv-shimmer-text"
            style={{
              ...jkt, fontWeight: 900,
              fontSize: "clamp(48px, 9vw, 140px)",
              letterSpacing: "-0.04em", lineHeight: 0.88,
              margin: "0 auto",
              maxWidth: "12ch",
              textTransform: "uppercase",
            }}
          >
            You made it.
          </h3>
          <p style={{ ...sans, fontSize: "clamp(14px, 1.3vw, 17px)", color: "rgba(255,255,255,0.45)", marginTop: 18, maxWidth: "44ch", marginLeft: "auto", marginRight: "auto", lineHeight: 1.65 }}>
            FYB week only happens once. Make a poster that matches the moment.
          </p>

          {/* Bottom CTA */}
          <div style={{ marginTop: 28, display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
            <Link
              href="/templates"
              className="nv-laser-btn"
              style={{ height: 54, padding: "0 32px", borderRadius: 10, fontSize: 12, letterSpacing: "0.1em", ...mono, display: "inline-flex", alignItems: "center", gap: 10, textTransform: "uppercase" }}
            >
              Open the studio
            </Link>
            <Link
              href="/signin"
              className="nv-ghost-btn"
              style={{ height: 54, padding: "0 28px", borderRadius: 10, fontSize: 11, letterSpacing: "0.1em", ...mono, display: "inline-flex", alignItems: "center", textTransform: "uppercase" }}
            >
              Sign in
            </Link>
          </div>
        </div>

        {/* Link columns */}
        <div className="grid gap-10 sm:grid-cols-12">
          <div className="sm:col-span-4">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <span
                aria-hidden
                style={{
                  position: "relative",
                  display: "inline-flex",
                  width: 36, height: 36,
                  borderRadius: 10,
                  overflow: "hidden",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.jpg" alt="FYB" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </span>
              <div style={{ lineHeight: 1 }}>
                <div style={{ ...mono, fontSize: 12, fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#fff" }}>
                  FYB Studio
                </div>
                <div style={{ ...mono, fontSize: 8, letterSpacing: "0.3em", color: "rgba(255,215,0,0.5)", textTransform: "uppercase", marginTop: 2 }}>
                  fybstudio.art
                </div>
              </div>
            </div>
            <p style={{ ...sans, fontSize: 13, lineHeight: 1.65, color: "rgba(255,255,255,0.35)", maxWidth: "38ch" }}>
              Designer-built templates for the Class of {classYear}. Pick, fill, export in the time it takes to eat lunch. No waiting. No brief. Just your design.
            </p>
          </div>

          <FooterCol heading="Product">
            <FLink href="/templates">Templates</FLink>
            <FLink href="#how">How it works</FLink>
            <FLink href="#pricing">Pricing</FLink>
            <FLink href="#faq">FAQ</FLink>
          </FooterCol>

          <FooterCol heading="For heads">
            <FLink href="#departments">Reserve a template</FLink>
            <FLink href="/dashboard">Manage reservations</FLink>
          </FooterCol>

          <FooterCol heading="Account">
            <FLink href="/dashboard">Dashboard</FLink>
            <FLink href="/signin">Sign in</FLink>
          </FooterCol>

          <FooterCol heading="Studio">
            <FLink href="#memory">Memory Lane</FLink>
            <FLink href="#wall">Wall of the Class</FLink>
          </FooterCol>
        </div>

        {/* Bottom strip */}
        <div
          style={{
            marginTop: 64, paddingTop: 24,
            borderTop: "1px solid rgba(255,215,0,0.1)",
            display: "flex", flexWrap: "wrap",
            alignItems: "center", justifyContent: "space-between", gap: 16,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <span style={{ ...mono, fontSize: 10, letterSpacing: "0.12em", color: "rgba(255,255,255,0.32)", textTransform: "uppercase" }}>
              © {classYear} FYB Studio
            </span>
            <span style={{ opacity: 0.2 }}>·</span>
            <span style={{ ...mono, fontSize: 10, letterSpacing: "0.12em", color: "rgba(255,215,0,0.45)", textTransform: "uppercase", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "#FFD700" }}>♥</span>
              Made for the class
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ ...mono, fontSize: 10, letterSpacing: "0.12em", color: "rgba(255,255,255,0.32)", textTransform: "uppercase" }}>
              fybstudio.art
            </span>
            <span style={{ opacity: 0.2 }}>·</span>
            <span style={{ ...mono, fontSize: 10, letterSpacing: "0.12em", color: "rgba(255,255,255,0.32)", textTransform: "uppercase" }}>
              Designed in 🇳🇬
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <div className="sm:col-span-2">
      <div style={{ ...mono, fontSize: 9, letterSpacing: "0.18em", color: "rgba(255,215,0,0.55)", textTransform: "uppercase", marginBottom: 14, fontWeight: 700 }}>
        {heading}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>
    </div>
  );
}

function FLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      style={{ ...sans, fontSize: 14, color: "rgba(255,255,255,0.5)", textDecoration: "none", transition: "color 200ms, transform 200ms", display: "inline-block" }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = "#FFD700";
        e.currentTarget.style.transform = "translateX(2px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = "rgba(255,255,255,0.5)";
        e.currentTarget.style.transform = "translateX(0)";
      }}
    >
      {children}
    </Link>
  );
}

/* ─── Mobile Bottom Nav ──────────────────────────────────── */
function MobileBottomNav() {
  // Appears once the user scrolls past the hero. Per-item stagger on
  // first reveal, auth-aware items (Sign in collapses into Dashboard for
  // logged-in users), and an animated active-state highlight tied to the
  // current hash so the user always sees "where they are".
  const [visible, setVisible] = useState(false);
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const [activeHash, setActiveHash] = useState<string>("");
  const { status } = useSession();
  const isAuthed = status === "authenticated";

  useEffect(() => {
    const threshold = 220;
    let raf = 0;
    const update = () => {
      raf = 0;
      setVisible(window.scrollY > threshold);
    };
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Track which in-page section is in view so the matching pill highlights.
  useEffect(() => {
    const sections = ["pricing", "departments", "memory", "how"]
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => !!el);
    if (sections.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio > 0.3) {
            setActiveHash("#" + entry.target.id);
          }
        }
      },
      { threshold: [0.3, 0.6] },
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, []);

  // Item set is auth-aware. Signed-in users see Dashboard instead of Sign in,
  // and the Templates / Pricing / Home shortcuts stay the same.
  const items: Array<{ key: string; label: string; href: string; icon: ReactNode }> = isAuthed
    ? [
        { key: "home", label: "Home", href: "/", icon: <NavIconHome /> },
        { key: "templates", label: "Templates", href: "/templates", icon: <NavIconLayers /> },
        { key: "pricing", label: "Pricing", href: "#pricing", icon: <NavIconTag /> },
        { key: "dashboard", label: "Studio", href: "/dashboard", icon: <NavIconStar /> },
      ]
    : [
        { key: "home", label: "Home", href: "/", icon: <NavIconHome /> },
        { key: "templates", label: "Templates", href: "/templates", icon: <NavIconLayers /> },
        { key: "pricing", label: "Pricing", href: "#pricing", icon: <NavIconTag /> },
      ];

  return (
    <nav
      aria-label="Page navigation"
      style={{
        position: "fixed", bottom: 18, left: "50%",
        transform: visible ? "translateX(-50%) translateY(0)" : "translateX(-50%) translateY(140%)",
        zIndex: 40,
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        background: "linear-gradient(180deg, rgba(20,16,4,0.88), rgba(8,8,8,0.92))",
        border: "1px solid rgba(255,215,0,0.22)",
        borderRadius: 100,
        display: "flex", alignItems: "center",
        height: 56, padding: "0 6px",
        boxShadow:
          "0 24px 60px rgba(0,0,0,0.7), 0 0 50px rgba(255,180,0,0.08), 0 1px 0 rgba(255,255,255,0.06) inset",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        transition:
          "transform 600ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 400ms cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      {/* Subtle gold rim that animates with the nav reveal */}
      <span
        aria-hidden
        style={{
          position: "absolute", inset: -1,
          borderRadius: 100,
          background:
            "linear-gradient(90deg, transparent 0%, rgba(255,215,0,0.35) 50%, transparent 100%)",
          opacity: visible ? 0.6 : 0,
          filter: "blur(1px)",
          transition: "opacity 600ms 200ms ease",
          pointerEvents: "none",
        }}
      />

      {items.map((item, i) => {
        const isActive = item.href.startsWith("#")
          ? activeHash === item.href
          : false;
        const isPressed = pressedKey === item.key;
        return (
          <Link
            key={item.key}
            href={item.href}
            onPointerDown={() => setPressedKey(item.key)}
            onPointerUp={() => setPressedKey(null)}
            onPointerLeave={() => setPressedKey(null)}
            style={{
              ...mono,
              fontSize: 10,
              letterSpacing: "0.1em",
              color: isActive ? "#000" : "rgba(255,255,255,0.62)",
              textDecoration: "none",
              textTransform: "uppercase",
              fontWeight: 700,
              position: "relative",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              minHeight: 44,
              padding: "0 14px",
              borderRadius: 100,
              background: isActive
                ? "linear-gradient(140deg, #FFD700, #FFB400)"
                : "transparent",
              boxShadow: isActive
                ? "0 6px 16px rgba(255,180,0,0.35), inset 0 1px 0 rgba(255,255,255,0.3)"
                : "none",
              transform: isPressed ? "scale(0.92)" : "scale(1)",
              transition:
                "transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1), color 200ms, background 250ms, box-shadow 250ms",
              whiteSpace: "nowrap",
              animation: visible
                ? `nv-bottomnav-in 500ms cubic-bezier(0.34, 1.56, 0.64, 1) both ${i * 70}ms`
                : undefined,
            }}
            onMouseEnter={(e) => {
              if (isActive) return;
              e.currentTarget.style.color = "#FFD700";
              e.currentTarget.style.background = "rgba(255,215,0,0.08)";
            }}
            onMouseLeave={(e) => {
              if (isActive) return;
              e.currentTarget.style.color = "rgba(255,255,255,0.62)";
              e.currentTarget.style.background = "transparent";
            }}
          >
            <span
              aria-hidden
              style={{
                display: "inline-flex",
                transform: isPressed ? "rotate(-8deg)" : "rotate(0deg)",
                transition: "transform 250ms cubic-bezier(0.34, 1.56, 0.64, 1)",
              }}
            >
              {item.icon}
            </span>
            {item.label}
          </Link>
        );
      })}
      <style>{`
        @keyframes nv-bottomnav-in {
          0%   { opacity: 0; transform: translateY(12px) scale(0.85); }
          60%  { opacity: 1; transform: translateY(0) scale(1.04); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </nav>
  );
}

/* ─── Bottom nav icons ─────────────────────────────────── */
function NavIconHome() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 11l9-8 9 8" />
      <path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10" />
    </svg>
  );
}
function NavIconLayers() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="12 2 22 7 12 12 2 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}
function NavIconTag() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z" />
      <circle cx="7" cy="7" r="1.5" fill="currentColor" />
    </svg>
  );
}
function NavIconStar() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" aria-hidden>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════
   Animation components
   ═══════════════════════════════════════════════════════════ */

/* ── Particle constellation canvas ── */
function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio, 2);
    function resize() {
      if (!canvas || !ctx) return;
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.scale(dpr, dpr);
    }
    resize();
    window.addEventListener("resize", resize);

    const N = 55;
    const particles = Array.from({ length: N }, () => ({
      x: Math.random() * canvas.offsetWidth,
      y: Math.random() * canvas.offsetHeight,
      vx: (Math.random() - 0.5) * 0.25,
      vy: (Math.random() - 0.5) * 0.25,
      r: Math.random() * 1.2 + 0.4,
      op: Math.random() * 0.18 + 0.04,
    }));

    let raf: number;
    function draw() {
      if (!canvas || !ctx) return;
      const W = canvas.offsetWidth, H = canvas.offsetHeight;
      ctx.clearRect(0, 0, W, H);

      for (const p of particles) {
        p.x = (p.x + p.vx + W) % W;
        p.y = (p.y + p.vy + H) % H;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${p.op})`;
        ctx.fill();
      }

      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 110) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(255,255,255,${0.045 * (1 - d / 110)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(draw);
    }
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  return (
    <canvas ref={canvasRef} aria-hidden style={{
      position: "absolute", inset: 0, width: "100%", height: "100%",
      pointerEvents: "none", zIndex: 0,
    }} />
  );
}

/* ── Canvas confetti burst ── */
const CONFETTI_COLORS = [
  "#FFD700", "#FF6B6B", "#4ECDC4", "#A855F7",
  "#F97316", "#84CC16", "#06B6D4", "#EC4899",
  "#FFED4A", "#FF4757", "#1DD1C4", "#9333EA",
];

function ConfettiCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        obs.disconnect();
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
        const W = canvas.width, H = canvas.height;

        /* Three bursts from bottom corners + center */
        const origins = [
          { x: W * 0.15, y: H * 0.9 },
          { x: W * 0.50, y: H * 0.85 },
          { x: W * 0.85, y: H * 0.9 },
        ];

        type Shape = "rect" | "circle" | "strip";
        interface Piece {
          x: number; y: number; vx: number; vy: number;
          w: number; h: number; rot: number; rotV: number;
          color: string; op: number; decay: number; shape: Shape;
        }

        const burst: Piece[] = [];
        origins.forEach(o => {
          for (let i = 0; i < 32; i++) {
            const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4;
            const speed = 2.5 + Math.random() * 5;
            burst.push({
              x: o.x + (Math.random() - 0.5) * 40,
              y: o.y,
              vx: Math.cos(angle) * speed,
              vy: Math.sin(angle) * speed,
              w: 5 + Math.random() * 8,
              h: 3 + Math.random() * 6,
              rot: Math.random() * Math.PI * 2,
              rotV: (Math.random() - 0.5) * 0.2,
              color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
              op: 0.7 + Math.random() * 0.3,
              decay: 0.004 + Math.random() * 0.007,
              shape: (["rect", "rect", "circle", "strip"] as Shape[])[Math.floor(Math.random() * 4)],
            });
          }
        });

        let raf: number;
        function draw() {
          if (!canvas || !ctx) return;
          ctx.clearRect(0, 0, W, H);
          let alive = false;
          for (const p of burst) {
            if (p.op <= 0) continue;
            alive = true;
            p.x += p.vx; p.y += p.vy; p.vy += 0.1; p.vx *= 0.992;
            p.rot += p.rotV; p.op -= p.decay;
            ctx.save();
            ctx.globalAlpha = Math.max(0, p.op);
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.fillStyle = p.color;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 4;
            if (p.shape === "circle") {
              ctx.beginPath(); ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2); ctx.fill();
            } else if (p.shape === "strip") {
              ctx.fillRect(-p.w * 0.5, -p.h * 0.15, p.w, p.h * 0.3);
            } else {
              ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            }
            ctx.restore();
          }
          if (alive) raf = requestAnimationFrame(draw);
        }
        draw();
        return () => cancelAnimationFrame(raf);
      },
      { threshold: 0.25 }
    );
    obs.observe(wrap);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={wrapRef} aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0 }}>
      <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
    </div>
  );
}

/* ── Animated headline words ── */
function AnimatedWords({ text, delay = 0, style }: { text: string; delay?: number; style?: CSSProperties }) {
  const words = text.split(" ");
  return (
    <span style={style}>
      {words.map((word, i) => (
        <span key={i} className="nv-word-clip" style={{ marginRight: "0.24em" }}>
          <span className="nv-word-inner" style={{ animationDelay: `${delay + i * 90}ms` }}>
            {word}
          </span>
        </span>
      ))}
    </span>
  );
}


/* ── Loading screen (first-visit only) - ceremony prelude ── */
/* ── Cinematic intro: curtain open → confetti puff → trigger welcome ── */
function LoadingScreen({ onDone }: { onDone: () => void }) {
  // Phase timing - celebration countdown → curtain opens → confetti puff
  //   0–2700ms  : "3, 2, 1" countdown over the closed curtains
  //   2700ms    : curtains start opening
  //   3300ms    : confetti puff bursts from center as curtains pass mid-point
  //   4300ms    : curtains fully open, layer fades out → trigger welcome
  const [phase, setPhase] = useState<"countdown" | "opening" | "open">("countdown");
  const [tick, setTick] = useState(3);
  const puffCanvasRef = useRef<HTMLCanvasElement>(null);

  // 3-2-1 countdown ticks every 700ms
  useEffect(() => {
    if (phase !== "countdown") return;
    const a = window.setTimeout(() => setTick(2), 700);
    const b = window.setTimeout(() => setTick(1), 1400);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
  }, [phase]);

  // Phase transitions
  useEffect(() => {
    const t1 = window.setTimeout(() => setPhase("opening"), 2100);
    const t2 = window.setTimeout(() => setPhase("open"), 3700);
    const t3 = window.setTimeout(onDone, 4400);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [onDone]);

  // Fire confetti puff from center exactly as curtains pass mid-point
  useEffect(() => {
    if (phase !== "opening") return;
    const fireDelay = 600;
    const t = window.setTimeout(() => firePuff(puffCanvasRef.current), fireDelay);
    return () => window.clearTimeout(t);
  }, [phase]);

  const curtainOpen = phase !== "countdown";
  const layerOut = phase === "open";

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        pointerEvents: layerOut ? "none" : "auto",
        opacity: layerOut ? 0 : 1,
        transition: "opacity 700ms cubic-bezier(0.4,0,0.2,1)",
        overflow: "hidden",
      }}
      aria-hidden
    >
      {/* Backdrop behind the curtains - soft gold radial */}
      <div
        style={{
          position: "absolute", inset: 0,
          background:
            "radial-gradient(ellipse 60% 45% at 50% 50%, rgba(255,180,0,0.18), rgba(8,6,2,1) 70%), #050505",
        }}
      />

      {/* Confetti puff canvas - rendered behind the curtains so the puff is
          REVEALED as the curtains open over it */}
      <canvas
        ref={puffCanvasRef}
        style={{
          position: "absolute", inset: 0,
          width: "100%", height: "100%",
          pointerEvents: "none",
        }}
      />

      {/* Brand mark - small, top-center, fades out as curtains start to open */}
      <div
        style={{
          position: "absolute",
          top: "clamp(36px, 8vh, 72px)",
          left: 0, right: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 9,
          opacity: phase === "countdown" ? 1 : 0,
          transition: "opacity 400ms cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            style={{
              position: "relative",
              display: "inline-flex",
              width: 32, height: 32,
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.jpg" alt="FYB" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </span>
          <span
            style={{
              ...mono, fontSize: 11, fontWeight: 800,
              letterSpacing: "0.32em", color: "rgba(255,255,255,0.85)", textTransform: "uppercase",
            }}
          >
            FYB Studio
          </span>
        </div>
      </div>

      {/* Celebration countdown - big "3, 2, 1" with ring + tagline */}
      <div
        style={{
          position: "absolute", inset: 0,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          zIndex: 9,
          opacity: phase === "countdown" ? 1 : 0,
          transition: "opacity 350ms cubic-bezier(0.4,0,0.2,1)",
          pointerEvents: "none",
        }}
      >
        {/* "The ceremony begins in" tag */}
        <div
          style={{
            display: "inline-flex", alignItems: "center", gap: 10,
            marginBottom: 28,
          }}
        >
          <span
            style={{
              position: "relative", width: 7, height: 7, display: "inline-flex",
            }}
          >
            <span className="nv-pulse-ring" style={{ position: "absolute", inset: 0, border: "1.5px solid rgba(255,215,0,0.6)", borderRadius: "50%" }} />
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#FFD700" }} />
          </span>
          <span
            style={{
              ...mono, fontSize: 11, letterSpacing: "0.3em",
              color: "rgba(255,215,0,0.8)", textTransform: "uppercase",
              fontWeight: 700,
            }}
          >
            The ceremony begins in
          </span>
        </div>

        {/* Countdown digit with pulse ring */}
        <div
          key={tick}
          style={{
            position: "relative",
            display: "inline-flex",
            alignItems: "center", justifyContent: "center",
            width: 200, height: 200,
            animation: "nv-countdown-pop 700ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
          }}
        >
          {/* Outer pulsing rings */}
          <span
            aria-hidden
            style={{
              position: "absolute", inset: -10,
              borderRadius: "50%",
              border: "1.5px solid rgba(255,215,0,0.25)",
            }}
          />
          <span
            aria-hidden
            style={{
              position: "absolute", inset: 8,
              borderRadius: "50%",
              border: "1.5px dashed rgba(255,215,0,0.4)",
              animation: "nv-spin-cw 12s linear infinite",
            }}
          />
          <span
            aria-hidden
            style={{
              position: "absolute", inset: 0,
              borderRadius: "50%",
              background: "radial-gradient(circle, rgba(255,180,0,0.18), transparent 70%)",
              filter: "blur(8px)",
            }}
          />
          {/* The digit */}
          <span
            className="nv-shimmer-text"
            style={{
              ...jkt,
              fontSize: 180, fontWeight: 900,
              lineHeight: 1, letterSpacing: "-0.04em",
              fontVariantNumeric: "tabular-nums",
              display: "inline-block",
            }}
          >
            {tick}
          </span>
        </div>

        {/* Subtitle */}
        <div
          style={{
            marginTop: 28,
            ...mono, fontSize: 10, letterSpacing: "0.28em",
            color: "rgba(255,255,255,0.5)", textTransform: "uppercase",
          }}
        >
          Class of {getClassYear()} · One unforgettable week
        </div>
      </div>

      {/* LEFT curtain - solid then slides off-screen left */}
      <div
        style={{
          position: "absolute", top: 0, bottom: 0, left: 0,
          width: "50%",
          background: "linear-gradient(90deg, #050505 0%, #0c0904 100%)",
          borderRight: curtainOpen ? "1px solid rgba(255,215,0,0.35)" : "none",
          transform: curtainOpen ? "translateX(-100%)" : "translateX(0)",
          transition: "transform 1500ms cubic-bezier(0.76, 0, 0.24, 1)",
          zIndex: 10,
          boxShadow: curtainOpen ? "10px 0 40px rgba(255,180,0,0.18)" : "none",
        }}
      />
      {/* RIGHT curtain */}
      <div
        style={{
          position: "absolute", top: 0, bottom: 0, right: 0,
          width: "50%",
          background: "linear-gradient(270deg, #050505 0%, #0c0904 100%)",
          borderLeft: curtainOpen ? "1px solid rgba(255,215,0,0.35)" : "none",
          transform: curtainOpen ? "translateX(100%)" : "translateX(0)",
          transition: "transform 1500ms cubic-bezier(0.76, 0, 0.24, 1)",
          zIndex: 10,
          boxShadow: curtainOpen ? "-10px 0 40px rgba(255,180,0,0.18)" : "none",
        }}
      />

      {/* Top rim light - appears as curtains begin to part */}
      <div
        style={{
          position: "absolute", top: 0, left: 0, right: 0,
          height: 2,
          background: "linear-gradient(90deg, transparent, #FFD700 50%, transparent)",
          opacity: curtainOpen ? 1 : 0,
          transition: "opacity 600ms 200ms cubic-bezier(0.4,0,0.2,1)",
          zIndex: 11,
          filter: "drop-shadow(0 0 12px #FFD700)",
        }}
      />
    </div>
  );
}

/**
 * Pre-computed (deterministic) confetti particles. Avoids Math.random in render
 * which would trigger React 19 purity warnings. Each particle gets a
 * stable angle, distance, color, rotation, and size.
 */
const PUFF_PARTICLES = Array.from({ length: 120 }).map((_, i) => {
  const a = Math.sin(i * 12.9898) * 43758.5453;
  const b = Math.sin(i * 78.233) * 43758.5453;
  const c = Math.sin(i * 39.346) * 43758.5453;
  const ra = a - Math.floor(a);
  const rb = b - Math.floor(b);
  const rc = c - Math.floor(c);
  const angle = ra * Math.PI * 2;
  const speed = 6 + rb * 18;
  const colors = ["#FFD700", "#FFED4A", "#FF8C42", "#FF6B6B", "#4ECDC4", "#A855F7", "#84CC16", "#06B6D4", "#EC4899"];
  return {
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed - 4, // slight upward bias for a celebratory rise
    rotV: (rc - 0.5) * 0.45,
    color: colors[i % colors.length],
    w: 4 + rb * 7,
    h: 6 + ra * 9,
    shape: (["rect", "rect", "circle", "ribbon"] as const)[i % 4],
  };
});

function firePuff(canvas: HTMLCanvasElement | null) {
  if (!canvas) return;
  const W = canvas.clientWidth || window.innerWidth;
  const H = canvas.clientHeight || window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);

  const cx = W / 2;
  const cy = H / 2;
  const particles = PUFF_PARTICLES.map((p) => ({
    x: cx, y: cy,
    vx: p.vx, vy: p.vy,
    rot: 0, rotV: p.rotV,
    w: p.w, h: p.h,
    color: p.color,
    shape: p.shape,
    opacity: 1,
  }));

  let lastTime = performance.now();
  let raf = 0;
  const draw = (now: number) => {
    const dt = now - lastTime;
    lastTime = now;
    ctx.clearRect(0, 0, W, H);
    let alive = false;
    for (const p of particles) {
      if (p.opacity <= 0) continue;
      alive = true;
      const f = dt / 16;
      p.x += p.vx * f;
      p.y += p.vy * f;
      p.vy += 0.35 * f;       // gravity
      p.vx *= Math.pow(0.985, f); // drag
      p.rot += p.rotV * f;
      // Fade out as it falls below the viewport
      if (p.y > H * 0.6) p.opacity = Math.max(0, p.opacity - 0.02 * f);

      ctx.save();
      ctx.globalAlpha = p.opacity;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      if (p.shape === "circle") {
        ctx.beginPath();
        ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === "ribbon") {
        ctx.beginPath();
        ctx.moveTo(-p.w / 2, -p.h / 5);
        ctx.quadraticCurveTo(0, -p.h * 0.6, p.w / 2, -p.h / 5);
        ctx.quadraticCurveTo(0, p.h * 0.6, -p.w / 2, p.h / 5);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
      ctx.restore();
    }
    if (alive) raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);
  return () => cancelAnimationFrame(raf);
}

/* ── Celebration modal - opening ceremony moment ── */
const CEL_COLORS = [
  "#FFD700", "#FFED4A", // gold
  "#FF6B6B", "#FF4757", // coral/red
  "#4ECDC4", "#1DD1C4", // teal
  "#A855F7", "#9333EA", // purple
  "#F97316", "#FB923C", // orange
  "#84CC16", "#A3E635", // lime
  "#06B6D4", "#22D3EE", // cyan
  "#EC4899", "#F472B6", // pink
];

function CelebrationModal({ classYear, onClose }: { classYear: number; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cardIn, setCardIn] = useState(false);
  const [closing, setClosing] = useState(false);
  const [yearChars, setYearChars] = useState(0);

  // Type-on the class year
  useEffect(() => {
    const str = String(classYear);
    let i = 0;
    const id = setInterval(() => {
      i++;
      setYearChars(i);
      if (i >= str.length) clearInterval(id);
    }, 180);
    return () => clearInterval(id);
  }, [classYear]);

  useEffect(() => {
    const t = setTimeout(() => setCardIn(true), 180);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    type Shape = "rect" | "circle" | "ribbon" | "strip";
    interface Puff {
      x: number; y: number; vx: number; vy: number;
      rot: number; rotV: number;
      w: number; h: number;
      color: string; opacity: number; shape: Shape;
      delay: number;
    }

    /* Three origin bursts: bottom-left, center-bottom, bottom-right */
    const origins = [
      { x: W * 0.20, y: H * 0.72, spread: 1.2 },
      { x: W * 0.50, y: H * 0.68, spread: 1.5 },
      { x: W * 0.80, y: H * 0.72, spread: 1.2 },
    ];

    const particles: Puff[] = [];
    origins.forEach((o, oi) => {
      for (let i = 0; i < 80; i++) {
        /* Spread upward-biased cone */
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * o.spread;
        const speed = 10 + Math.random() * 20;
        particles.push({
          x: o.x + (Math.random() - 0.5) * 30,
          y: o.y + (Math.random() - 0.5) * 20,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          rot: Math.random() * Math.PI * 2,
          rotV: (Math.random() - 0.5) * 0.36,
          w: 7 + Math.random() * 13,
          h: 4 + Math.random() * 8,
          color: CEL_COLORS[Math.floor(Math.random() * CEL_COLORS.length)],
          opacity: 0,
          shape: (["rect", "rect", "circle", "ribbon", "strip"] as Shape[])[Math.floor(Math.random() * 5)],
          delay: oi * 80 + Math.random() * 60,
        });
      }
    });

    let elapsed = 0;
    let lastTime = performance.now();
    let raf: number;

    const draw = (now: number) => {
      const dt = now - lastTime;
      lastTime = now;
      elapsed += dt;

      ctx.clearRect(0, 0, W, H);
      let alive = false;

      for (const p of particles) {
        if (elapsed < p.delay) { alive = true; continue; }
        const age = elapsed - p.delay;

        /* Fade in fast, fade out when low */
        if (age < 80) p.opacity = Math.min(1, age / 80);
        if (p.y > H * 0.82) p.opacity = Math.max(0, p.opacity - 0.018);

        p.x += p.vx * (dt / 16);
        p.y += p.vy * (dt / 16);
        p.vy += 0.45 * (dt / 16);  /* gravity */
        p.vx *= Math.pow(0.984, dt / 16);  /* air drag */
        p.rot += p.rotV * (dt / 16);

        if (p.opacity <= 0) continue;
        alive = true;

        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 6;

        switch (p.shape) {
          case "circle":
            ctx.beginPath();
            ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
            ctx.fill();
            break;
          case "ribbon":
            ctx.beginPath();
            ctx.moveTo(-p.w / 2, -p.h / 5);
            ctx.quadraticCurveTo(0, -p.h * 0.6, p.w / 2, -p.h / 5);
            ctx.quadraticCurveTo(0, p.h * 0.6, -p.w / 2, p.h / 5);
            ctx.closePath();
            ctx.fill();
            break;
          case "strip":
            ctx.fillRect(-p.w * 0.5, -p.h * 0.2, p.w, p.h * 0.4);
            break;
          default:
            ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }
        ctx.restore();
      }

      if (alive) raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const handleClose = () => {
    setClosing(true);
    setTimeout(onClose, 400);
  };

  const yearStr = String(classYear);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9998,
        background:
          "radial-gradient(ellipse 60% 50% at 50% 45%, rgba(20,12,4,0.96), rgba(0,0,0,0.98))",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "opacity 500ms ease",
        opacity: closing ? 0 : 1,
        overflow: "hidden",
      }}
    >
      {/* Full-screen confetti canvas */}
      <canvas
        ref={canvasRef}
        aria-hidden
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 3 }}
      />

      {/* Stadium spotlight beams behind the stage */}
      <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 1 }}>
        {[
          { l: "10%", w: "30%", c: "rgba(255,215,0,0.10)", d: 6, dl: 0 },
          { l: "35%", w: "30%", c: "rgba(255,140,66,0.08)", d: 7, dl: 1.5 },
          { l: "60%", w: "30%", c: "rgba(168,85,247,0.08)", d: 8, dl: 3 },
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

      {/* Ambient floating caps (slow) */}
      <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2, overflow: "hidden" }}>
        {[
          { l: "8%",  t: "18%", s: 28, op: 0.25, d: 0,   sp: 16 },
          { l: "88%", t: "22%", s: 24, op: 0.22, d: 1.4, sp: 19 },
          { l: "14%", t: "72%", s: 32, op: 0.20, d: 2.8, sp: 22 },
          { l: "84%", t: "76%", s: 26, op: 0.20, d: 0.7, sp: 18 },
          { l: "50%", t: "8%",  s: 22, op: 0.20, d: 1.9, sp: 24 },
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

      {/* Ceremony stage - centerpiece */}
      <div
        style={{
          position: "relative", zIndex: 5,
          textAlign: "center",
          padding: "0 24px",
          maxWidth: "min(720px, 92vw)",
          transition: "opacity 800ms cubic-bezier(0.16,1,0.3,1), transform 800ms cubic-bezier(0.16,1,0.3,1)",
          opacity: cardIn ? 1 : 0,
          transform: cardIn ? "translateY(0) scale(1)" : "translateY(40px) scale(0.94)",
        }}
      >
        {/* Top: "THE CEREMONY BEGINS" eyebrow */}
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 28 }}>
          <span
            style={{
              position: "relative", width: 7, height: 7, display: "inline-flex",
            }}
          >
            <span className="nv-pulse-ring" style={{ position: "absolute", inset: 0, border: "1.5px solid rgba(255,215,0,0.6)", borderRadius: "50%" }} />
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#FFD700" }} />
          </span>
          <span style={{ ...mono, fontSize: 10, letterSpacing: "0.4em", color: "rgba(255,215,0,0.75)", textTransform: "uppercase", fontWeight: 700 }}>
            The Ceremony Begins
          </span>
        </div>

        {/* Massive shimmering "CLASS OF YYYY" */}
        <div style={{ marginBottom: "clamp(16px, 2vw, 22px)" }}>
          <div
            style={{
              ...jkt, fontWeight: 800, fontSize: "clamp(22px, 3vw, 36px)",
              color: "rgba(255,255,255,0.7)",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Class of
          </div>
          <div
            className="nv-shimmer-text"
            style={{
              ...jkt, fontWeight: 900,
              fontSize: "clamp(96px, 18vw, 220px)",
              lineHeight: 0.85,
              letterSpacing: "-0.04em",
              fontVariantNumeric: "tabular-nums",
              display: "inline-block",
            }}
          >
            {yearStr.slice(0, yearChars)}
            {yearChars < yearStr.length && (
              <span style={{ display: "inline-block", width: "0.08em", marginLeft: 2, color: "#FFD700", opacity: 0.6 }}>|</span>
            )}
          </div>
        </div>

        {/* Tagline */}
        <p
          style={{
            ...sans, fontSize: "clamp(16px, 1.5vw, 19px)",
            lineHeight: 1.55, color: "rgba(255,255,255,0.6)",
            maxWidth: "44ch", margin: "0 auto 32px",
            fontWeight: 500,
          }}
        >
          Welcome, finalist. You walked four years to get here.<br />
          <span style={{ color: "rgba(255,215,0,0.85)", fontWeight: 600 }}>The week is yours. The studio is open.</span>
        </p>

        {/* Decorative divider with "PROGRAM" badge */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginBottom: 28 }}>
          <span style={{ height: 1, width: "clamp(40px,10vw,80px)", background: "linear-gradient(to right, transparent, rgba(255,215,0,0.5))" }} />
          <span style={{ ...mono, fontSize: 8, letterSpacing: "0.3em", color: "rgba(255,215,0,0.55)", textTransform: "uppercase", border: "1px solid rgba(255,215,0,0.22)", padding: "4px 10px", borderRadius: 100 }}>
            ⏱ 5 min · ₦1,000 · Print-ready
          </span>
          <span style={{ height: 1, width: "clamp(40px,10vw,80px)", background: "linear-gradient(to left, transparent, rgba(255,215,0,0.5))" }} />
        </div>

        {/* CTAs */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, maxWidth: 420, margin: "0 auto" }}>
          <button
            type="button"
            onClick={handleClose}
            className="nv-laser-btn"
            style={{
              height: 60, width: "100%",
              padding: "0 36px",
              borderRadius: 10, fontSize: 13, letterSpacing: "0.1em",
              ...mono, cursor: "pointer", border: "none",
              display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 12,
            }}
          >
            Take your seat - enter the studio
          </button>
        </div>
      </div>

      {/* Bottom-left ticket stub corner */}
      <div
        aria-hidden
        style={{
          position: "absolute", bottom: "clamp(20px,3vw,40px)", left: "clamp(20px,3vw,40px)",
          ...mono, fontSize: 9, letterSpacing: "0.22em",
          color: "rgba(255,215,0,0.32)", textTransform: "uppercase",
          zIndex: 6,
          display: "flex", alignItems: "center", gap: 8,
        }}
      >
        <span style={{ color: "#FFD700" }}>●</span>
        Admit One · No · 0001
      </div>
      <div
        aria-hidden
        style={{
          position: "absolute", bottom: "clamp(20px,3vw,40px)", right: "clamp(20px,3vw,40px)",
          ...mono, fontSize: 9, letterSpacing: "0.22em",
          color: "rgba(255,215,0,0.32)", textTransform: "uppercase",
          zIndex: 6,
        }}
      >
        FYB · fybstudio.art
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Shared primitives
   ═══════════════════════════════════════════════════════════ */
function NvEyebrow({ children, color }: { children: ReactNode; color?: string }) {
  const c = color ?? "rgba(255,255,255,0.3)";
  return (
    <div style={{ ...mono, fontSize: 10, letterSpacing: "0.18em", color: c, textTransform: "uppercase", display: "flex", alignItems: "center", gap: 14 }}>
      <span aria-hidden style={{ display: "inline-block", width: 18, height: 1, background: c, flexShrink: 0, opacity: 0.7 }} />
      {children}
    </div>
  );
}
