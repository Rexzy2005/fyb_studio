import { nanoid } from "nanoid";

import { getDb } from "./idb";
import type {
  FieldConfig,
  UserDesignAssetUrlMap,
  UserDesignInputs,
  UserDesignRecord,
} from "./types";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

function assertBrowser(): void {
  if (typeof window === "undefined") {
    throw new Error("userDesignRepo is browser-only");
  }
}

function emptyInputs(): UserDesignInputs {
  return { textByNodeId: {}, colorByNodeId: {}, imageBlobsByNodeId: {} };
}

export type CreateInProgressInput = {
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
    id: nanoid(),
    templateId: input.templateId,
    name: input.name,
    categoryLabel: input.categoryLabel,
    designJson: input.designJson,
    normalized: input.normalized,
    fieldConfig: input.fieldConfig,
    assetUrlsByNodeId: input.assetUrlsByNodeId,
    inputs: emptyInputs(),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + TWENTY_FOUR_HOURS_MS).toISOString(),
    downloaded: false,
    lastDownloadedAt: null,
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

export async function markDownloaded(
  id: string,
  thumbnail: { blob: Blob; mime: string; width: number; height: number } | null
): Promise<void> {
  assertBrowser();
  const db = await getDb();
  const existing = await db.get("userDesigns", id);
  if (!existing) return;
  const next: UserDesignRecord = {
    ...existing,
    downloaded: true,
    lastDownloadedAt: new Date().toISOString(),
    thumbnail,
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
    .filter((r) => r.downloaded && new Date(r.expiresAt).getTime() > now)
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
