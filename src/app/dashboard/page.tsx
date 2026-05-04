import Link from "next/link";
import { auth } from "@/backend/auth/config";
import { getUserProfile } from "@/backend/services/user.service";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { RecentDownloads } from "@/components/dashboard/RecentDownloads";
import { DepartmentLocks } from "@/components/dashboard/DepartmentLocks";

export const metadata = {
  title: "Dashboard — FYB Studio",
};

// Nigerian academic sessions wrap mid-year. From August onward the current
// finalists graduate the next calendar year; before that the current calendar
// year is the graduating class.
function getClassYear(): number {
  const now = new Date();
  return now.getMonth() >= 7 ? now.getFullYear() + 1 : now.getFullYear();
}

export default async function DashboardPage() {
  const session = await auth();
  const profile = session?.user?.id ? await getUserProfile(session.user.id) : null;

  if (!profile) {
    return (
      <div className="min-h-dvh bg-zinc-50 dark:bg-zinc-950">
        <main className="mx-auto w-full max-w-3xl px-4 py-12">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            We couldn&apos;t load your profile. Try signing out and back in.
          </p>
        </main>
      </div>
    );
  }

  const classYear = getClassYear();
  const username =
    profile.username?.trim() ||
    profile.name.split(" ")[0]?.toLowerCase() ||
    "finalist";
  const initial = username.charAt(0).toUpperCase();

  return (
    <div className="min-h-dvh bg-zinc-50 dark:bg-zinc-950">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-5 sm:py-6">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="h-3.5 w-3.5 rounded-full bg-zinc-900 dark:bg-zinc-100" />
          </div>
          <div className="hidden sm:block">
            <div className="text-sm font-semibold tracking-tight text-zinc-950 dark:text-zinc-100">
              FYB Studio
            </div>
            <div className="text-[11px] text-zinc-600 dark:text-zinc-300">Dashboard</div>
          </div>
        </Link>

        <SignOutButton />
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 pb-20">
        <section className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div
            aria-hidden
            className="absolute inset-0 -z-10 bg-linear-to-br from-white via-zinc-50 to-emerald-50/40 dark:from-zinc-950 dark:via-zinc-900 dark:to-emerald-950/15"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-emerald-200/30 blur-3xl dark:bg-emerald-900/10"
          />

          <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-7">
            <div className="flex min-w-0 items-center gap-4">
              {profile.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatar}
                  alt={profile.name}
                  referrerPolicy="no-referrer"
                  className="h-14 w-14 shrink-0 rounded-2xl border border-zinc-200 object-cover shadow-sm sm:h-16 sm:w-16 dark:border-zinc-800"
                />
              ) : (
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-zinc-900 text-xl font-semibold text-white shadow-sm sm:h-16 sm:w-16 sm:text-2xl dark:bg-zinc-100 dark:text-zinc-900">
                  {initial}
                </div>
              )}

              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-300">
                  Welcome back
                </div>
                <h1 className="mt-0.5 truncate text-2xl font-semibold tracking-tight text-zinc-950 sm:text-[28px] dark:text-zinc-100">
                  {username}
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-zinc-600 dark:text-zinc-300">
                  {profile.department ? (
                    <span className="truncate">{profile.department.name}</span>
                  ) : null}
                  {profile.isDepartmentHead ? (
                    <>
                      <span aria-hidden className="text-zinc-300 dark:text-zinc-700">
                        ·
                      </span>
                      <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                        Department Head
                      </span>
                    </>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white/80 px-4 py-3 backdrop-blur sm:justify-start sm:bg-white/60 dark:border-zinc-800 dark:bg-zinc-900/70 dark:sm:bg-zinc-900/60">
              <div className="flex flex-col">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400">
                  Class of
                </span>
                <span
                  className="text-5xl leading-none text-zinc-950 sm:text-6xl dark:text-zinc-100"
                  style={{ fontFamily: "var(--font-ms-madi)" }}
                  aria-label={`Class of ${classYear}`}
                >
                  {classYear}
                </span>
              </div>
              <div className="grid h-11 w-11 place-items-center rounded-xl border border-zinc-200 bg-white text-zinc-900 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
                <CapIcon className="h-5 w-5" />
              </div>
            </div>
          </div>
        </section>

        <div className="mt-3 grid gap-3 sm:mt-4 sm:grid-cols-2">
          <Link
            href="/templates"
            className="group flex items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md sm:p-5 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
          >
            <div className="min-w-0">
              <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">
                Browse templates
              </div>
              <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Tees, face caps, posters, banners.
              </div>
            </div>
            <ArrowIcon />
          </Link>

          <a
            href="#recent-downloads"
            className="group flex items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md sm:p-5 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
          >
            <div className="min-w-0">
              <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">
                Your downloads
              </div>
              <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Saved on this device for 24 hours.
              </div>
            </div>
            <ArrowIcon />
          </a>
        </div>

        {profile.isDepartmentHead && profile.department ? (
          <div className="mt-4 sm:mt-6">
            <DepartmentLocks departmentName={profile.department.name} />
          </div>
        ) : null}

        <div id="recent-downloads" className="mt-4 scroll-mt-24 sm:mt-6">
          <RecentDownloads />
        </div>
      </main>
    </div>
  );
}

function CapIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-3.5 w-3.5"}
      aria-hidden
    >
      <path d="M22 10 12 5 2 10l10 5 10-5Z" />
      <path d="M6 12v5c2 2 10 2 12 0v-5" />
      <path d="M22 10v6" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0 text-zinc-400 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-900 dark:group-hover:text-zinc-100"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}
