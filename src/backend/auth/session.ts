import { auth } from "@/backend/auth/config";
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
