import Link from "next/link";
import { BookmarkCheck, GraduationCap, ImageIcon, ArrowUpRight } from "lucide-react";

import { auth } from "@/backend/auth/config";
import { getUserProfile } from "@/backend/services/user.service";
import { RecentDownloads } from "@/components/dashboard/RecentDownloads";
import { DepartmentLocks } from "@/components/dashboard/DepartmentLocks";
import { PendingDownloads } from "@/components/dashboard/PendingDownloads";
import { SignOutButton } from "@/components/dashboard/SignOutButton";
import { FeedbackLauncher } from "@/components/feedback/FeedbackLauncher";
import { TopNav } from "@/components/ui/TopNav";
import { CurtainOpen } from "@/components/ui/CurtainOpen";

export const metadata = {
  title: "Dashboard · FYB Studio",
};

export const dynamic = "force-dynamic";

const FONT_JKT = "var(--font-plus-jakarta, var(--font-geist-sans)), sans-serif";
const FONT_MONO = "var(--font-geist-mono), monospace";
const FONT_SANS = "var(--font-geist-sans), sans-serif";

function getClassYear(): number {
  const now = new Date();
  return now.getMonth() >= 7 ? now.getFullYear() + 1 : now.getFullYear();
}

export default async function DashboardPage() {
  const session = await auth();
  const profile = session?.user?.id
    ? await getUserProfile(session.user.id)
    : null;

  if (!profile) {
    return (
      <div className="min-h-dvh" style={{ background: "#050505", color: "#fff", fontFamily: FONT_JKT }}>
        <TopNav
          showAuth={false}
          cta={undefined}
          links={[]}
          rightSlot={<BrowseTemplatesPill />}
        />
        <main className="mx-auto w-full max-w-3xl px-5 py-16">
          <p style={{ fontFamily: FONT_SANS, fontSize: 14, color: "rgba(255,255,255,0.55)" }}>
            We couldn&apos;t load your profile. Try signing out and back in.
          </p>
        </main>
      </div>
    );
  }

  const classYear = getClassYear();
  const firstName = profile.name.split(" ")[0] || profile.username?.trim() || "Finalist";
  const initial = firstName.charAt(0).toUpperCase();

  return (
    <div
      className="relative min-h-dvh overflow-x-clip"
      style={{ background: "#050505", color: "#fff", fontFamily: FONT_JKT }}
    >
      <CurtainOpen brand="YOUR DASHBOARD" />
      {/* Subtle fractal noise - matches landing page atmosphere */}
      <div
        aria-hidden
        style={{
          position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          backgroundRepeat: "repeat", backgroundSize: "200px 200px",
          opacity: 0.025, mixBlendMode: "overlay",
        }}
      />

      <TopNav
        showAuth={false}
        cta={undefined}
        links={[]}
        rightSlot={<BrowseTemplatesPill />}
      />

      {/* ═══════════════ HERO ═══════════════ */}
      <section
        className="relative"
        style={{
          background:
            "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(255,180,0,0.08), transparent 65%), radial-gradient(ellipse 50% 40% at 80% 30%, rgba(168,85,247,0.05), transparent 60%)",
          borderBottom: "1px solid rgba(255,215,0,0.10)",
          overflow: "hidden",
        }}
      >
        {/* Top accent stripe */}
        <div
          aria-hidden
          style={{
            position: "absolute", top: 0, left: 0, right: 0, height: 1,
            background: "linear-gradient(90deg, transparent, rgba(255,215,0,0.5), transparent)",
          }}
        />
        {/* Floating cap watermark */}
        <div
          aria-hidden
          className="pointer-events-none absolute"
          style={{ right: -40, top: -20, color: "#FFD700", opacity: 0.04 }}
        >
          <GraduationCap size={320} strokeWidth={0.5} />
        </div>

        <div className="relative mx-auto w-full px-5 pb-12 pt-12 sm:px-8 sm:pb-16 sm:pt-16" style={{ maxWidth: 1200 }}>
          {/* Eyebrow */}
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
            <span style={{ position: "relative", width: 7, height: 7, display: "inline-flex" }}>
              <span
                className="nv-pulse-ring"
                style={{ position: "absolute", inset: 0, border: "1.5px solid rgba(255,215,0,0.5)", borderRadius: "50%" }}
              />
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#FFD700" }} />
            </span>
            <span
              style={{
                fontFamily: FONT_MONO, fontSize: 10, letterSpacing: "0.28em",
                color: "rgba(255,215,0,0.8)", textTransform: "uppercase", fontWeight: 700,
              }}
            >
              Class of {classYear} · Your studio
            </span>
          </div>

          {/* Greeting + identity */}
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-5">
              {profile.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatar}
                  alt={profile.name}
                  referrerPolicy="no-referrer"
                  className="h-16 w-16 shrink-0 overflow-hidden rounded-full object-cover sm:h-20 sm:w-20"
                  style={{
                    border: "2px solid rgba(255,215,0,0.35)",
                    boxShadow: "0 8px 28px rgba(255,180,0,0.25)",
                  }}
                />
              ) : (
                <div
                  className="grid h-16 w-16 shrink-0 place-items-center rounded-full sm:h-20 sm:w-20"
                  style={{
                    background: "rgba(255,215,0,0.08)",
                    border: "2px solid rgba(255,215,0,0.3)",
                    color: "#FFD700",
                    fontFamily: FONT_JKT,
                    fontWeight: 800, fontSize: 28,
                    boxShadow: "0 8px 28px rgba(255,180,0,0.2)",
                  }}
                >
                  {initial}
                </div>
              )}
              <div className="min-w-0">
                <h1
                  className="truncate"
                  style={{
                    fontFamily: FONT_JKT,
                    fontSize: "clamp(32px, 5vw, 48px)",
                    fontWeight: 900,
                    letterSpacing: "-0.035em",
                    lineHeight: 1.05,
                    color: "#fff",
                  }}
                >
                  Welcome, <span className="nv-shimmer-text" style={{ display: "inline-block" }}>{firstName}</span>
                </h1>
                <div
                  className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5"
                  style={{ fontFamily: FONT_SANS, fontSize: 13.5, color: "rgba(255,255,255,0.55)" }}
                >
                  {profile.department ? (
                    <span style={{ color: "rgba(255,255,255,0.85)", fontWeight: 500 }}>
                      {profile.department.name}
                    </span>
                  ) : (
                    <span>No department set</span>
                  )}
                  <DotSep />
                  <span>{profile.username ? `@${profile.username}` : "Graduate"}</span>
                  {profile.isDepartmentHead ? (
                    <>
                      <DotSep />
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1"
                        style={{
                          background: "linear-gradient(140deg, rgba(255,215,0,0.18), rgba(255,140,66,0.08))",
                          color: "#FFD700",
                          border: "1px solid rgba(255,215,0,0.35)",
                          fontFamily: FONT_MONO,
                          fontSize: 9,
                          letterSpacing: "0.18em",
                          textTransform: "uppercase",
                          fontWeight: 700,
                        }}
                      >
                        <BookmarkCheck size={11} />
                        Dept. Head
                      </span>
                    </>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Sign-out - sits opposite the identity block on desktop,
                stacks below on mobile. */}
            <div className="flex shrink-0 items-center">
              <SignOutButton />
            </div>
          </div>

          {/* Quick stat tiles - Templates / "Open studio" intentionally
              omitted since the Browse-templates pill in the navbar already
              covers that path. */}
          <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
            <StatTile
              icon={<ImageIcon size={16} />}
              label="Downloads"
              value="Library"
              caption="Your exports"
              href="#recent-downloads"
              accent="#4ECDC4"
            />
            {profile.isDepartmentHead ? (
              <StatTile
                icon={<BookmarkCheck size={16} />}
                label="Reserved"
                value="Manage"
                caption="Dept. picks"
                href="#locked"
                accent="#FF8C42"
                highlight
              />
            ) : (
              <StatTile
                icon={<GraduationCap size={16} />}
                label="Class"
                value={String(classYear)}
                caption="Your year"
                href="#"
                accent="#A855F7"
              />
            )}
          </div>
        </div>
      </section>

      {/* ═══════════════ CONTENT ═══════════════ */}
      <main
        className="relative mx-auto flex w-full flex-col gap-16 px-5 py-16 sm:gap-20 sm:px-8 sm:py-20"
        style={{ maxWidth: 1200, zIndex: 1 }}
      >
        <DashboardBlock
          eyebrow="In progress"
          title="Pending downloads"
          subtitle="Anything not finished yet shows up here so you can pick it up where you left off."
        >
          <PendingDownloads />
        </DashboardBlock>

        <DashboardBlock
          id="recent-downloads"
          eyebrow="Your library"
          title="Recent downloads"
          subtitle="Every poster you've exported, ready to re-download or share."
        >
          <RecentDownloads />
        </DashboardBlock>

        {profile.isDepartmentHead && profile.department ? (
          <DashboardBlock
            id="locked"
            eyebrow="Department head"
            title="Reserved for your department"
            subtitle={`Designs you've reserved for ${profile.department.name}. Members in your department see these first.`}
          >
            <DepartmentLocks departmentName={profile.department.name} />
          </DashboardBlock>
        ) : null}
      </main>

      {/* ═══════════════ FOOTER ═══════════════ */}
      <footer
        className="relative"
        style={{ borderTop: "1px solid rgba(255,215,0,0.10)", zIndex: 1 }}
      >
        <div
          className="mx-auto flex w-full flex-wrap items-center justify-between gap-4 px-5 py-10 sm:px-8"
          style={{ maxWidth: 1200 }}
        >
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              style={{ display: "inline-block", height: 8, width: 8, borderRadius: "50%", background: "#FFD700", boxShadow: "0 0 14px rgba(255,215,0,0.6)" }}
            />
            <span
              style={{
                fontFamily: FONT_MONO, fontSize: 10, letterSpacing: "0.24em",
                color: "rgba(255,255,255,0.55)", textTransform: "uppercase", fontWeight: 700,
              }}
            >
              FYB Studio
            </span>
            <span
              style={{
                fontFamily: FONT_MONO, fontSize: 9, letterSpacing: "0.2em",
                color: "rgba(255,255,255,0.3)", textTransform: "uppercase",
              }}
            >
              · {firstName} · {classYear}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <FooterLink href="/templates">Templates</FooterLink>
            <FooterLink href="#recent-downloads">Library</FooterLink>
            {profile.isDepartmentHead ? (
              <FooterLink href="#locked">Reserved</FooterLink>
            ) : null}
          </div>
        </div>
      </footer>

      <FeedbackLauncher />
    </div>
  );
}

/* ─── Building blocks ─────────────────────────────────────── */

function BrowseTemplatesPill() {
  return (
    <Link
      href="/templates"
      className="inline-flex items-center justify-center rounded-full transition active:scale-95"
      style={{
        fontFamily: FONT_MONO,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        height: 36, padding: "0 18px",
        background: "#FFD700",
        color: "#000",
        boxShadow: "0 6px 18px rgba(255,180,0,0.25)",
      }}
    >
      Browse templates
    </Link>
  );
}

function DotSep() {
  return (
    <span
      aria-hidden
      style={{ display: "inline-block", height: 3, width: 3, borderRadius: "50%", background: "rgba(255,255,255,0.3)" }}
    />
  );
}

function DashboardBlock({
  id, eyebrow, title, subtitle, children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <header style={{ marginBottom: 28 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <span
            aria-hidden
            style={{ display: "inline-block", width: 18, height: 1, background: "rgba(255,215,0,0.55)" }}
          />
          <span
            style={{
              fontFamily: FONT_MONO, fontSize: 10, letterSpacing: "0.28em",
              color: "rgba(255,215,0,0.75)", textTransform: "uppercase", fontWeight: 700,
            }}
          >
            {eyebrow}
          </span>
        </div>
        <h2
          style={{
            fontFamily: FONT_JKT,
            fontSize: "clamp(22px, 2.4vw, 30px)",
            fontWeight: 800,
            letterSpacing: "-0.025em",
            lineHeight: 1.15,
            color: "#fff",
            margin: 0,
          }}
        >
          {title}
        </h2>
        {subtitle ? (
          <p
            style={{
              fontFamily: FONT_SANS, fontSize: 14, lineHeight: 1.55,
              color: "rgba(255,255,255,0.5)",
              marginTop: 8, maxWidth: "62ch",
            }}
          >
            {subtitle}
          </p>
        ) : null}
      </header>
      {children}
    </section>
  );
}

function StatTile({
  icon, label, value, caption, href, accent, highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  caption?: string;
  href: string;
  accent: string;
  highlight?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group relative flex flex-col gap-3 overflow-hidden rounded-2xl p-5 transition hover:-translate-y-0.5"
      style={{
        background: highlight
          ? "linear-gradient(140deg, rgba(255,215,0,0.12), rgba(8,8,8,0.6))"
          : "linear-gradient(180deg, rgba(20,16,4,0.42), rgba(8,8,8,0.45))",
        border: `1px solid ${highlight ? `${accent}55` : `${accent}28`}`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04), 0 10px 30px rgba(0,0,0,0.35)`,
      }}
    >
      {/* Accent stripe */}
      <span
        aria-hidden
        style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
        }}
      />
      <span
        className="flex h-9 w-9 items-center justify-center rounded-xl"
        style={{
          background: `${accent}18`,
          color: accent,
          border: `1px solid ${accent}35`,
        }}
      >
        {icon}
      </span>
      <div>
        <div
          style={{
            fontFamily: FONT_JKT,
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: "-0.025em",
            color: highlight ? accent : "#fff",
            lineHeight: 1,
          }}
        >
          {value}
        </div>
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 9,
            letterSpacing: "0.22em",
            color: "rgba(255,255,255,0.4)",
            textTransform: "uppercase",
            marginTop: 6,
            fontWeight: 700,
          }}
        >
          {label}
        </div>
        {caption ? (
          <div
            style={{
              fontFamily: FONT_SANS, fontSize: 11,
              color: "rgba(255,255,255,0.35)",
              marginTop: 4,
            }}
          >
            {caption}
          </div>
        ) : null}
      </div>
      <ArrowUpRight
        size={14}
        className="absolute right-4 top-4 opacity-30 transition group-hover:opacity-80 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
        style={{ color: accent }}
      />
    </Link>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      style={{
        fontFamily: FONT_MONO, fontSize: 11, letterSpacing: "0.18em",
        color: "rgba(255,255,255,0.5)", textTransform: "uppercase", fontWeight: 600,
      }}
      className="transition-colors hover:text-white"
    >
      {children}
    </Link>
  );
}
