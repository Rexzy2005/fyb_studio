import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/backend/auth/config";
import { env } from "@/backend/env";
import AdminShell from "./AdminShell";

function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowed = (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.toLowerCase());
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/signin?from=/admin");
  }

  if (!isAdminEmail(session.user.email)) {
    return <ForbiddenView email={session.user.email ?? null} />;
  }

  return <AdminShell>{children}</AdminShell>;
}

function ForbiddenView({ email }: { email: string | null }) {
  return (
    <div className="flex h-screen items-center justify-center bg-zinc-50 p-6 dark:bg-zinc-950">
      <div className="max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center dark:border-zinc-800 dark:bg-zinc-900">
        <div className="text-xs font-medium uppercase tracking-wider text-red-600 dark:text-red-400">
          403 — Forbidden
        </div>
        <h1 className="mt-2 text-lg font-semibold text-zinc-950 dark:text-zinc-100">
          Admin access required
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          {email ? (
            <>
              The account <span className="font-medium text-zinc-900 dark:text-zinc-100">{email}</span> is not on the admin allowlist.
            </>
          ) : (
            <>Your account is not on the admin allowlist.</>
          )}
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex items-center rounded-xl bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
