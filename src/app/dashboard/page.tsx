import Link from "next/link";
import { auth } from "@/backend/auth/config";
import { getUserProfile } from "@/backend/services/user.service";
import { SignOutButton } from "@/components/auth/SignOutButton";

export const metadata = {
  title: "Dashboard — FYB Studio",
};

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

  return (
    <div className="min-h-dvh bg-zinc-50 dark:bg-zinc-950">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-24 left-1/2 h-130 w-130 -translate-x-1/2 rounded-full bg-zinc-200/40 blur-3xl dark:bg-zinc-800/50" />
      </div>

      <header className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-6">
        <Link href="/" className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="h-4 w-4 rounded-full bg-zinc-900 dark:bg-zinc-100" />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight text-zinc-950 dark:text-zinc-100">
              FYB Studio
            </div>
            <div className="text-[11px] text-zinc-600 dark:text-zinc-300">Dashboard</div>
          </div>
        </Link>
        <SignOutButton />
      </header>

      <main className="mx-auto w-full max-w-5xl px-4 pb-20">
        <section className="rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-medium text-zinc-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Signed in
              </div>
              <h1 className="mt-3 text-balance text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-100">
                Welcome, {profile.name.split(" ")[0]}.
              </h1>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                @{profile.username}
                {profile.department ? (
                  <>
                    <span className="mx-2 text-zinc-300 dark:text-zinc-700">•</span>
                    {profile.department.name}
                  </>
                ) : null}
                {profile.isDepartmentHead ? (
                  <span className="ml-2 inline-flex items-center rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                    HEAD
                  </span>
                ) : null}
              </p>
            </div>
            {profile.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar}
                alt={profile.name}
                referrerPolicy="no-referrer"
                className="h-14 w-14 rounded-2xl border border-zinc-200 object-cover shadow-sm dark:border-zinc-800"
              />
            ) : null}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Link
              href="/templates"
              className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            >
              <div className="text-xs font-semibold tracking-wide text-zinc-900 dark:text-zinc-100">
                Browse templates
              </div>
              <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                Pick a sign-out tee, face cap, or banner.
              </div>
            </Link>
            <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-4 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-400">
              <div className="text-xs font-semibold tracking-wide">Your designs</div>
              <div className="mt-1 text-[11px]">
                Coming soon — this is where your saved designs will live.
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
