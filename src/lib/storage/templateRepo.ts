import { nanoid } from "nanoid";

import { LS_KEYS } from "./keys";
import { getDb } from "./idb";
import type {
  DesignAssetRecord,
  FontAssetRecord,
  FieldConfig,
  PreviewRecord,
  StorageStats,
  TemplateMeta,
  TemplateRecord,
  TemplateStatus,
} from "./types";

function designAssetKey(templateId: string, nodeId: string): string {
  return `${templateId}:${nodeId}`;
}

function assertBrowser(): void {
  if (typeof window === "undefined") {
    throw new Error(
      "FYB template repository is browser-only. Import from client components only.",
    );
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function safeParseJson<T>(value: string | null): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function loadIndex(): TemplateMeta[] {
  assertBrowser();
  return safeParseJson<TemplateMeta[]>(localStorage.getItem(LS_KEYS.templateIndex)) ?? [];
}

function saveIndex(index: TemplateMeta[]): void {
  assertBrowser();
  localStorage.setItem(LS_KEYS.templateIndex, JSON.stringify(index));
}

function estimateJsonBytes(value: unknown): number {
  // Approximation used for “storage usage awareness” UI.
  // Uses UTF-8 byte length of JSON string.
  const json = JSON.stringify(value);
  return new TextEncoder().encode(json).byteLength;
}

function defaultFieldConfig(): FieldConfig {
  return { version: 1, fields: [] };
}

export type TemplateRepository = {
  listMeta(): Promise<TemplateMeta[]>;
  get(id: string): Promise<TemplateRecord | null>;
  getPreview(id: string): Promise<PreviewRecord | null>;
  getFont(family: string): Promise<FontAssetRecord | null>;
  upsertFont(input: { family: string; blob: Blob }): Promise<FontAssetRecord>;
  deleteFont(family: string): Promise<void>;
  upsertDraft(input: {
    id?: string;
    name: string;
    category?: string;
    designJson: unknown;
    normalized?: unknown;
    fieldConfig?: FieldConfig;
  }): Promise<TemplateRecord>;
  delete(id: string): Promise<void>;
  duplicate(id: string): Promise<TemplateRecord>;
  setStatus(id: string, status: TemplateStatus): Promise<void>;
  attachPreview(input: {
    templateId: string;
    blob: Blob;
    width: number;
    height: number;
  }): Promise<{ previewId: string; bytesPreview: number }>;
  getDesignAsset(input: { templateId: string; nodeId: string }): Promise<DesignAssetRecord | null>;
  saveDesignAsset(input: {
    templateId: string;
    nodeId: string;
    blob: Blob;
    mime?: string;
  }): Promise<DesignAssetRecord>;
  deleteDesignAsset(input: { templateId: string; nodeId: string }): Promise<void>;
  listDesignAssets(templateId: string): Promise<DesignAssetRecord[]>;
  getStats(): Promise<StorageStats>;
};

function normalizeFontFamilyKey(raw: string): string {
  const first = raw.split(",")[0]?.trim() ?? "";
  return first.replace(/^['\"]/g, "").replace(/['\"]$/g, "").trim();
}

function inferFontMime(blob: Blob): string {
  // Use provided mime when available.
  if (blob.type && typeof blob.type === "string") return blob.type;
  // Browser File objects often have type, but if missing default to a safe font mime.
  return "font/woff2";
}

export function createLocalTemplateRepository(): TemplateRepository {
  return {
    async listMeta() {
      return loadIndex().sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    },

    async get(id) {
      const db = await getDb();
      return (await db.get("templates", id)) ?? null;
    },

    async getPreview(id) {
      const db = await getDb();
      return (await db.get("previews", id)) ?? null;
    },

    async getFont(family) {
      const db = await getDb();
      const key = normalizeFontFamilyKey(family);
      if (!key) return null;
      return (await db.get("fonts", key)) ?? null;
    },

    async upsertFont({ family, blob }) {
      const db = await getDb();
      const key = normalizeFontFamilyKey(family);
      if (!key) throw new Error("Font family is required");
      const record: FontAssetRecord = {
        family: key,
        mime: inferFontMime(blob),
        blob,
        updatedAt: nowIso(),
      };
      await db.put("fonts", record);
      return record;
    },

    async deleteFont(family) {
      const db = await getDb();
      const key = normalizeFontFamilyKey(family);
      if (!key) return;
      await db.delete("fonts", key);
    },

    async upsertDraft(input) {
      const db = await getDb();
      const index = loadIndex();

      const existing = input.id ? await db.get("templates", input.id) : undefined;
      const id = existing?.id ?? input.id ?? nanoid();
      const createdAt = existing?.createdAt ?? nowIso();
      const updatedAt = nowIso();

      const record: TemplateRecord = {
        id,
        name: input.name,
        category: input.category ?? existing?.category,
        status: existing?.status ?? "draft",
        createdAt,
        updatedAt,
        designJson: input.designJson,
        normalized: input.normalized ?? existing?.normalized,
        fieldConfig: input.fieldConfig ?? existing?.fieldConfig ?? defaultFieldConfig(),
        previewId: existing?.previewId,
      };

      await db.put("templates", record);

      const bytesDesign = estimateJsonBytes(record.designJson);

      const nextIndex: TemplateMeta[] = [
        {
          id: record.id,
          name: record.name,
          category: record.category,
          status: record.status,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          previewId: record.previewId,
          bytesDesign,
          bytesPreview:
            index.find((m) => m.id === record.id)?.bytesPreview ?? undefined,
        },
        ...index.filter((m) => m.id !== record.id),
      ];

      saveIndex(nextIndex);
      return record;
    },

    async delete(id) {
      const db = await getDb();
      const current = await db.get("templates", id);

      if (current?.previewId) {
        await db.delete("previews", current.previewId);
      }

      const assetKeys = await db.getAllKeysFromIndex("designAssets", "by-templateId", id);
      for (const key of assetKeys) {
        await db.delete("designAssets", key);
      }

      await db.delete("templates", id);
      saveIndex(loadIndex().filter((m) => m.id !== id));
    },

    async duplicate(id) {
      const db = await getDb();
      const existing = await db.get("templates", id);
      if (!existing) throw new Error("Template not found");

      const created = await this.upsertDraft({
        name: `${existing.name} (Copy)`,
        category: existing.category,
        designJson: existing.designJson,
        normalized: existing.normalized,
        fieldConfig: existing.fieldConfig,
      });

      // Copy design-asset blobs to the new template (each asset is keyed per template).
      const assets = await db.getAllFromIndex("designAssets", "by-templateId", id);
      const updatedAt = nowIso();
      for (const asset of assets) {
        const copy: DesignAssetRecord = {
          id: designAssetKey(created.id, asset.nodeId),
          templateId: created.id,
          nodeId: asset.nodeId,
          mime: asset.mime,
          blob: asset.blob,
          updatedAt,
        };
        await db.put("designAssets", copy);
      }

      return created;
    },

    async setStatus(id, status) {
      const db = await getDb();
      const existing = await db.get("templates", id);
      if (!existing) throw new Error("Template not found");

      const updatedAt = nowIso();
      const next: TemplateRecord = { ...existing, status, updatedAt };
      await db.put("templates", next);

      const index = loadIndex();
      const meta = index.find((m) => m.id === id);
      if (!meta) {
        saveIndex(index);
        return;
      }

      saveIndex(
        index.map((m) =>
          m.id === id ? { ...m, status, updatedAt } : m,
        ),
      );
    },

    async attachPreview({ templateId, blob, width, height }) {
      const db = await getDb();
      const template = await db.get("templates", templateId);
      if (!template) throw new Error("Template not found");

      const previewId = nanoid();
      const preview = {
        id: previewId,
        templateId,
        createdAt: nowIso(),
        mime: blob.type || "image/png",
        blob,
        width,
        height,
      };

      await db.put("previews", preview);

      const updatedAt = nowIso();
      await db.put("templates", { ...template, previewId, updatedAt });

      const index = loadIndex();
      const bytesPreview = blob.size;
      saveIndex(
        index.map((m) =>
          m.id === templateId ? { ...m, previewId, updatedAt, bytesPreview } : m,
        ),
      );

      return { previewId, bytesPreview };
    },

    async getDesignAsset({ templateId, nodeId }) {
      const db = await getDb();
      return (await db.get("designAssets", designAssetKey(templateId, nodeId))) ?? null;
    },

    async saveDesignAsset({ templateId, nodeId, blob, mime }) {
      const db = await getDb();
      const record: DesignAssetRecord = {
        id: designAssetKey(templateId, nodeId),
        templateId,
        nodeId,
        mime: mime ?? blob.type ?? "image/png",
        blob,
        updatedAt: nowIso(),
      };
      await db.put("designAssets", record);
      return record;
    },

    async deleteDesignAsset({ templateId, nodeId }) {
      const db = await getDb();
      await db.delete("designAssets", designAssetKey(templateId, nodeId));
    },

    async listDesignAssets(templateId) {
      const db = await getDb();
      return await db.getAllFromIndex("designAssets", "by-templateId", templateId);
    },

    async getStats() {
      const index = loadIndex();
      const templates = index.length;
      const published = index.filter((m) => m.status === "published").length;
      const drafts = templates - published;

      const totalBytesDesign = index.reduce(
        (sum, m) => sum + (m.bytesDesign ?? 0),
        0,
      );
      const totalBytesPreview = index.reduce(
        (sum, m) => sum + (m.bytesPreview ?? 0),
        0,
      );

      return {
        templates,
        published,
        drafts,
        totalBytesDesign,
        totalBytesPreview,
      };
    },
  };
}
