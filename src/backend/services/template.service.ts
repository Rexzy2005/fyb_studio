import mongoose from "mongoose";

import { connectDb } from "@/backend/db/client";
import { Template, TemplateLock, type TemplateDoc } from "@/backend/db/models";
import { AppError } from "@/backend/errors/app-error";
import {
  coverFolder,
  deleteAsset,
  deleteFolder,
  assetPublicIdHint,
  pluginImagesFolder,
  templateFolder,
  uploadImage,
  type UploadedAsset,
} from "@/backend/cloudinary/upload";
import { emitTemplateChange } from "@/backend/events/templates.bus";
import { isFigmaDesignV1 } from "@/lib/figma/plugin/schema";
import type { NormalizedDesignV1, NormalizedFill } from "@/lib/figma/normalized";

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
  /**
   * True when the viewer is signed-in, belongs to a department, AND that
   * department's head has reserved this template. Lets the client highlight
   * those templates and sort them to the top. Always false for guests.
   */
  reservedByMyDept: boolean;
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

type PluginImageAsset = {
  url: string;
  publicId: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  mime: string | null;
};

type TemplatePluginImages = {
  byHash: Record<string, PluginImageAsset>;
  byNodeId: Record<string, string>;
};

function strippedDesignJsonMarker(): Record<string, unknown> {
  return {
    version: 1,
    stripped: true,
    renderSource: "normalized",
    assetStorage: "cloudinary",
  };
}

function stripNormalizedPluginImages(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  const next = { ...(input as Record<string, unknown>) };
  if ("__pluginImages" in next) delete next.__pluginImages;
  return next;
}

function collectImageHashesByNodeId(design: NormalizedDesignV1 | null | undefined): Record<string, string> {
  if (!design) return {};
  const out: Record<string, string> = {};
  for (const [nodeId, node] of Object.entries(design.nodesById ?? {})) {
    const fills = (node as { fills?: NormalizedFill[] }).fills;
    if (!Array.isArray(fills)) continue;
    const firstImage = fills.find(
      (fill): fill is Extract<NormalizedFill, { kind: "image" }> =>
        Boolean(fill && fill.kind === "image" && (fill as { imageHash?: string }).imageHash),
    );
    if (firstImage) out[nodeId] = firstImage.imageHash;
  }
  return out;
}

async function uploadPluginImages(
  templateId: string,
  designJson: unknown,
  normalized: NormalizedDesignV1 | null | undefined,
): Promise<TemplatePluginImages | null> {
  if (!isFigmaDesignV1(designJson)) return null;

  const byNodeId = collectImageHashesByNodeId(normalized);
  const usedHashes = new Set(Object.values(byNodeId));
  if (usedHashes.size === 0) return null;

  const hasBytes = Object.entries(designJson.assets.images ?? {}).some(
    ([hash, asset]) => usedHashes.has(hash) && Boolean(asset?.base64),
  );
  if (!hasBytes) return null;

  const byHash: Record<string, PluginImageAsset> = {};
  const uploadedIds: string[] = [];

  try {
    await Promise.all(
      Object.entries(designJson.assets.images ?? {}).map(async ([hash, asset]) => {
        if (!usedHashes.has(hash)) return;
        if (!asset?.base64) return;
        const buffer = Buffer.from(asset.base64, "base64");
        const uploaded = await uploadImage(
          buffer,
          pluginImagesFolder(templateId),
          assetPublicIdHint(hash),
        );
        byHash[hash] = {
          url: uploaded.url,
          publicId: uploaded.publicId,
          width: uploaded.width,
          height: uploaded.height,
          bytes: uploaded.bytes,
          mime: asset.mime || uploaded.mime,
        };
        uploadedIds.push(uploaded.publicId);
      })
    );
  } catch (err) {
    await Promise.all(uploadedIds.map((id) => deleteAsset(id)));
    throw err;
  }

  return { byHash, byNodeId };
}

function attachPluginImagesToNormalized(
  normalized: unknown,
  pluginImages: TemplatePluginImages | null | undefined,
): unknown {
  if (!normalized || typeof normalized !== "object" || !pluginImages) return normalized;
  const byHash: Record<string, { dataUrl: string; width: number; height: number }> = {};
  for (const [hash, asset] of Object.entries(pluginImages.byHash ?? {})) {
    byHash[hash] = {
      dataUrl: asset.url,
      width: asset.width ?? 0,
      height: asset.height ?? 0,
    };
  }
  const next = { ...(normalized as Record<string, unknown>) };
  (next as Record<string, unknown>)["__pluginImages"] = {
    byHash,
    byNodeId: pluginImages.byNodeId ?? {},
  };
  return next;
}

function toListItem(doc: TemplateDoc, reservedByMyDept = false): TemplateListItem {
  return {
    id: doc._id.toString(),
    name: doc.name,
    category: doc.category ?? null,
    coverUrl: doc.cover.url,
    coverWidth: doc.cover.width ?? null,
    coverHeight: doc.cover.height ?? null,
    publishedAt: (doc.publishedAt ?? doc.createdAt).toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    reservedByMyDept,
  };
}

function toDetailView(doc: TemplateDoc): TemplateDetailView {
  const normalized = attachPluginImagesToNormalized(
    doc.normalized ?? null,
    doc.pluginImages as unknown as TemplatePluginImages | undefined,
  );
  return {
    id: doc._id.toString(),
    name: doc.name,
    category: doc.category ?? null,
    status: "published",
    fieldConfig: doc.fieldConfig,
    normalized,
    designJson: null,
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
};

export async function publishTemplate(input: PublishInput): Promise<TemplateDetailView> {
  await connectDb();
  const templateId = new mongoose.Types.ObjectId();
  const idStr = templateId.toString();

  let coverUploaded: UploadedAsset | null = null;

  try {
    coverUploaded = await uploadImage(input.coverFile.buffer, coverFolder(idStr), "cover");

    const normalized = stripNormalizedPluginImages(input.normalized) as NormalizedDesignV1 | null;
    const pluginImages = (await uploadPluginImages(idStr, input.designJson, normalized)) ?? {
      byHash: {},
      byNodeId: collectImageHashesByNodeId(normalized),
    };

    const doc = await Template.create({
      _id: templateId,
      name: input.name,
      category: input.category ?? null,
      status: "published",
      fieldConfig: input.fieldConfig,
      normalized,
      designJson: strippedDesignJsonMarker(),
      pluginImages,
      cover: {
        url: coverUploaded.url,
        publicId: coverUploaded.publicId,
        width: coverUploaded.width,
        height: coverUploaded.height,
        bytes: coverUploaded.bytes,
        mime: coverUploaded.mime,
      },
      designAssets: [],
      createdBy: new mongoose.Types.ObjectId(input.createdByUserId),
      publishedAt: new Date(),
      version: 1,
    });

    emitTemplateChange({ type: "published", templateId: idStr, at: new Date().toISOString() });

    return toDetailView(doc);
  } catch (err) {
    if (coverUploaded) await deleteFolder(templateFolder(idStr));
    throw err;
  }
}

export type UpdateInput = {
  templateId: string;
  name?: string;
  category?: string | null;
  designJson?: unknown;
  normalized?: unknown;
  fieldConfig?: unknown;
  replaceCover?: { buffer: Buffer; mime: string } | null;
};

export async function updatePublishedTemplate(
  input: UpdateInput
): Promise<TemplateDetailView> {
  await connectDb();
  if (!mongoose.isValidObjectId(input.templateId)) {
    throw new AppError("NOT_FOUND", "Template not found", 404);
  }

  const existing = await Template.findById(input.templateId).select("-designJson");
  if (!existing) {
    throw new AppError("NOT_FOUND", "Template not found", 404);
  }

  const idStr = existing._id.toString();
  let newCover: UploadedAsset | null = null;

  try {
    if (input.replaceCover) {
      newCover = await uploadImage(
        input.replaceCover.buffer,
        coverFolder(idStr),
        "cover"
      );
    }

    const $set: Record<string, unknown> = {};

    if (typeof input.name === "string") $set.name = input.name;
    if (input.category !== undefined) $set.category = input.category ?? null;
    if (input.fieldConfig !== undefined) $set.fieldConfig = input.fieldConfig;
    if (input.normalized !== undefined) {
      $set.normalized = stripNormalizedPluginImages(input.normalized);
    }
    if (input.designJson !== undefined) {
      $set.designJson = strippedDesignJsonMarker();
    }

    if (input.designJson !== undefined && input.normalized !== undefined) {
      const nextNormalized = stripNormalizedPluginImages(input.normalized);
      const pluginImages = await uploadPluginImages(
        idStr,
        input.designJson,
        nextNormalized as NormalizedDesignV1 | null,
      ) ?? {
        byHash: {},
        byNodeId: collectImageHashesByNodeId(nextNormalized as NormalizedDesignV1 | null),
      };
      $set.pluginImages = pluginImages;
    }
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
  } catch (err) {
    if (newCover) await deleteAsset(newCover.publicId);
    throw err;
  }
}

export async function deleteTemplateCompletely(templateId: string): Promise<void> {
  await connectDb();
  if (!mongoose.isValidObjectId(templateId)) {
    throw new AppError("NOT_FOUND", "Template not found", 404);
  }

  const existing = await Template.findById(templateId).select("_id");
  if (!existing) {
    throw new AppError("NOT_FOUND", "Template not found", 404);
  }

  const idStr = existing._id.toString();

  await Template.deleteOne({ _id: existing._id });
  await deleteFolder(templateFolder(idStr));

  emitTemplateChange({ type: "unpublished", templateId: idStr, at: new Date().toISOString() });
}

export async function listPublishedTemplates(opts?: {
  /**
   * When set, templates reserved by this department's head are tagged
   * `reservedByMyDept: true` and sorted to the top of the list.
   * For guests (no department), this is a no-op and items return false.
   */
  viewerDepartmentId?: string | null;
}): Promise<TemplateListItem[]> {
  await connectDb();
  const docs = await Template.find({ status: "published" })
    .sort({ publishedAt: -1, updatedAt: -1 })
    .select("name category cover publishedAt updatedAt createdAt status")
    .lean<TemplateDoc[]>();

  const deptId = opts?.viewerDepartmentId;
  if (!deptId || !mongoose.isValidObjectId(deptId)) {
    // Guest or no-dept user: no priority sorting, just return the natural order
    return docs.map((d) => toListItem(d, false));
  }

  // Pull all locks for this dept in a single query, then sort dept-reserved
  // templates to the top while preserving the publishedAt order within groups.
  const locks = await TemplateLock.find({ departmentId: deptId })
    .select("templateId")
    .lean<Array<{ templateId: mongoose.Types.ObjectId | string }>>();
  const reservedSet = new Set(locks.map((l) => String(l.templateId)));

  const items = docs.map((d) => toListItem(d, reservedSet.has(String(d._id))));
  // Stable sort: reserved-by-my-dept first, otherwise keep existing order
  items.sort((a, b) => {
    if (a.reservedByMyDept === b.reservedByMyDept) return 0;
    return a.reservedByMyDept ? -1 : 1;
  });
  return items;
}

export async function listAllTemplatesForAdmin(): Promise<TemplateListItem[]> {
  return listPublishedTemplates();
}

export async function getTemplateById(
  templateId: string
): Promise<TemplateDetailView | null> {
  await connectDb();
  if (!mongoose.isValidObjectId(templateId)) return null;
  const doc = await Template.findById(templateId).select("-designJson");
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
