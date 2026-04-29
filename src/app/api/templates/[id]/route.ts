import { NextResponse } from "next/server";

import { withErrorHandler } from "@/backend/errors/handler";
import { AppError } from "@/backend/errors/app-error";
import { getTemplateById } from "@/backend/services/template.service";

export const runtime = "nodejs";

export const GET = withErrorHandler(async (_req, ctx) => {
  const { id } = await ctx.params;
  const template = await getTemplateById(id);
  if (!template) {
    throw new AppError("NOT_FOUND", "Template not found", 404);
  }
  return NextResponse.json(
    { template },
    { headers: { "Cache-Control": "no-store" } }
  );
});
