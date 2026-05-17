import { NextResponse } from "next/server";

import { requireSession } from "@/backend/auth/session";
import { withErrorHandler } from "@/backend/errors/handler";
import { AppError } from "@/backend/errors/app-error";
import {
  deleteLock,
  getLockViewForTemplate,
  lockTemplateForDepartment,
} from "@/backend/services/templateLock.service";

export const runtime = "nodejs";

export const GET = withErrorHandler(async (_req, ctx) => {
  const session = await requireSession();
  const { id } = await ctx.params;

  const lock = await getLockViewForTemplate({
    templateId: id,
    viewerUserId: session.user.id,
    viewerDepartmentId: session.user.departmentId ?? null,
    isLockOwner: false,
  });

  if (!lock) return NextResponse.json({ lock: null });

  const isOwner = lock.lockedByUserId === session.user.id;
  const fromSameDept =
    Boolean(session.user.departmentId) &&
    session.user.departmentId === lock.departmentId;

  return NextResponse.json({
    lock: {
      ...lock,
      passcode: isOwner ? lock.passcode : null,
    },
    viewer: {
      isOwner,
      fromSameDept,
    },
  });
});

export const POST = withErrorHandler(async (_req, ctx) => {
  const session = await requireSession();
  const { id } = await ctx.params;

  if (!session.user.isDepartmentHead || !session.user.departmentId) {
    throw new AppError(
      "FORBIDDEN",
      "Only a department head can lock a design",
      403
    );
  }

  const lock = await lockTemplateForDepartment({
    templateId: id,
    departmentId: session.user.departmentId,
    userId: session.user.id,
  });

  return NextResponse.json({ lock }, { status: 201 });
});

export const PATCH = withErrorHandler(async (_req, _ctx) => {
  return NextResponse.json(
    { error: "Passcode rotation is not supported" },
    { status: 405 }
  );
});

export const DELETE = withErrorHandler(async (_req, ctx) => {
  const session = await requireSession();
  const { id } = await ctx.params;

  if (!session.user.isDepartmentHead) {
    throw new AppError(
      "FORBIDDEN",
      "Only a department head can free a locked design",
      403
    );
  }

  await deleteLock({ templateId: id, userId: session.user.id });

  return NextResponse.json({ ok: true });
});
