import { nanoid } from "nanoid";

import { getDb } from "./idb";
import type {
  FieldConfig,
  UserDesignAssetUrlMap,
  UserDesignInputs,
  UserDesignRecord,
} from "./types";

const IN_PROGRESS_RETENTION_MS = 24 * 60 * 60 * 1000;
const PAID_EXPORT_RETENTION_MS = 12 * 60 * 60 * 1000;

function assertBrowser(): void {
  if (typeof window === "undefined") {
    throw new Error("userDesignRepo is browser-only");
  }
}

function emptyInputs(): UserDesignInputs {
  return { textByNodeId: {}, colorByNodeId: {}, imageBlobsByNodeId: {} };
}

export type CreateInProgressInput = {
  id?: string;
  templateId: string;
  name: string;
  categoryLabel: string;
  designJson: unknown;
  normalized: unknown;
  fieldConfig: FieldConfig;
  assetUrlsByNodeId: UserDesignAssetUrlMap;
};

export async function createInProgressDesign(
  input: CreateInProgressInput
): Promise<UserDesignRecord> {
  assertBrowser();
  const db = await getDb();
  const now = new Date();
  const record: UserDesignRecord = {
    id: input.id ?? nanoid(),
    templateId: input.templateId,
    name: input.name,
    categoryLabel: input.categoryLabel,
    designJson: input.designJson,
    normalized: input.normalized,
    fieldConfig: input.fieldConfig,
    assetUrlsByNodeId: input.assetUrlsByNodeId,
    inputs: emptyInputs(),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + IN_PROGRESS_RETENTION_MS).toISOString(),
    downloaded: false,
    lastDownloadedAt: null,
    paidReference: null,
    paidAt: null,
    exportFile: null,
    thumbnail: null,
  };
  await db.put("userDesigns", record);
  return record;
}

export async function getUserDesign(id: string): Promise<UserDesignRecord | null> {
  assertBrowser();
  const db = await getDb();
  return (await db.get("userDesigns", id)) ?? null;
}

export type RefreshUserDesignTemplateInput = {
  name: string;
  categoryLabel: string;
  designJson: unknown;
  normalized: unknown;
  fieldConfig: FieldConfig;
  assetUrlsByNodeId: UserDesignAssetUrlMap;
};

export async function refreshUserDesignTemplateSnapshot(
  id: string,
  input: RefreshUserDesignTemplateInput
): Promise<UserDesignRecord | null> {
  assertBrowser();
  const db = await getDb();
  const existing = await db.get("userDesigns", id);
  if (!existing) return null;

  const next: UserDesignRecord = {
    ...existing,
    name: input.name,
    categoryLabel: input.categoryLabel,
    designJson: input.designJson,
    normalized: input.normalized,
    fieldConfig: input.fieldConfig,
    assetUrlsByNodeId: input.assetUrlsByNodeId,
  };
  await db.put("userDesigns", next);
  return next;
}

export async function findInProgressByTemplate(
  templateId: string
): Promise<UserDesignRecord | null> {
  assertBrowser();
  const db = await getDb();
  const all = await db.getAllFromIndex("userDesigns", "by-templateId", templateId);
  const now = Date.now();
  const candidate = all
    .filter((r) => !r.downloaded && new Date(r.expiresAt).getTime() > now)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
  return candidate ?? null;
}

export async function saveInputs(
  id: string,
  patch: Partial<UserDesignInputs>
): Promise<void> {
  assertBrowser();
  const db = await getDb();
  const existing = await db.get("userDesigns", id);
  if (!existing) return;
  const next: UserDesignRecord = {
    ...existing,
    inputs: {
      textByNodeId: patch.textByNodeId ?? existing.inputs.textByNodeId,
      colorByNodeId: patch.colorByNodeId ?? existing.inputs.colorByNodeId,
      imageBlobsByNodeId:
        patch.imageBlobsByNodeId ?? existing.inputs.imageBlobsByNodeId,
    },
  };
  await db.put("userDesigns", next);
}

export type MarkDownloadedInput = {
  thumbnail: { blob: Blob; mime: string; width: number; height: number } | null;
  exportFile: {
    blob: Blob;
    mime: string;
    width: number;
    height: number;
    scale: number;
    filename: string;
  };
  paidReference?: string | null;
};

export async function markDownloaded(
  id: string,
  input: MarkDownloadedInput
): Promise<void> {
  assertBrowser();
  const db = await getDb();
  const existing = await db.get("userDesigns", id);
  if (!existing) return;
  const now = new Date();
  const next: UserDesignRecord = {
    ...existing,
    downloaded: true,
    lastDownloadedAt: now.toISOString(),
    paidAt: now.toISOString(),
    paidReference: input.paidReference ?? existing.paidReference ?? null,
    expiresAt: new Date(now.getTime() + PAID_EXPORT_RETENTION_MS).toISOString(),
    exportFile: {
      ...input.exportFile,
      savedAt: now.toISOString(),
    },
    thumbnail: input.thumbnail,
  };
  await db.put("userDesigns", next);
}

export async function deleteUserDesign(id: string): Promise<void> {
  assertBrowser();
  const db = await getDb();
  await db.delete("userDesigns", id);
}

export async function listDownloadedDesigns(): Promise<UserDesignRecord[]> {
  assertBrowser();
  const db = await getDb();
  const all = await db.getAll("userDesigns");
  const now = Date.now();
  return all
    .filter((r) => r.downloaded && Boolean(r.exportFile?.blob) && new Date(r.expiresAt).getTime() > now)
    .sort((a, b) => {
      const aT = a.lastDownloadedAt ?? a.createdAt;
      const bT = b.lastDownloadedAt ?? b.createdAt;
      return aT < bT ? 1 : -1;
    });
}

export async function sweepExpiredDesigns(): Promise<number> {
  assertBrowser();
  const db = await getDb();
  const all = await db.getAll("userDesigns");
  const now = Date.now();
  let removed = 0;
  for (const r of all) {
    if (new Date(r.expiresAt).getTime() <= now) {
      await db.delete("userDesigns", r.id);
      removed += 1;
    }
  }
  return removed;
}

export function msUntilExpiry(record: UserDesignRecord): number {
  return Math.max(0, new Date(record.expiresAt).getTime() - Date.now());
}
