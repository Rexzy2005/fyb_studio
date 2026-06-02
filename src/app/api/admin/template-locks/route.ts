import { NextResponse } from "next/server";

import { requireAdmin } from "@/backend/auth/session";
import { withErrorHandler } from "@/backend/errors/handler";
import { listAllTemplateLocksForAdmin } from "@/backend/services/templateLock.service";

export const runtime = "nodejs";

export const GET = withErrorHandler(async () => {
  await requireAdmin();
  const locks = await listAllTemplateLocksForAdmin();
  return NextResponse.json({ locks });
});
