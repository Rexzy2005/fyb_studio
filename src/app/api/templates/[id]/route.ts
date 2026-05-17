import { NextResponse } from "next/server";

import { getSession } from "@/backend/auth/session";
import { withErrorHandler } from "@/backend/errors/handler";
import { AppError } from "@/backend/errors/app-error";
import { getTemplateById } from "@/backend/services/template.service";
import {
  getLockByTemplateId,
  getLockViewForTemplate,
} from "@/backend/services/templateLock.service";

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

    if (!isOwner && !fromSameDept) {
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
            requiresPasscode: false,
          },
        },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }
  }

  return NextResponse.json(
    { template },
    {
      headers: {
        // Unlocked templates are public data - allow a short shared-cache window
        // (30 s) with stale-while-revalidate so subsequent requests serve from
        // CDN/router cache while a background refresh fires. The lock check path
        // above always returns no-store, so authenticated payloads are never cached.
        "Cache-Control": "public, max-age=30, stale-while-revalidate=60",
      },
    }
  );
});
