import Link from "next/link";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { safeReturnPath } from "@/lib/auth/safeRedirect";
import { SignInShowcase } from "./SignInShowcase";
import { CurtainOpen } from "@/components/ui/CurtainOpen";

export const metadata = {
  title: "Sign in - FYB Studio",
};

function getClassYear(): number {
  const now = new Date();
  return now.getMonth() >= 7 ? now.getFullYear() + 1 : now.getFullYear();
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const callbackUrl = safeReturnPath(from, "/dashboard");
  const classYear = getClassYear();

  return (
    <div
      className="relative overflow-hidden"
      style={{
        background: "#050505",
        color: "#fff",
        fontFamily: "var(--font-plus-jakarta, var(--font-geist-sans)), sans-serif",
        minHeight: "100dvh",
      }}
    >
      <CurtainOpen brand="WELCOME BACK" />
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

      {/* ─── MOBILE LAYOUT ───
          - Floating top: home link (no heavy bar)
          - Showcase fills the screen (with integrated brand mark)
          - Bottom: Google CTA with subtle gradient fade
        */}
      <div
        className="relative flex w-full flex-col lg:hidden"
        style={{ height: "100dvh", zIndex: 1 }}
      >
        {/* Floating top — minimal, non-blocking */}
        <header
          className="absolute top-0 right-0 left-0 z-20 flex items-center justify-between px-5"
          style={{
            paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)",
          }}
        >
          <Link href="/" className="flex items-center gap-2">
            <span
              aria-hidden
              style={{
                position: "relative",
                display: "inline-flex",
                width: 28, height: 28,
                borderRadius: 7,
                overflow: "hidden",
                border: "1px solid rgba(255,215,0,0.35)",
                boxShadow: "0 4px 12px rgba(255,180,0,0.22)",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.jpg" alt="FYB" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </span>
            <span
              style={{
                fontFamily: "var(--font-geist-mono), monospace",
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "#fff",
              }}
            >
              FYB
            </span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5"
            style={{
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 9,
              letterSpacing: "0.18em",
              color: "rgba(255,255,255,0.55)",
              textTransform: "uppercase",
              background: "rgba(0,0,0,0.45)",
              border: "1px solid rgba(255,255,255,0.08)",
              backdropFilter: "blur(8px)",
            }}
          >
            <span aria-hidden>←</span> Home
          </Link>
        </header>

        {/* Showcase: fills all remaining vertical space */}
        <div
          className="relative flex min-h-0 flex-1 overflow-hidden"
          style={{
            background:
              "radial-gradient(ellipse 75% 60% at 30% 30%, rgba(255,180,0,0.08), transparent 65%), radial-gradient(ellipse 70% 60% at 70% 80%, rgba(168,85,247,0.06), transparent 65%)",
          }}
        >
          <SignInShowcase classYear={classYear} />
        </div>

        {/* Bottom CTA: lighter, with a soft gradient fade behind */}
        <div
          className="relative shrink-0 px-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
          style={{
            background: "linear-gradient(180deg, transparent 0%, rgba(5,5,5,0.92) 35%, rgba(5,5,5,0.98) 100%)",
          }}
        >
          {/* Subtle hairline accent (no heavy border) */}
          <div
            aria-hidden
            className="pointer-events-none absolute right-0 left-0 top-0 mx-auto"
            style={{
              height: 1,
              maxWidth: 180,
              background: "linear-gradient(90deg, transparent, rgba(255,215,0,0.4), transparent)",
            }}
          />
          <GoogleSignInButton callbackUrl={callbackUrl} />
          <div className="mt-3 flex items-center justify-center gap-3">
            {[
              "Google OAuth",
              "No password",
              "Cancel any time",
            ].map((label, i) => (
              <span
                key={label}
                className="flex items-center gap-1.5"
                style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 8.5,
                  letterSpacing: "0.16em",
                  color: "rgba(255,255,255,0.4)",
                  textTransform: "uppercase",
                }}
              >
                {i > 0 && <span style={{ opacity: 0.3 }}>·</span>}
                {i === 0 ? <span style={{ color: "#FFD700" }}>●</span> : null}
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ─── DESKTOP LAYOUT (lg+) ───
          Side-by-side: showcase left, full form panel right
        */}
      <div
        className="relative hidden w-full lg:grid lg:grid-cols-[1.05fr_minmax(420px,0.95fr)]"
        style={{ zIndex: 1, minHeight: "100dvh" }}
      >
        {/* LEFT: showcase */}
        <div
          className="relative flex overflow-hidden"
          style={{
            background:
              "radial-gradient(ellipse 75% 60% at 30% 30%, rgba(255,180,0,0.08), transparent 65%), radial-gradient(ellipse 70% 60% at 70% 80%, rgba(168,85,247,0.06), transparent 65%)",
            borderRight: "1px solid rgba(255,215,0,0.12)",
          }}
        >
          <SignInShowcase classYear={classYear} />
        </div>

        {/* RIGHT: form panel */}
        <div
          className="relative flex w-full items-center justify-center px-10 py-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.01), rgba(255,255,255,0.025))",
          }}
        >
          {/* Top brand mark */}
          <div className="absolute left-0 right-0 top-0 flex px-10 pt-8">
            <Link href="/" className="flex items-center gap-2.5">
              <span
                aria-hidden
                style={{
                  position: "relative",
                  display: "inline-flex",
                  width: 34, height: 34,
                  borderRadius: 9,
                  overflow: "hidden",
                  border: "1px solid rgba(255,215,0,0.3)",
                  boxShadow: "0 6px 16px rgba(255,180,0,0.18)",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo.jpg" alt="FYB" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </span>
              <span style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
                <span
                  style={{
                    fontFamily: "var(--font-geist-mono), monospace",
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    color: "#fff",
                  }}
                >
                  FYB Studio
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-geist-mono), monospace",
                    fontSize: 8,
                    letterSpacing: "0.32em",
                    color: "rgba(255,215,0,0.55)",
                    textTransform: "uppercase",
                    marginTop: 2,
                  }}
                >
                  Class of {classYear}
                </span>
              </span>
            </Link>
          </div>

          {/* The form */}
          <div className="w-full" style={{ maxWidth: 420 }}>
            {/* Eyebrow */}
            <div
              style={{
                display: "inline-flex", alignItems: "center", gap: 10,
                marginBottom: 18,
              }}
            >
              <span style={{ position: "relative", width: 7, height: 7, display: "inline-flex" }}>
                <span className="nv-pulse-ring" style={{ position: "absolute", inset: 0, border: "1.5px solid rgba(255,215,0,0.55)", borderRadius: "50%" }} />
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#FFD700" }} />
              </span>
              <span
                style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 10,
                  letterSpacing: "0.26em",
                  color: "rgba(255,215,0,0.85)",
                  textTransform: "uppercase",
                  fontWeight: 700,
                }}
              >
                Welcome · finalist
              </span>
            </div>

            {/* Headline */}
            <h1
              style={{
                fontWeight: 900,
                fontSize: "clamp(40px, 5vw, 56px)",
                lineHeight: 0.95,
                letterSpacing: "-0.035em",
                color: "#fff",
                marginBottom: 12,
              }}
            >
              Sign in to<br />
              <span className="nv-shimmer-text" style={{ display: "inline-block", whiteSpace: "nowrap" }}>
                FYB Studio
              </span>
            </h1>

            {/* Tagline */}
            <p
              style={{
                fontFamily: "var(--font-geist-sans), sans-serif",
                fontSize: 16,
                lineHeight: 1.55,
                color: "rgba(255,255,255,0.55)",
                marginBottom: 28,
                maxWidth: "38ch",
              }}
            >
              One tap with Google. Your designs, your edits, your downloads -{" "}
              <span style={{ color: "#FFD700", fontWeight: 600 }}>all where you left them.</span>
            </p>

            {/* Google sign in button */}
            <GoogleSignInButton callbackUrl={callbackUrl} />

            {/* Divider */}
            <div
              style={{
                marginTop: 22, marginBottom: 16,
                display: "flex", alignItems: "center", gap: 12,
              }}
            >
              <span style={{ flex: 1, height: 1, background: "linear-gradient(to right, transparent, rgba(255,215,0,0.18))" }} />
              <span
                style={{
                  fontFamily: "var(--font-geist-mono), monospace",
                  fontSize: 9,
                  letterSpacing: "0.22em",
                  color: "rgba(255,215,0,0.5)",
                  textTransform: "uppercase",
                  fontWeight: 700,
                }}
              >
                Secure & private
              </span>
              <span style={{ flex: 1, height: 1, background: "linear-gradient(to left, transparent, rgba(255,215,0,0.18))" }} />
            </div>

            {/* Trust row */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {[
                { label: "Google OAuth" },
                { label: "No password" },
                { label: "Cancel any time" },
              ].map((t) => (
                <span
                  key={t.label}
                  style={{
                    fontFamily: "var(--font-geist-mono), monospace",
                    fontSize: 9,
                    letterSpacing: "0.14em",
                    color: "rgba(255,255,255,0.4)",
                    textTransform: "uppercase",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#FFD700" }} />
                  {t.label}
                </span>
              ))}
            </div>

            {/* Terms */}
            <p
              style={{
                fontFamily: "var(--font-geist-sans), sans-serif",
                fontSize: 11,
                color: "rgba(255,255,255,0.32)",
                marginTop: 24,
                lineHeight: 1.6,
              }}
            >
              By continuing you agree to FYB Studio&apos;s terms of use and privacy policy.
              We&apos;ll only ask Google for your name, email, and profile picture.
            </p>
          </div>

          {/* Bottom-right footer mark */}
          <div
            className="absolute bottom-6 right-10"
            style={{
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 9,
              letterSpacing: "0.22em",
              color: "rgba(255,215,0,0.35)",
              textTransform: "uppercase",
            }}
          >
            fybstudio.art
          </div>
        </div>
      </div>
    </div>
  );
}
