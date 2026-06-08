import { NextResponse } from "next/server";

import { requireAdmin } from "@/backend/auth/session";
import { withErrorHandler } from "@/backend/errors/handler";
import { deleteDepartment } from "@/backend/services/department.service";

export const runtime = "nodejs";

export const DELETE = withErrorHandler(async (_req, ctx) => {
  await requireAdmin();
  const { id } = await ctx.params;
  await deleteDepartment(id);
  return NextResponse.json({ ok: true });
});
