import { NextResponse } from "next/server";

import { requireAdmin } from "@/backend/auth/session";
import { AppError } from "@/backend/errors/app-error";
import { withErrorHandler } from "@/backend/errors/handler";
import {
  deleteTemplateLockForAdmin,
  updateTemplateLockForAdmin,
} from "@/backend/services/templateLock.service";

export const runtime = "nodejs";

export const PATCH = withErrorHandler(async (req, ctx) => {
  await requireAdmin();
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as
    | { departmentId?: unknown; lockedByUserId?: unknown }
    | null;

  if (
    !body ||
    typeof body.departmentId !== "string" ||
    typeof body.lockedByUserId !== "string"
  ) {
    throw new AppError(
      "VALIDATION_ERROR",
      "departmentId and lockedByUserId are required",
      422
    );
  }

  const lock = await updateTemplateLockForAdmin({
    lockId: id,
    departmentId: body.departmentId,
    lockedByUserId: body.lockedByUserId,
  });

  return NextResponse.json({ lock });
});

export const DELETE = withErrorHandler(async (_req, ctx) => {
  await requireAdmin();
  const { id } = await ctx.params;
  await deleteTemplateLockForAdmin(id);
  return NextResponse.json({ ok: true });
});
