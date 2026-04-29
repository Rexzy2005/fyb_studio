export type PublicTemplateAsset = {
  nodeId: string;
  url: string;
  width: number | null;
  height: number | null;
  mime: string | null;
};

export type PublicTemplate = {
  id: string;
  name: string;
  category: string | null;
  status: "published";
  fieldConfig: unknown;
  normalized: unknown;
  designJson: unknown;
  cover: { url: string; width: number | null; height: number | null };
  designAssets: PublicTemplateAsset[];
  publishedAt: string;
  updatedAt: string;
  version: number;
};

export type PublicTemplateListItem = {
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

export async function fetchPublicTemplateList(): Promise<PublicTemplateListItem[]> {
  const res = await fetch("/api/templates", { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { templates: PublicTemplateListItem[] };
  return data.templates;
}

export async function fetchPublicTemplate(id: string): Promise<PublicTemplate | null> {
  const res = await fetch(`/api/templates/${id}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { template: PublicTemplate };
  return data.template;
}
