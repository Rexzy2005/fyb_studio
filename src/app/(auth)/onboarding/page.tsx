import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { OnboardingForm } from "@/components/onboarding/OnboardingForm";
import { safeReturnPath } from "@/lib/auth/safeRedirect";
import { bodyLg, caption, headline } from "@/lib/ui/typography";
import { Card } from "@/components/ui/Card";

export const metadata = {
  title: "Set up your profile - FYB Studio",
};

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  const returnTo = safeReturnPath(from, "/dashboard");
  return (
    <div className="min-h-dvh" style={{ background: "var(--canvas)", color: "var(--ink)" }}>
      {/* Nav */}
      <header
        className="sticky top-0 z-30 h-14 border-b backdrop-blur-md"
        style={{ background: "rgba(9,9,9,0.85)", borderColor: "var(--hairline-soft)" }}
      >
        <div className="mx-auto flex h-full max-w-[1200px] items-center px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: "#FFD700" }}
              aria-hidden
            />
            <span style={{ ...headline, fontSize: 18 }}>FYB Studio</span>
          </Link>
        </div>
      </header>

      {/* Hero area */}
      <div
        className="relative overflow-hidden"
        style={{
          background: "linear-gradient(160deg,rgba(255,215,0,0.05) 0%,transparent 55%)",
          borderBottom: "1px solid var(--hairline-soft)",
        }}
      >
        <div
          className="pointer-events-none absolute -right-10 -top-8 opacity-[0.03]"
          aria-hidden
        >
          <GraduationCap size={200} strokeWidth={0.5} />
        </div>

        <div className="mx-auto flex w-full max-w-[480px] flex-col gap-4 px-5 pb-10 pt-12 sm:pt-16">
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
              Almost there
            </span>
          </div>

          <h1
            className="font-bold"
            style={{ fontSize: 30, lineHeight: 1.1, letterSpacing: "-0.03em", color: "var(--ink)" }}
          >
            Set up your profile
          </h1>
          <p style={{ ...bodyLg, color: "var(--ink-muted)", marginTop: 2 }}>
            Choose a username and select your department — this appears on your dashboard and designs.
          </p>
        </div>
      </div>

      {/* Form area */}
      <main className="mx-auto flex w-full max-w-[480px] flex-col gap-6 px-5 pb-20 pt-8">
        <Card variant="surface-1" padding={24} radius={20}>
          <OnboardingForm returnTo={returnTo} />
        </Card>
      </main>
    </div>
  );
}
