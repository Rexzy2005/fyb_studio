import { NextResponse } from "next/server";

import { requireAdmin } from "@/backend/auth/session";
import { withErrorHandler } from "@/backend/errors/handler";
import {
  createDepartment,
  listDepartments,
} from "@/backend/services/department.service";
import { createDepartmentSchema } from "@/backend/validation/department.schema";

export const runtime = "nodejs";

export const GET = withErrorHandler(async () => {
  await requireAdmin();
  const departments = await listDepartments();
  return NextResponse.json({ departments });
});

export const POST = withErrorHandler(async (req) => {
  await requireAdmin();
  const body = await req.json().catch(() => null);
  const input = createDepartmentSchema.parse(body);
  const department = await createDepartment(input);
  return NextResponse.json({ department }, { status: 201 });
});
