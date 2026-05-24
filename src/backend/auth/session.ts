import { auth } from "@/backend/auth/config";
import { env } from "@/backend/env";
import { AppError } from "@/backend/errors/app-error";

export async function getSession() {
  return auth();
}

export async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new AppError("UNAUTHENTICATED", "You must be signed in", 401);
  }
  return session;
}

export async function requirePendingOnboarding() {
  const session = await requireSession();
  if (session.user.isOnboarded) {
    throw new AppError(
      "ALREADY_ONBOARDED",
      "User has already completed onboarding",
      409
    );
  }
  return session;
}

function getAdminEmails(): Set<string> {
  const raw = env.ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isAdminEmail(email: string | null | undefined): boolean {
  const normalized = email?.toLowerCase();
  if (!normalized) return false;
  const allowed = getAdminEmails();
  if (allowed.size === 0) return false;
  return allowed.has(normalized);
}

export async function requireAdmin() {
  const session = await requireSession();
  const email = session.user.email;
  if (!isAdminEmail(email)) {
    throw new AppError("FORBIDDEN", "Admin access required", 403);
  }
  return session;
}
