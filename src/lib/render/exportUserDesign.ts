"use client";

import type { NormalizedDesignV1 } from "@/lib/figma";
import type { PluginImageMap } from "@/lib/figma/plugin/adapter";
import { exportTemplatePng } from "@/lib/render/exportPng";
import type { FieldConfig, UserDesignRecord } from "@/lib/storage/types";

export type ExportUserDesignImageEntry = {
  blob: Blob;
  objectFit: "cover" | "contain";
  preservePaintScaleMode?: boolean;
};

type RuntimeImageEntry = {
  blob: Blob;
  objectFit: "cover" | "contain";
};

function fitForField(field: Extract<FieldConfig["fields"][number], { kind: "image" }>): "cover" | "contain" {
  return field.imageBehavior?.fit ?? field.cropRule ?? "cover";
}

function pluginImagesFromDesign(
  design: NormalizedDesignV1 | null | undefined,
): Record<string, { url: string; objectFit: "cover"; preservePaintScaleMode: true }> {
  if (!design) return {};
  const pluginImages = (design as unknown as { __pluginImages?: PluginImageMap }).__pluginImages;
  if (!pluginImages) return {};
  const out: Record<string, { url: string; objectFit: "cover"; preservePaintScaleMode: true }> = {};
  for (const [nodeId, hash] of Object.entries(pluginImages.byNodeId)) {
    const url = pluginImages.byHash[hash]?.dataUrl;
    if (!url) continue;
    out[nodeId] = { url, objectFit: "cover", preservePaintScaleMode: true };
  }
  return out;
}

async function urlToBlob(url: string): Promise<Blob | null> {
  try {
    const isLocalUrl = url.startsWith("data:") || url.startsWith("blob:");
    const res = await fetch(
      url,
      isLocalUrl ? { cache: "force-cache" } : { cache: "force-cache", mode: "cors" },
    );
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

export async function buildUserDesignExportImages(opts: {
  design: NormalizedDesignV1;
  fieldConfig: FieldConfig;
  userImagesByNodeId: Record<string, RuntimeImageEntry>;
  designAssetImagesByNodeId?: Record<string, RuntimeImageEntry>;
  assetUrlsByNodeId?: Record<string, string>;
}): Promise<Record<string, ExportUserDesignImageEntry>> {
  const imageBlobs: Record<string, ExportUserDesignImageEntry> = {};

  await Promise.all(
    Object.entries(pluginImagesFromDesign(opts.design)).map(async ([nodeId, entry]) => {
      const blob = await urlToBlob(entry.url);
      if (!blob) return;
      imageBlobs[nodeId] = {
        blob,
        objectFit: entry.objectFit,
        preservePaintScaleMode: entry.preservePaintScaleMode,
      };
    }),
  );

  for (const [nodeId, entry] of Object.entries(opts.userImagesByNodeId)) {
    imageBlobs[nodeId] = { blob: entry.blob, objectFit: entry.objectFit };
  }

  for (const field of opts.fieldConfig.fields) {
    if (field.kind !== "image") continue;
    if (field.imageSource !== "design_asset") continue;

    const existingAsset = opts.designAssetImagesByNodeId?.[field.nodeId];
    if (existingAsset) {
      imageBlobs[field.nodeId] = {
        blob: existingAsset.blob,
        objectFit: fitForField(field),
      };
      continue;
    }

    const assetUrl = opts.assetUrlsByNodeId?.[field.nodeId];
    if (assetUrl) {
      const blob = await urlToBlob(assetUrl);
      if (blob) {
        imageBlobs[field.nodeId] = { blob, objectFit: fitForField(field) };
        continue;
      }
    }

    delete imageBlobs[field.nodeId];
  }

  return imageBlobs;
}

export async function exportUserDesignPng(opts: {
  record: UserDesignRecord;
  scale: number;
}): Promise<{ blob: Blob; width: number; height: number }> {
  const design = opts.record.normalized as NormalizedDesignV1;
  const fieldConfig = opts.record.fieldConfig;
  const imageBlobs = await buildUserDesignExportImages({
    design,
    fieldConfig,
    userImagesByNodeId: Object.fromEntries(
      Object.entries(opts.record.inputs.imageBlobsByNodeId).map(([nodeId, entry]) => [
        nodeId,
        { blob: entry.blob, objectFit: entry.objectFit },
      ]),
    ),
    assetUrlsByNodeId: opts.record.assetUrlsByNodeId,
  });

  return exportTemplatePng({
    design,
    fieldConfig,
    previewTextByNodeId: opts.record.inputs.textByNodeId,
    previewImageByNodeId: imageBlobs,
    previewColorByNodeId: opts.record.inputs.colorByNodeId,
    scale: opts.scale,
  });
}
