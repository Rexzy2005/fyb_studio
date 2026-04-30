import { NextResponse } from "next/server";
import { z } from "zod";

import { requireSession } from "@/backend/auth/session";
import { withErrorHandler } from "@/backend/errors/handler";
import { AppError } from "@/backend/errors/app-error";
import { verifyPasscode } from "@/backend/services/templateLock.service";
import { issueLockToken, lockCookieName } from "@/backend/auth/lockCookie";
import { env } from "@/backend/env";

export const runtime = "nodejs";

const bodySchema = z.object({
  passcode: z.string().min(4).max(32),
});

export const POST = withErrorHandler(async (req, ctx) => {
  const session = await requireSession();
  const { id } = await ctx.params;

  const json = await req.json().catch(() => ({}));
  const { passcode } = bodySchema.parse(json);

  const result = await verifyPasscode({
    templateId: id,
    passcode,
    viewerDepartmentId: session.user.departmentId ?? null,
  });

  if (!result.ok) {
    if (result.reason === "no-lock") {
      throw new AppError("NOT_FOUND", "This design is not locked", 404);
    }
    if (result.reason === "wrong-department") {
      throw new AppError(
        "WRONG_DEPARTMENT",
        "This design is locked for another department",
        403
      );
    }
    throw new AppError("INVALID_PASSCODE", "Incorrect passcode", 401);
  }

  if (!env.AUTH_SECRET) {
    throw new AppError("INTERNAL_ERROR", "AUTH_SECRET is not configured", 500);
  }

  const issued = issueLockToken(id, result.departmentId, env.AUTH_SECRET);

  const res = NextResponse.json({
    ok: true,
    expiresAt: issued.expiresAt,
  });

  res.cookies.set({
    name: lockCookieName(id),
    value: issued.token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: issued.maxAge,
  });

  return res;
});
