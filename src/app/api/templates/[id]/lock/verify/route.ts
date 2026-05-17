import { NextResponse } from "next/server";

import { requireSession } from "@/backend/auth/session";
import { withErrorHandler } from "@/backend/errors/handler";
import { AppError } from "@/backend/errors/app-error";
import { verifyPasscode } from "@/backend/services/templateLock.service";

export const runtime = "nodejs";

export const POST = withErrorHandler(async (req, ctx) => {
  const session = await requireSession();
  const { id } = await ctx.params;

  // Accept any POST body - passcode is no longer required
  await req.json().catch(() => ({}));

  const result = await verifyPasscode({
    templateId: id,
    passcode: "",
    viewerDepartmentId: session.user.departmentId ?? null,
  });

  if (!result.ok) {
    if (result.reason === "no-lock") {
      throw new AppError("NOT_FOUND", "This design is not reserved", 404);
    }
    if (result.reason === "wrong-department") {
      throw new AppError(
        "WRONG_DEPARTMENT",
        "This design is reserved for another department",
        403
      );
    }
  }

  return NextResponse.json({
    ok: true,
    expiresAt: Date.now() + 3600000,
  });
});
