import { NextResponse } from "next/server";
import { withErrorHandler } from "@/backend/errors/handler";
import { requirePendingOnboarding } from "@/backend/auth/session";
import { unstable_update } from "@/backend/auth/config";
import { completeOnboardingSchema } from "@/backend/validation/onboarding.schema";
import { completeOnboarding } from "@/backend/services/onboarding.service";

export const POST = withErrorHandler(async (req) => {
  const session = await requirePendingOnboarding();
  const body = await req.json();
  const input = completeOnboardingSchema.parse(body);
  const profile = await completeOnboarding(session.user.id, input);

  // Refresh the JWT cookie immediately so middleware sees the user as
  // onboarded on the very next request. Without this, calling updateSession()
  // from the client alone is unreliable in NextAuth v5 — the user gets
  // bounced back to /onboarding by the middleware on the post-submit
  // navigation. This server-side update writes the new cookie onto THIS
  // response, guaranteeing the next request carries fresh claims.
  try {
    await unstable_update({
      user: {
        ...session.user,
        isOnboarded: true,
        username: profile.username,
        isDepartmentHead: profile.isDepartmentHead,
        departmentId: profile.departmentId,
      },
    });
  } catch (err) {
    console.error("[onboarding] session refresh failed:", err);
  }

  return NextResponse.json({ user: profile });
});
