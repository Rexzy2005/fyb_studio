import { NextResponse } from "next/server";
import { requireAdmin } from "@/backend/auth/session";
import { withErrorHandler } from "@/backend/errors/handler";
import { countUsers } from "@/backend/services/user.service";

export const GET = withErrorHandler(async () => {
  await requireAdmin();
  const stats = await countUsers();
  return NextResponse.json({ stats });
});
