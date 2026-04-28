import { NextResponse } from "next/server";
import { withErrorHandler } from "@/backend/errors/handler";
import { requirePendingOnboarding } from "@/backend/auth/session";
import { isUsernameAvailable } from "@/backend/services/user.service";
import { checkUsernameSchema } from "@/backend/validation/onboarding.schema";

export const GET = withErrorHandler(async (req) => {
  await requirePendingOnboarding();

  const url = new URL(req.url);
  const parsed = checkUsernameSchema.safeParse({
    username: url.searchParams.get("username") ?? "",
  });

  if (!parsed.success) {
    return NextResponse.json({
      available: false,
      reason: parsed.error.flatten().fieldErrors.username?.[0] ?? "Invalid username",
    });
  }

  const available = await isUsernameAvailable(parsed.data.username);
  return NextResponse.json({ available });
});
