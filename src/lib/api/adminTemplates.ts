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
  assetFiles: Array<{ nodeId: string; file: File }>;
};

export async function publishTemplateToBackend(
  payload: PublishPayload
): Promise<RemoteTemplate> {
  const form = new FormData();
  form.append(
    "meta",
    JSON.stringify({
      name: payload.name,
      category: payload.category,
      designJson: payload.designJson,
      normalized: payload.normalized,
      fieldConfig: payload.fieldConfig,
      assetNodeIds: payload.assetFiles.map((a) => a.nodeId),
    })
  );
  form.append("cover", payload.coverFile);
  for (const a of payload.assetFiles) {
    form.append(`asset:${a.nodeId}`, a.file);
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
  replaceAssetFiles?: Array<{ nodeId: string; file: File }>;
  removeAssetNodeIds?: string[];
};

export async function updateTemplateOnBackend(
  payload: UpdatePayload
): Promise<RemoteTemplate> {
  const form = new FormData();
  form.append(
    "meta",
    JSON.stringify({
      name: payload.name,
      category: payload.category,
      designJson: payload.designJson,
      normalized: payload.normalized,
      fieldConfig: payload.fieldConfig,
      replaceCover: Boolean(payload.replaceCoverFile),
      replaceAssetNodeIds: (payload.replaceAssetFiles ?? []).map((a) => a.nodeId),
      removeAssetNodeIds: payload.removeAssetNodeIds ?? [],
    })
  );
  if (payload.replaceCoverFile) {
    form.append("cover", payload.replaceCoverFile);
  }
  for (const a of payload.replaceAssetFiles ?? []) {
    form.append(`asset:${a.nodeId}`, a.file);
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
