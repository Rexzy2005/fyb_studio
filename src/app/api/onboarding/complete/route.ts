import { NextResponse, after } from "next/server";
import { withErrorHandler } from "@/backend/errors/handler";
import { requirePendingOnboarding } from "@/backend/auth/session";
import { unstable_update } from "@/backend/auth/config";
import { completeOnboardingSchema } from "@/backend/validation/onboarding.schema";
import { completeOnboarding } from "@/backend/services/onboarding.service";
import { sendWelcomeEmail } from "@/backend/email/send-welcome";

export const runtime = "nodejs";

export const POST = withErrorHandler(async (req) => {
  const session = await requirePendingOnboarding();
  const body = await req.json();
  const input = completeOnboardingSchema.parse(body);
  const profile = await completeOnboarding(session.user.id, input);

  // Refresh the JWT cookie immediately so middleware sees the user as
  // onboarded on the very next request. Without this, calling updateSession()
  // from the client alone is unreliable in NextAuth v5.
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

  // Send the welcome email AFTER the response is returned. `after()` keeps the
  // function instance alive past response on Vercel/serverless, while in dev
  // (continuous Node) it just runs in the background. Email failures never
  // block onboarding.
  after(async () => {
    try {
      await sendWelcomeEmail({
        email: profile.email,
        name: profile.name,
        username: profile.username,
      });
    } catch (err) {
      console.error("[onboarding] welcome email failed:", err);
    }
  });

  return NextResponse.json({ user: profile });
});
