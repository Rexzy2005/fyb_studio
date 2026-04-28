import { NextResponse } from "next/server";
import { withErrorHandler } from "@/backend/errors/handler";
import { requirePendingOnboarding } from "@/backend/auth/session";
import { completeOnboardingSchema } from "@/backend/validation/onboarding.schema";
import { completeOnboarding } from "@/backend/services/onboarding.service";

export const POST = withErrorHandler(async (req) => {
  const session = await requirePendingOnboarding();
  const body = await req.json();
  const input = completeOnboardingSchema.parse(body);
  const profile = await completeOnboarding(session.user.id, input);
  return NextResponse.json({ user: profile });
});
