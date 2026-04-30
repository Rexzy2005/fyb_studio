import { NextResponse } from "next/server";

import { requireSession } from "@/backend/auth/session";
import { withErrorHandler } from "@/backend/errors/handler";
import { AppError } from "@/backend/errors/app-error";
import { listLocksByDepartment } from "@/backend/services/templateLock.service";

export const runtime = "nodejs";

export const GET = withErrorHandler(async () => {
  const session = await requireSession();
  if (!session.user.isDepartmentHead || !session.user.departmentId) {
    throw new AppError(
      "FORBIDDEN",
      "Only a department head can view department locks",
      403
    );
  }

  const locks = await listLocksByDepartment({
    departmentId: session.user.departmentId,
    viewerUserId: session.user.id,
  });

  return NextResponse.json({ locks });
});
