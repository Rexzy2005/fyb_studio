import { NextResponse } from "next/server";

import { withErrorHandler } from "@/backend/errors/handler";
import { listPublishedTemplates } from "@/backend/services/template.service";

export const runtime = "nodejs";

export const GET = withErrorHandler(async () => {
  const templates = await listPublishedTemplates();
  return NextResponse.json(
    { templates },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
});
