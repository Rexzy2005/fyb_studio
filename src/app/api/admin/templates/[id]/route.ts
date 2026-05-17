import { NextResponse } from "next/server";

import { requireAdmin } from "@/backend/auth/session";
import { withErrorHandler } from "@/backend/errors/handler";
import { AppError } from "@/backend/errors/app-error";
import {
  deleteTemplateCompletely,
  findTemplateNameById,
  getTemplateById,
  updatePublishedTemplate,
} from "@/backend/services/template.service";
import {
  unpublishConfirmSchema,
  updateTemplateMetaSchema,
} from "@/backend/validation/template.schema";

export const runtime = "nodejs";

export const GET = withErrorHandler(async (_req, ctx) => {
  await requireAdmin();
  const { id } = await ctx.params;
  const template = await getTemplateById(id);
  if (!template) {
    throw new AppError("NOT_FOUND", "Template not found", 404);
  }
  return NextResponse.json({ template });
});

export const PATCH = withErrorHandler(async (req, ctx) => {
  await requireAdmin();
  const { id } = await ctx.params;

  const form = await req.formData();
  const metaRaw = form.get("meta");
  if (typeof metaRaw !== "string") {
    throw new AppError("VALIDATION_ERROR", "Missing 'meta' part", 422);
  }
  const meta = updateTemplateMetaSchema.parse(JSON.parse(metaRaw));

  let replaceCover: { buffer: Buffer; mime: string } | null = null;
  if (meta.replaceCover) {
    const file = form.get("cover");
    if (!(file instanceof File)) {
      throw new AppError("VALIDATION_ERROR", "Cover file missing for replace", 422);
    }
    replaceCover = {
      buffer: Buffer.from(await file.arrayBuffer()),
      mime: file.type || "image/png",
    };
  }

  const updated = await updatePublishedTemplate({
    templateId: id,
    name: meta.name,
    category: meta.category ?? undefined,
    designJson: meta.designJson,
    normalized: meta.normalized,
    fieldConfig: meta.fieldConfig,
    replaceCover,
  });

  return NextResponse.json({ template: updated });
});

export const DELETE = withErrorHandler(async (req, ctx) => {
  await requireAdmin();
  const { id } = await ctx.params;

  const body = await req.json().catch(() => ({}));
  const { confirmName } = unpublishConfirmSchema.parse(body);

  const actualName = await findTemplateNameById(id);
  if (!actualName) {
    throw new AppError("NOT_FOUND", "Template not found", 404);
  }
  if (confirmName.trim() !== actualName.trim()) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Confirmation name does not match the template name",
      422
    );
  }

  await deleteTemplateCompletely(id);
  return NextResponse.json({ ok: true });
});
