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

export type PublicTemplateLockBlock = {
  templateId: string;
  departmentId: string;
  departmentName: string;
  departmentAbbreviation: string;
  fromSameDept: boolean;
  requiresPasscode: boolean;
};

export type FetchPublicTemplateResult =
  | { kind: "ok"; template: PublicTemplate }
  | { kind: "not-found" }
  | { kind: "locked"; lock: PublicTemplateLockBlock };

export async function fetchPublicTemplate(
  id: string
): Promise<FetchPublicTemplateResult> {
  const res = await fetch(`/api/templates/${id}`, { cache: "no-store" });
  if (res.status === 404) return { kind: "not-found" };
  if (res.status === 403) {
    try {
      const data = (await res.json()) as {
        lock?: PublicTemplateLockBlock;
      };
      if (data.lock) return { kind: "locked", lock: data.lock };
    } catch {
      // fall through
    }
    throw new Error(`Forbidden (${res.status})`);
  }
  if (!res.ok) throw new Error(await readError(res));
  const data = (await res.json()) as { template: PublicTemplate };
  return { kind: "ok", template: data.template };
}
