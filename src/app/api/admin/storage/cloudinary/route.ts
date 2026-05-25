import { NextResponse } from "next/server";

import { requireAdmin } from "@/backend/auth/session";
import { withErrorHandler } from "@/backend/errors/handler";
import { getCloudinaryStorageStats } from "@/backend/services/storage.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withErrorHandler(async () => {
  await requireAdmin();
  const stats = await getCloudinaryStorageStats();
  return NextResponse.json(
    { stats },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
});
