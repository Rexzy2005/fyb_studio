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
    <div className="flex h-screen items-center justify-center bg-canvas p-6 dark:bg-canvas">
      <div className="max-w-md rounded-2xl border border-hairline bg-surface-1 p-8 text-center dark:border-hairline dark:bg-surface-1">
        <div className="text-xs font-medium uppercase tracking-wider text-danger dark:text-red-400">
          403 - Forbidden
        </div>
        <h1 className="mt-2 text-lg font-semibold text-ink dark:text-ink">
          Admin access required
        </h1>
        <p className="mt-2 text-sm text-ink-muted dark:text-ink-muted">
          {email ? (
            <>
              The account <span className="font-medium text-ink dark:text-ink">{email}</span> is not on the admin allowlist.
            </>
          ) : (
            <>Your account is not on the admin allowlist.</>
          )}
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex items-center rounded-xl bg-surface-1 px-4 py-2 text-sm font-medium text-white hover:bg-surface-2 dark:bg-surface-2 dark:text-ink dark:hover:bg-surface-1"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
