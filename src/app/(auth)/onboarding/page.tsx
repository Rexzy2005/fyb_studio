import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { OnboardingForm } from "@/components/onboarding/OnboardingForm";
import { safeReturnPath } from "@/lib/auth/safeRedirect";
import { CurtainOpen } from "@/components/ui/CurtainOpen";

export const metadata = {
  title: "Set up your profile - FYB Studio",
};

function getClassYear(): number {
  const now = new Date();
  return now.getMonth() >= 7 ? now.getFullYear() + 1 : now.getFullYear();
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const returnTo = safeReturnPath(from, "/dashboard");
  const classYear = getClassYear();

  return (
    <div
      className="relative min-h-dvh overflow-hidden"
      style={{
        background: "#050505",
        color: "#fff",
        fontFamily: "var(--font-plus-jakarta, var(--font-geist-sans)), sans-serif",
      }}
    >
      <CurtainOpen brand="ALMOST IN" />
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

      {/* Sticky brand bar */}
      <header
        className="sticky top-0 z-30 h-14"
        style={{
          background: "rgba(9,9,9,0.92)",
          borderBottom: "1px solid rgba(255,215,0,0.14)",
          backdropFilter: "blur(20px)",
        }}
      >
        <div className="mx-auto flex h-full max-w-[1200px] items-center justify-between gap-3 px-4 sm:px-8">
          <Link href="/" className="flex items-center gap-1.5">
            <span
              aria-hidden
              style={{
                position: "relative",
                display: "inline-flex",
                width: 30, height: 30,
                borderRadius: 7,
                overflow: "hidden",
                boxShadow: "0 4px 12px rgba(255,180,0,0.18)",
                flexShrink: 0,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.jpg" alt="FYB" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </span>
            <span
              style={{
                fontFamily: "var(--font-plus-jakarta, var(--font-geist-sans)), sans-serif",
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: "#fff",
                lineHeight: 1,
              }}
            >
              studio
            </span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5"
            style={{
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 9,
              letterSpacing: "0.18em",
              color: "rgba(255,255,255,0.5)",
              textTransform: "uppercase",
            }}
          >
            <span aria-hidden>←</span> Home
          </Link>
        </div>
      </header>

      {/* Atmospheric layer behind hero — spotlight beams + floating caps */}
      <div
        aria-hidden
        style={{
          position: "absolute", inset: 0, top: 56, height: "70%",
          pointerEvents: "none", overflow: "hidden", zIndex: 0,
        }}
      >
        {/* Spotlight beams */}
        {[
          { l: "8%",  w: "30%", c: "rgba(255,215,0,0.07)", d: 6, dl: 0 },
          { l: "42%", w: "26%", c: "rgba(255,140,66,0.05)", d: 7, dl: 1.6 },
          { l: "70%", w: "28%", c: "rgba(168,85,247,0.05)", d: 8, dl: 3 },
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
        {/* Floating caps */}
        {[
          { l: "6%",  t: "22%", s: 26, op: 0.16, d: 0,   sp: 18 },
          { l: "88%", t: "26%", s: 22, op: 0.14, d: 1.4, sp: 22 },
          { l: "12%", t: "72%", s: 30, op: 0.13, d: 2.8, sp: 24 },
          { l: "84%", t: "78%", s: 24, op: 0.13, d: 0.7, sp: 20 },
        ].map((c, i) => (
          <div
            key={i}
            className="nv-float-slow"
            style={{
              position: "absolute", left: c.l, top: c.t,
              color: "#FFD700", opacity: c.op, animationDelay: `${c.d}s`,
            }}
          >
            <div className="nv-spin-slow" style={{ animationDuration: `${c.sp}s` }}>
              <GraduationCap size={c.s} strokeWidth={1.5} />
            </div>
          </div>
        ))}
      </div>

      {/* Hero + form area */}
      <main
        className="relative mx-auto flex w-full max-w-[520px] flex-col px-5 pb-20 pt-10 sm:pt-16"
        style={{ zIndex: 1 }}
      >
        {/* Eyebrow */}
        <div
          style={{
            display: "inline-flex", alignItems: "center", gap: 10,
            marginBottom: 20, alignSelf: "flex-start",
          }}
        >
          <span style={{ position: "relative", width: 7, height: 7, display: "inline-flex" }}>
            <span
              className="nv-pulse-ring"
              style={{ position: "absolute", inset: 0, border: "1.5px solid rgba(255,215,0,0.55)", borderRadius: "50%" }}
            />
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#FFD700" }} />
          </span>
          <span
            style={{
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 10,
              letterSpacing: "0.28em",
              color: "rgba(255,215,0,0.85)",
              textTransform: "uppercase",
              fontWeight: 700,
            }}
          >
            Step 2 of 2 · Final touch
          </span>
        </div>

        {/* Headline */}
        <h1
          style={{
            fontWeight: 900,
            fontSize: "clamp(36px, 8vw, 56px)",
            lineHeight: 0.95,
            letterSpacing: "-0.035em",
            color: "#fff",
            marginBottom: 12,
          }}
        >
          Set up your<br />
          <span className="nv-shimmer-text" style={{ display: "inline-block", whiteSpace: "nowrap" }}>
            studio profile
          </span>
        </h1>

        {/* Tagline */}
        <p
          style={{
            fontFamily: "var(--font-geist-sans), sans-serif",
            fontSize: "clamp(14px, 1.3vw, 16px)",
            lineHeight: 1.6,
            color: "rgba(255,255,255,0.55)",
            marginBottom: 32,
            maxWidth: "44ch",
          }}
        >
          Pick a username and your department.{" "}
          <span style={{ color: "#FFD700", fontWeight: 600 }}>
            One minute. Then you&apos;re in.
          </span>
        </p>

        {/* Class strip — small ceremonial flourish */}
        <div
          className="mb-6 inline-flex items-center gap-3 self-start"
          style={{
            padding: "8px 14px 8px 12px",
            borderRadius: 100,
            background: "rgba(255,215,0,0.05)",
            border: "1px solid rgba(255,215,0,0.18)",
          }}
        >
          <GraduationCap size={14} style={{ color: "#FFD700" }} strokeWidth={2} />
          <span
            style={{
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 9,
              letterSpacing: "0.24em",
              color: "rgba(255,215,0,0.75)",
              textTransform: "uppercase",
              fontWeight: 700,
            }}
          >
            Class of {classYear}
          </span>
        </div>

        {/* Form card */}
        <div
          style={{
            position: "relative",
            background:
              "linear-gradient(180deg, rgba(20,16,4,0.5), rgba(8,8,8,0.4))",
            border: "1px solid rgba(255,215,0,0.18)",
            borderRadius: 20,
            padding: "clamp(20px, 4vw, 32px)",
            boxShadow:
              "0 30px 80px rgba(0,0,0,0.4), 0 0 80px rgba(255,180,0,0.06), inset 0 1px 0 rgba(255,255,255,0.04)",
            overflow: "hidden",
          }}
        >
          {/* Gold top accent stripe */}
          <div
            aria-hidden
            style={{
              position: "absolute", top: 0, left: 0, right: 0, height: 2,
              background: "linear-gradient(90deg, transparent, #FFD700, transparent)",
            }}
          />
          <OnboardingForm returnTo={returnTo} />
        </div>

        {/* Trust microcopy */}
        <p
          style={{
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: 9,
            letterSpacing: "0.18em",
            color: "rgba(255,255,255,0.35)",
            textTransform: "uppercase",
            textAlign: "center",
            marginTop: 24,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
          }}
        >
          <span style={{ color: "#FFD700" }}>●</span>
          Stays on your device · You can change this later
        </p>
      </main>
    </div>
  );
}
