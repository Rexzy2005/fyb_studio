import mongoose from "mongoose";

import { connectDb } from "@/backend/db/client";
import { Template, type TemplateDoc } from "@/backend/db/models";
import { AppError } from "@/backend/errors/app-error";
import {
  assetPublicIdHint,
  assetsFolder,
  coverFolder,
  deleteAsset,
  deleteFolder,
  templateFolder,
  uploadImage,
  type UploadedAsset,
} from "@/backend/cloudinary/upload";
import { emitTemplateChange } from "@/backend/events/templates.bus";

export type TemplateAssetView = {
  nodeId: string;
  url: string;
  width: number | null;
  height: number | null;
  mime: string | null;
};

export type TemplateListItem = {
  id: string;
  name: string;
  category: string | null;
  coverUrl: string;
  coverWidth: number | null;
  coverHeight: number | null;
  publishedAt: string;
  updatedAt: string;
};

export type TemplateDetailView = {
  id: string;
  name: string;
  category: string | null;
  status: "published";
  fieldConfig: unknown;
  normalized: unknown;
  designJson: unknown;
  cover: { url: string; width: number | null; height: number | null };
  designAssets: TemplateAssetView[];
  publishedAt: string;
  updatedAt: string;
  version: number;
};

function toListItem(doc: TemplateDoc): TemplateListItem {
  return {
    id: doc._id.toString(),
    name: doc.name,
    category: doc.category ?? null,
    coverUrl: doc.cover.url,
    coverWidth: doc.cover.width ?? null,
    coverHeight: doc.cover.height ?? null,
    publishedAt: (doc.publishedAt ?? doc.createdAt).toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function toDetailView(doc: TemplateDoc): TemplateDetailView {
  return {
    id: doc._id.toString(),
    name: doc.name,
    category: doc.category ?? null,
    status: "published",
    fieldConfig: doc.fieldConfig,
    normalized: doc.normalized ?? null,
    designJson: doc.designJson,
    cover: {
      url: doc.cover.url,
      width: doc.cover.width ?? null,
      height: doc.cover.height ?? null,
    },
    designAssets: (doc.designAssets ?? []).map((a) => ({
      nodeId: a.nodeId,
      url: a.url,
      width: a.width ?? null,
      height: a.height ?? null,
      mime: a.mime ?? null,
    })),
    publishedAt: (doc.publishedAt ?? doc.createdAt).toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    version: doc.version ?? 1,
  };
}

export type PublishInput = {
  createdByUserId: string;
  name: string;
  category: string | null;
  designJson: unknown;
  normalized: unknown;
  fieldConfig: unknown;
  coverFile: { buffer: Buffer; mime: string };
  assetFiles: Array<{ nodeId: string; buffer: Buffer; mime: string }>;
};

export async function publishTemplate(input: PublishInput): Promise<TemplateDetailView> {
  await connectDb();
  const templateId = new mongoose.Types.ObjectId();
  const idStr = templateId.toString();

  let coverUploaded: UploadedAsset | null = null;
  const assetUploads: Array<UploadedAsset & { nodeId: string }> = [];

  try {
    coverUploaded = await uploadImage(input.coverFile.buffer, coverFolder(idStr), "cover");

    for (const a of input.assetFiles) {
      const uploaded = await uploadImage(
        a.buffer,
        assetsFolder(idStr),
        assetPublicIdHint(a.nodeId)
      );
      assetUploads.push({ ...uploaded, nodeId: a.nodeId });
    }
  } catch (err) {
    if (coverUploaded) await deleteAsset(coverUploaded.publicId);
    for (const a of assetUploads) await deleteAsset(a.publicId);
    throw err;
  }

  const doc = await Template.create({
    _id: templateId,
    name: input.name,
    category: input.category ?? null,
    status: "published",
    fieldConfig: input.fieldConfig,
    normalized: input.normalized,
    designJson: input.designJson,
    cover: {
      url: coverUploaded.url,
      publicId: coverUploaded.publicId,
      width: coverUploaded.width,
      height: coverUploaded.height,
      bytes: coverUploaded.bytes,
      mime: coverUploaded.mime,
    },
    designAssets: assetUploads.map((a) => ({
      nodeId: a.nodeId,
      url: a.url,
      publicId: a.publicId,
      mime: a.mime,
      width: a.width,
      height: a.height,
      bytes: a.bytes,
    })),
    createdBy: new mongoose.Types.ObjectId(input.createdByUserId),
    publishedAt: new Date(),
    version: 1,
  });

  emitTemplateChange({ type: "published", templateId: idStr, at: new Date().toISOString() });

  return toDetailView(doc);
}

export type UpdateInput = {
  templateId: string;
  name?: string;
  category?: string | null;
  designJson?: unknown;
  normalized?: unknown;
  fieldConfig?: unknown;
  replaceCover?: { buffer: Buffer; mime: string } | null;
  replaceAssets: Array<{ nodeId: string; buffer: Buffer; mime: string }>;
  removeAssetNodeIds: string[];
};

export async function updatePublishedTemplate(
  input: UpdateInput
): Promise<TemplateDetailView> {
  await connectDb();
  if (!mongoose.isValidObjectId(input.templateId)) {
    throw new AppError("NOT_FOUND", "Template not found", 404);
  }

  const existing = await Template.findById(input.templateId);
  if (!existing) {
    throw new AppError("NOT_FOUND", "Template not found", 404);
  }

  const idStr = existing._id.toString();
  const newAssetUploads: Array<UploadedAsset & { nodeId: string }> = [];
  let newCover: UploadedAsset | null = null;

  try {
    if (input.replaceCover) {
      newCover = await uploadImage(
        input.replaceCover.buffer,
        coverFolder(idStr),
        "cover"
      );
    }

    for (const a of input.replaceAssets) {
      const uploaded = await uploadImage(
        a.buffer,
        assetsFolder(idStr),
        assetPublicIdHint(a.nodeId)
      );
      newAssetUploads.push({ ...uploaded, nodeId: a.nodeId });
    }
  } catch (err) {
    if (newCover) await deleteAsset(newCover.publicId);
    for (const a of newAssetUploads) await deleteAsset(a.publicId);
    throw err;
  }

  type AssetEntry = {
    nodeId: string;
    url: string;
    publicId: string;
    mime: string | null;
    width: number | null;
    height: number | null;
    bytes: number | null;
  };

  const startingAssets: AssetEntry[] = (existing.designAssets ?? []).map((a) => ({
    nodeId: a.nodeId,
    url: a.url,
    publicId: a.publicId,
    mime: a.mime ?? null,
    width: a.width ?? null,
    height: a.height ?? null,
    bytes: a.bytes ?? null,
  }));

  const finalAssets: AssetEntry[] = [...startingAssets];

  for (const removeId of input.removeAssetNodeIds) {
    const idx = finalAssets.findIndex((a) => a.nodeId === removeId);
    if (idx >= 0) {
      const [removed] = finalAssets.splice(idx, 1);
      if (removed?.publicId) await deleteAsset(removed.publicId);
    }
  }

  for (const upload of newAssetUploads) {
    const idx = finalAssets.findIndex((a) => a.nodeId === upload.nodeId);
    const replacement: AssetEntry = {
      nodeId: upload.nodeId,
      url: upload.url,
      publicId: upload.publicId,
      mime: upload.mime,
      width: upload.width,
      height: upload.height,
      bytes: upload.bytes,
    };
    if (idx >= 0) {
      const previous = finalAssets[idx];
      if (previous && previous.publicId !== replacement.publicId) {
        await deleteAsset(previous.publicId);
      }
      finalAssets[idx] = replacement;
    } else {
      finalAssets.push(replacement);
    }
  }

  const $set: Record<string, unknown> = {
    designAssets: finalAssets,
  };

  if (typeof input.name === "string") $set.name = input.name;
  if (input.category !== undefined) $set.category = input.category ?? null;
  if (input.designJson !== undefined) $set.designJson = input.designJson;
  if (input.normalized !== undefined) $set.normalized = input.normalized;
  if (input.fieldConfig !== undefined) $set.fieldConfig = input.fieldConfig;
  if (newCover) {
    $set.cover = {
      url: newCover.url,
      publicId: newCover.publicId,
      width: newCover.width,
      height: newCover.height,
      bytes: newCover.bytes,
      mime: newCover.mime,
    };
  }

  const updated = await Template.findByIdAndUpdate(
    existing._id,
    { $set, $inc: { version: 1 } },
    { new: true, runValidators: true }
  );

  if (!updated) {
    throw new AppError("NOT_FOUND", "Template not found", 404);
  }

  emitTemplateChange({ type: "updated", templateId: idStr, at: new Date().toISOString() });

  return toDetailView(updated);
}

export async function deleteTemplateCompletely(templateId: string): Promise<void> {
  await connectDb();
  if (!mongoose.isValidObjectId(templateId)) {
    throw new AppError("NOT_FOUND", "Template not found", 404);
  }

  const existing = await Template.findById(templateId);
  if (!existing) {
    throw new AppError("NOT_FOUND", "Template not found", 404);
  }

  const idStr = existing._id.toString();

  await Template.deleteOne({ _id: existing._id });
  await deleteFolder(templateFolder(idStr));

  emitTemplateChange({ type: "unpublished", templateId: idStr, at: new Date().toISOString() });
}

export async function listPublishedTemplates(): Promise<TemplateListItem[]> {
  await connectDb();
  const docs = await Template.find({ status: "published" })
    .sort({ publishedAt: -1, updatedAt: -1 })
    .select("name category cover publishedAt updatedAt createdAt status")
    .lean<TemplateDoc[]>();
  return docs.map((d) => toListItem(d));
}

export async function listAllTemplatesForAdmin(): Promise<TemplateListItem[]> {
  return listPublishedTemplates();
}

export async function getTemplateById(
  templateId: string
): Promise<TemplateDetailView | null> {
  await connectDb();
  if (!mongoose.isValidObjectId(templateId)) return null;
  const doc = await Template.findById(templateId);
  return doc ? toDetailView(doc) : null;
}

export async function findTemplateNameById(
  templateId: string
): Promise<string | null> {
  await connectDb();
  if (!mongoose.isValidObjectId(templateId)) return null;
  const doc = await Template.findById(templateId).select("name").lean<{ name: string } | null>();
  return doc?.name ?? null;
}
