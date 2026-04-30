import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { getSession } from "@/backend/auth/session";
import { withErrorHandler } from "@/backend/errors/handler";
import { AppError } from "@/backend/errors/app-error";
import { getTemplateById } from "@/backend/services/template.service";
import {
  getLockByTemplateId,
  getLockViewForTemplate,
} from "@/backend/services/templateLock.service";
import { lockCookieName, verifyLockToken } from "@/backend/auth/lockCookie";
import { env } from "@/backend/env";

export const runtime = "nodejs";

export const GET = withErrorHandler(async (_req, ctx) => {
  const { id } = await ctx.params;
  const template = await getTemplateById(id);
  if (!template) {
    throw new AppError("NOT_FOUND", "Template not found", 404);
  }

  const lock = await getLockByTemplateId(id);
  if (lock) {
    const session = await getSession();
    const viewerUserId = session?.user?.id ?? null;
    const viewerDepartmentId = session?.user?.departmentId ?? null;

    const isOwner = viewerUserId
      ? lock.lockedByUserId.toString() === viewerUserId
      : false;
    const fromSameDept =
      Boolean(viewerDepartmentId) &&
      lock.departmentId.toString() === viewerDepartmentId;

    let cookieValid = false;
    if (!isOwner && fromSameDept) {
      const cookieJar = await cookies();
      const token = cookieJar.get(lockCookieName(id))?.value;
      const verified = verifyLockToken(token, id, env.AUTH_SECRET ?? "");
      cookieValid =
        verified.ok && verified.departmentId === lock.departmentId.toString();
    }

    if (!isOwner && !(fromSameDept && cookieValid)) {
      const lockView = await getLockViewForTemplate({
        templateId: id,
        viewerUserId: viewerUserId ?? "",
        viewerDepartmentId,
        isLockOwner: false,
      });
      return NextResponse.json(
        {
          template: null,
          lock: {
            templateId: id,
            departmentId: lock.departmentId.toString(),
            departmentName: lockView?.departmentName ?? "another department",
            departmentAbbreviation: lockView?.departmentAbbreviation ?? "",
            isOwnerLock: false,
            fromSameDept,
            requiresPasscode: fromSameDept,
          },
        },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }
  }

  return NextResponse.json(
    { template },
    { headers: { "Cache-Control": "no-store" } }
  );
});
