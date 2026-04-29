import { NextResponse } from "next/server";
import { requireAdmin } from "@/backend/auth/session";
import { withErrorHandler } from "@/backend/errors/handler";
import { listAllUsers } from "@/backend/services/user.service";

export const GET = withErrorHandler(async () => {
  await requireAdmin();
  const users = await listAllUsers();
  return NextResponse.json({ users });
});
