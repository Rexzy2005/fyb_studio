import Link from "next/link";
import { OnboardingForm } from "@/components/onboarding/OnboardingForm";
import { safeReturnPath } from "@/lib/auth/safeRedirect";

export const metadata = {
  title: "Set up your profile — FYB Studio",
};

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const returnTo = safeReturnPath(from, "/dashboard");
  return (
    <div className="min-h-dvh bg-zinc-50 dark:bg-zinc-950">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-24 left-1/2 h-130 w-130 -translate-x-1/2 rounded-full bg-zinc-200/40 blur-3xl dark:bg-zinc-800/50" />
        <div className="absolute -top-10 -right-35 h-105 w-105 rounded-full bg-emerald-200/25 blur-3xl dark:bg-emerald-900/10" />
      </div>

      <header className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-6">
        <Link href="/" className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="h-4 w-4 rounded-full bg-zinc-900 dark:bg-zinc-100" />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight text-zinc-950 dark:text-zinc-100">
              FYB Studio
            </div>
            <div className="text-[11px] text-zinc-600 dark:text-zinc-300">
              One last step before the studio.
            </div>
          </div>
        </Link>
      </header>

      <main className="mx-auto w-full max-w-md px-4 pb-20 pt-6">
        <div className="rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-medium text-zinc-700 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Set up your profile
          </div>
          <h1 className="mt-3 text-balance text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-100">
            Pick a username and your department.
          </h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
            This shows up on your dashboard and on the designs you publish.
          </p>

          <div className="mt-6">
            <OnboardingForm returnTo={returnTo} />
          </div>
        </div>
      </main>
    </div>
  );
}
