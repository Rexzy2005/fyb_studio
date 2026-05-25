import { NextResponse } from "next/server";

import { requireAdmin } from "@/backend/auth/session";
import { withErrorHandler } from "@/backend/errors/handler";
import { AppError } from "@/backend/errors/app-error";
import {
  listAllTemplatesForAdmin,
  publishTemplate,
  type TemplatePluginImageFileInput,
} from "@/backend/services/template.service";
import { publishTemplateMetaSchema } from "@/backend/validation/template.schema";

export const runtime = "nodejs";

export const GET = withErrorHandler(async () => {
  await requireAdmin();
  const templates = await listAllTemplatesForAdmin();
  return NextResponse.json({ templates });
});

async function readPluginImageFiles(
  form: FormData,
  metaImages: Array<{
    hash: string;
    mime?: string | null;
    width?: number | null;
    height?: number | null;
  }>
): Promise<TemplatePluginImageFileInput[]> {
  const files: TemplatePluginImageFileInput[] = [];
  const metaByHash = new Map(metaImages.map((image) => [image.hash, image]));

  for (const [key, entry] of form.entries()) {
    if (!key.startsWith("pluginImage:")) continue;
    if (!(entry instanceof File)) continue;

    const hash = key.slice("pluginImage:".length);
    if (!hash) continue;
    const meta = metaByHash.get(hash);
    files.push({
      hash,
      buffer: Buffer.from(await entry.arrayBuffer()),
      mime: entry.type || meta?.mime || null,
      width: meta?.width ?? null,
      height: meta?.height ?? null,
    });
  }

  return files;
}

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
  const pluginImageFiles = await readPluginImageFiles(form, meta.pluginImages);

  const created = await publishTemplate({
    createdByUserId: session.user.id!,
    name: meta.name,
    category: meta.category ?? null,
    designJson: meta.designJson,
    normalized: meta.normalized ?? null,
    fieldConfig: meta.fieldConfig,
    coverFile: { buffer: coverBuffer, mime: coverEntry.type || "image/png" },
    pluginImageFiles,
  });

  return NextResponse.json({ template: created }, { status: 201 });
});
