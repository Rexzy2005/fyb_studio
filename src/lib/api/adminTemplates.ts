export type RemoteTemplateAsset = {
  nodeId: string;
  url: string;
  width: number | null;
  height: number | null;
  mime: string | null;
};

export type RemoteTemplate = {
  id: string;
  name: string;
  category: string | null;
  status: "published";
  fieldConfig: unknown;
  normalized: unknown;
  designJson: unknown;
  cover: { url: string; width: number | null; height: number | null };
  designAssets: RemoteTemplateAsset[];
  publishedAt: string;
  updatedAt: string;
  version: number;
};

export type RemoteTemplateListItem = {
  id: string;
  name: string;
  category: string | null;
  coverUrl: string;
  coverWidth: number | null;
  coverHeight: number | null;
  publishedAt: string;
  updatedAt: string;
};

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: { message?: string } };
    return data?.error?.message ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export async function fetchAdminTemplate(id: string): Promise<RemoteTemplate | null> {
  const res = await fetch(`/api/admin/templates/${id}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { template: RemoteTemplate };
  return data.template;
}

export async function fetchAdminTemplateList(): Promise<RemoteTemplateListItem[]> {
  const res = await fetch(`/api/admin/templates`, { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { templates: RemoteTemplateListItem[] };
  return data.templates;
}

export type PublishPayload = {
  name: string;
  category: string | null;
  designJson: unknown;
  normalized: unknown;
  fieldConfig: unknown;
  coverFile: File;
};

type PluginImageUpload = {
  hash: string;
  mime: string;
  width: number | null;
  height: number | null;
  file: File;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function stripNormalizedPluginImages(input: unknown): unknown {
  if (!isRecord(input)) return input;
  const next = { ...input };
  delete next.__pluginImages;
  return next;
}

function collectImageHashesByNodeId(normalized: unknown): Set<string> {
  const hashes = new Set<string>();
  if (!isRecord(normalized) || !isRecord(normalized.nodesById)) return hashes;

  for (const node of Object.values(normalized.nodesById)) {
    if (!isRecord(node) || !Array.isArray(node.fills)) continue;
    for (const fill of node.fills) {
      if (!isRecord(fill)) continue;
      if (fill.kind !== "image") continue;
      if (typeof fill.imageHash === "string" && fill.imageHash) {
        hashes.add(fill.imageHash);
        break;
      }
    }
  }

  return hashes;
}

function base64ToFile(base64: string, filename: string, mime: string): File {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], filename, { type: mime });
}

function extensionForMime(mime: string): string {
  if (mime === "image/jpeg" || mime === "image/jpg") return "jpg";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "png";
}

function prepareDesignPayload(input: {
  designJson: unknown;
  normalized: unknown;
}): {
  designJson: unknown;
  normalized: unknown;
  pluginImages: PluginImageUpload[];
} {
  const normalized = stripNormalizedPluginImages(input.normalized);
  if (!isRecord(input.designJson)) {
    return { designJson: input.designJson, normalized, pluginImages: [] };
  }

  const assets = isRecord(input.designJson.assets) ? input.designJson.assets : null;
  const images = assets && isRecord(assets.images) ? assets.images : null;
  if (!assets || !images) {
    return { designJson: input.designJson, normalized, pluginImages: [] };
  }

  const usedHashes = collectImageHashesByNodeId(normalized);
  const pluginImages: PluginImageUpload[] = [];
  const strippedImages: Record<string, unknown> = {};

  for (const [hash, rawAsset] of Object.entries(images)) {
    if (!isRecord(rawAsset)) {
      strippedImages[hash] = rawAsset;
      continue;
    }

    const mime = typeof rawAsset.mime === "string" ? rawAsset.mime : "image/png";
    const width = typeof rawAsset.width === "number" ? rawAsset.width : null;
    const height = typeof rawAsset.height === "number" ? rawAsset.height : null;
    const strippedAsset = { ...rawAsset };
    delete strippedAsset.base64;
    strippedImages[hash] = strippedAsset;

    if (!usedHashes.has(hash) || typeof rawAsset.base64 !== "string" || !rawAsset.base64) {
      continue;
    }

    pluginImages.push({
      hash,
      mime,
      width,
      height,
      file: base64ToFile(rawAsset.base64, `${hash}.${extensionForMime(mime)}`, mime),
    });
  }

  const videos = isRecord(assets.videos) ? assets.videos : null;
  const strippedVideos: Record<string, unknown> | undefined = videos ? {} : undefined;
  if (videos && strippedVideos) {
    for (const [hash, rawAsset] of Object.entries(videos)) {
      if (!isRecord(rawAsset)) {
        strippedVideos[hash] = rawAsset;
        continue;
      }
      const strippedAsset = { ...rawAsset };
      delete strippedAsset.base64;
      strippedVideos[hash] = strippedAsset;
    }
  }

  return {
    designJson: {
      ...input.designJson,
      assets: {
        ...assets,
        images: strippedImages,
        ...(strippedVideos ? { videos: strippedVideos } : {}),
      },
    },
    normalized,
    pluginImages,
  };
}

export async function publishTemplateToBackend(
  payload: PublishPayload
): Promise<RemoteTemplate> {
  const form = new FormData();
  const prepared = prepareDesignPayload({
    designJson: payload.designJson,
    normalized: payload.normalized,
  });
  form.append(
    "meta",
    JSON.stringify({
      name: payload.name,
      category: payload.category,
      designJson: prepared.designJson,
      normalized: prepared.normalized,
      fieldConfig: payload.fieldConfig,
      pluginImages: prepared.pluginImages.map(({ hash, mime, width, height }) => ({
        hash,
        mime,
        width,
        height,
      })),
    })
  );
  form.append("cover", payload.coverFile);
  for (const image of prepared.pluginImages) {
    form.append(`pluginImage:${image.hash}`, image.file);
  }

  const res = await fetch(`/api/admin/templates`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { template: RemoteTemplate };
  return data.template;
}

export type UpdatePayload = {
  templateId: string;
  name?: string;
  category?: string | null;
  designJson?: unknown;
  normalized?: unknown;
  fieldConfig?: unknown;
  replaceCoverFile?: File | null;
};

export async function updateTemplateOnBackend(
  payload: UpdatePayload
): Promise<RemoteTemplate> {
  const form = new FormData();
  const prepared = prepareDesignPayload({
    designJson: payload.designJson,
    normalized: payload.normalized,
  });
  form.append(
    "meta",
    JSON.stringify({
      name: payload.name,
      category: payload.category,
      designJson: prepared.designJson,
      normalized: prepared.normalized,
      fieldConfig: payload.fieldConfig,
      replaceCover: Boolean(payload.replaceCoverFile),
      pluginImages: prepared.pluginImages.map(({ hash, mime, width, height }) => ({
        hash,
        mime,
        width,
        height,
      })),
    })
  );
  if (payload.replaceCoverFile) {
    form.append("cover", payload.replaceCoverFile);
  }
  for (const image of prepared.pluginImages) {
    form.append(`pluginImage:${image.hash}`, image.file);
  }

  const res = await fetch(`/api/admin/templates/${payload.templateId}`, {
    method: "PATCH",
    body: form,
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { template: RemoteTemplate };
  return data.template;
}

export async function unpublishTemplate(
  templateId: string,
  confirmName: string
): Promise<void> {
  const res = await fetch(`/api/admin/templates/${templateId}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmName }),
  });
  if (!res.ok) throw new Error(await readError(res));
}
