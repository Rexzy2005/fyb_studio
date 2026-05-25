import { NextResponse } from "next/server";
import { requireAdmin } from "@/backend/auth/session";
import { withErrorHandler } from "@/backend/errors/handler";
import { listAllUsers, setDepartmentHeadStatus } from "@/backend/services/user.service";
import { AppError } from "@/backend/errors/app-error";

export const GET = withErrorHandler(async () => {
  await requireAdmin();
  const users = await listAllUsers();
  return NextResponse.json({ users });
});

export const PATCH = withErrorHandler(async (req) => {
  await requireAdmin();
  const body = (await req.json().catch(() => null)) as
    | { userId?: string; makeHead?: boolean }
    | null;

  if (!body?.userId || typeof body.makeHead !== "boolean") {
    throw new AppError("VALIDATION_ERROR", "Missing userId or makeHead", 422);
  }

  await setDepartmentHeadStatus(body.userId, body.makeHead);
  return NextResponse.json({ ok: true });
});
