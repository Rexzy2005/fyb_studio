import { NextResponse } from "next/server";

import { getSession } from "@/backend/auth/session";
import { withErrorHandler } from "@/backend/errors/handler";
import { listPublishedTemplates } from "@/backend/services/template.service";

export const runtime = "nodejs";

export const GET = withErrorHandler(async () => {
  // Read session opportunistically - guests get the natural order.
  // Signed-in users with a department see designs reserved by their dept
  // head pinned to the top of the list.
  const session = await getSession();
  const viewerDepartmentId = session?.user?.departmentId ?? null;

  const templates = await listPublishedTemplates({ viewerDepartmentId });

  return NextResponse.json(
    { templates },
    {
      headers: {
        // Per-user response (sort depends on viewer's dept) - must not cache shared
        "Cache-Control": "private, no-store",
      },
    }
  );
});
