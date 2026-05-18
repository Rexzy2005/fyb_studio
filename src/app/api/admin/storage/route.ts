import { NextResponse } from "next/server";
import { requireAdmin } from "@/backend/auth/session";
import { withErrorHandler } from "@/backend/errors/handler";
import { getDatabaseStorageStats } from "@/backend/services/storage.service";

export const dynamic = "force-dynamic";

export const GET = withErrorHandler(async () => {
  await requireAdmin();
  const stats = await getDatabaseStorageStats();
  return NextResponse.json({ stats });
});
