import { NextResponse } from "next/server";

import { requireAdmin } from "@/backend/auth/session";
import { withErrorHandler } from "@/backend/errors/handler";
import { AppError } from "@/backend/errors/app-error";
import {
  listAllTemplatesForAdmin,
  publishTemplate,
} from "@/backend/services/template.service";
import { publishTemplateMetaSchema } from "@/backend/validation/template.schema";

export const runtime = "nodejs";

export const GET = withErrorHandler(async () => {
  await requireAdmin();
  const templates = await listAllTemplatesForAdmin();
  return NextResponse.json({ templates });
});

export const POST = withErrorHandler(async (req) => {
  const session = await requireAdmin();

  const form = await req.formData();
  const metaRaw = form.get("meta");
  if (typeof metaRaw !== "string") {
    throw new AppError("VALIDATION_ERROR", "Missing 'meta' part", 422);
  }

  const meta = publishTemplateMetaSchema.parse(JSON.parse(metaRaw));

  const coverEntry = form.get("cover");
  if (!(coverEntry instanceof File)) {
    throw new AppError("VALIDATION_ERROR", "Cover image is required", 422);
  }
  const coverBuffer = Buffer.from(await coverEntry.arrayBuffer());

  const assetFiles: Array<{ nodeId: string; buffer: Buffer; mime: string }> = [];
  for (const nodeId of meta.assetNodeIds) {
    const file = form.get(`asset:${nodeId}`);
    if (!(file instanceof File)) {
      throw new AppError(
        "VALIDATION_ERROR",
        `Missing asset file for node '${nodeId}'`,
        422
      );
    }
    assetFiles.push({
      nodeId,
      buffer: Buffer.from(await file.arrayBuffer()),
      mime: file.type || "image/png",
    });
  }

  const created = await publishTemplate({
    createdByUserId: session.user.id!,
    name: meta.name,
    category: meta.category ?? null,
    designJson: meta.designJson,
    normalized: meta.normalized ?? null,
    fieldConfig: meta.fieldConfig,
    coverFile: { buffer: coverBuffer, mime: coverEntry.type || "image/png" },
    assetFiles,
  });

  return NextResponse.json({ template: created }, { status: 201 });
});
