import { NextResponse } from "next/server";
import { withErrorHandler } from "@/backend/errors/handler";
import { listDepartments } from "@/backend/services/department.service";

export const GET = withErrorHandler(async () => {
  const departments = await listDepartments();
  return NextResponse.json({ departments });
});
