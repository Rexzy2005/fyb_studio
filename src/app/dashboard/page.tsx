import Link from "next/link";
import { BookmarkCheck, GraduationCap, ImageIcon, LayoutTemplate } from "lucide-react";

import { auth } from "@/backend/auth/config";
import { getUserProfile } from "@/backend/services/user.service";
import { RecentDownloads } from "@/components/dashboard/RecentDownloads";
import { DepartmentLocks } from "@/components/dashboard/DepartmentLocks";
import { PendingDownloads } from "@/components/dashboard/PendingDownloads";
import { FeedbackLauncher } from "@/components/feedback/FeedbackLauncher";
import { TopNav } from "@/components/ui/TopNav";
import { ButtonLink } from "@/components/ui/Button";
import { bodySm, caption, micro } from "@/lib/ui/typography";

export const metadata = {
  title: "Dashboard · FYB Studio",
};

export const dynamic = "force-dynamic";

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
      <div className="min-h-dvh" style={{ background: "var(--canvas)", color: "var(--ink)" }}>
        <TopNav showAuth={false} cta={undefined} />
        <main className="mx-auto w-full max-w-3xl px-5 py-12">
          <p style={{ ...bodySm, color: "var(--ink-muted)" }}>
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
    <div className="min-h-dvh" style={{ background: "var(--canvas)", color: "var(--ink)" }}>
      <TopNav cta={{ label: "Browse templates", href: "/templates" }} />

      {/* ─── HERO ──────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden"
        style={{
          background: "linear-gradient(160deg,rgba(255,215,0,0.04) 0%,transparent 60%)",
          borderBottom: "1px solid var(--hairline-soft)",
        }}
      >
        {/* Decorative graduation cap watermark */}
        <div
          className="pointer-events-none absolute -right-8 -top-8 opacity-[0.03]"
          aria-hidden
        >
          <GraduationCap size={260} strokeWidth={0.5} />
        </div>

        <div className="mx-auto w-full max-w-[1200px] px-5 pb-10 pt-10 sm:px-8 sm:pt-14 sm:pb-14">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex min-w-0 flex-col gap-4">
              {/* Eyebrow */}
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: "#FFD700" }}
                  aria-hidden
                />
                <span
                  style={{
                    ...caption,
                    color: "var(--ink-faint)",
                    textTransform: "uppercase",
                    letterSpacing: "0.18em",
                    fontSize: 10,
                  }}
                >
                  Class of {classYear}
                </span>
              </div>

              {/* Name + avatar */}
              <div className="flex items-center gap-4">
                {profile.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.avatar}
                    alt={profile.name}
                    referrerPolicy="no-referrer"
                    className="h-14 w-14 shrink-0 overflow-hidden rounded-full object-cover sm:h-16 sm:w-16"
                    style={{ border: "2px solid rgba(255,215,0,0.3)" }}
                  />
                ) : (
                  <div
                    className="grid h-14 w-14 shrink-0 place-items-center rounded-full text-xl font-bold sm:h-16 sm:w-16"
                    style={{
                      background: "rgba(255,215,0,0.1)",
                      border: "2px solid rgba(255,215,0,0.25)",
                      color: "#FFD700",
                    }}
                  >
                    {initial}
                  </div>
                )}
                <div className="min-w-0">
                  <h1
                    className="truncate text-3xl font-bold sm:text-4xl"
                    style={{ letterSpacing: "-0.03em", color: "var(--ink)" }}
                  >
                    {firstName}
                  </h1>
                  <p
                    className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"
                    style={{ color: "var(--ink-muted)" }}
                  >
                    {profile.department ? (
                      <span style={{ color: "var(--ink)", fontWeight: 500 }}>
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
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
                          style={{
                            background: "rgba(255,215,0,0.1)",
                            color: "#FFD700",
                            border: "1px solid rgba(255,215,0,0.2)",
                          }}
                        >
                          <BookmarkCheck size={11} />
                          Dept. Head
                        </span>
                      </>
                    ) : null}
                  </p>
                </div>
              </div>
            </div>

            {/* CTA pill */}
            <div className="flex shrink-0 gap-2">
              <ButtonLink
                href="/templates"
                variant="primary"
                size="md"
                rightSlot={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                }
              >
                Browse templates
              </ButtonLink>
            </div>
          </div>

          {/* Quick stats bar */}
          <div className="mt-8 grid grid-cols-3 gap-3 sm:gap-4">
            <StatTile
              icon={<LayoutTemplate size={15} />}
              label="Templates"
              value="Browse"
              href="/templates"
            />
            <StatTile
              icon={<ImageIcon size={15} />}
              label="Downloads"
              value="Library"
              href="#recent-downloads"
            />
            {profile.isDepartmentHead ? (
              <StatTile
                icon={<BookmarkCheck size={15} />}
                label="Reserved"
                value="Manage"
                href="#locked"
                accent
              />
            ) : (
              <StatTile
                icon={<GraduationCap size={15} />}
                label="Class"
                value={String(classYear)}
                href="#"
              />
            )}
          </div>
        </div>
      </section>

      {/* ─── CONTENT ────────────────────────────────────────── */}
      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-14 px-5 py-14 sm:gap-20 sm:px-8 sm:py-20">
        <PendingDownloads />

        <div id="recent-downloads" className="scroll-mt-24">
          <RecentDownloads />
        </div>

        {profile.isDepartmentHead && profile.department ? (
          <div id="locked" className="scroll-mt-24">
            <DepartmentLocks departmentName={profile.department.name} />
          </div>
        ) : null}
      </main>

      {/* ─── FOOTER ──────────────────────────────────────────── */}
      <footer
        className="border-t"
        style={{ borderColor: "var(--hairline-soft)" }}
      >
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center justify-between gap-4 px-5 py-8 sm:px-8">
          <div className="flex items-center gap-2.5">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: "#FFD700" }}
              aria-hidden
            />
            <span style={{ ...caption, color: "var(--ink-muted)" }}>FYB Studio</span>
            <span style={{ ...micro, color: "var(--ink-faint)" }}>
              · {firstName} · Class of {classYear}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
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

function DotSep() {
  return (
    <span
      aria-hidden
      className="inline-block h-1 w-1 rounded-full"
      style={{ background: "var(--ink-faint)" }}
    />
  );
}

function StatTile({
  icon,
  label,
  value,
  href,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href: string;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-2 overflow-hidden rounded-2xl p-4 transition sm:p-5"
      style={{
        background: accent ? "rgba(255,215,0,0.06)" : "var(--surface-1)",
        border: `1px solid ${accent ? "rgba(255,215,0,0.2)" : "var(--hairline)"}`,
      }}
    >
      <span
        className="flex h-8 w-8 items-center justify-center rounded-xl"
        style={{
          background: accent ? "rgba(255,215,0,0.12)" : "var(--surface-2)",
          color: accent ? "#FFD700" : "var(--ink-muted)",
        }}
      >
        {icon}
      </span>
      <div>
        <div
          className="text-base font-bold sm:text-lg"
          style={{ color: accent ? "#FFD700" : "var(--ink)", letterSpacing: "-0.02em" }}
        >
          {value}
        </div>
        <div style={{ ...micro, color: "var(--ink-faint)", marginTop: 2 }}>{label}</div>
      </div>
    </Link>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} style={{ ...caption, color: "var(--ink-muted)" }} className="hover:text-ink transition-colors">
      {children}
    </Link>
  );
}
