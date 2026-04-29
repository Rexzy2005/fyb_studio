import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import type {
  DesignAssetRecord,
  FontAssetRecord,
  PreviewRecord,
  TemplateRecord,
  UserDesignRecord,
} from "./types";

const DB_NAME = "fyb-studio" as const;
const DB_VERSION = 4 as const;

interface FybStudioDb extends DBSchema {
  templates: {
    key: string;
    value: TemplateRecord;
    indexes: { "by-status": TemplateRecord["status"]; "by-updatedAt": string };
  };
  previews: {
    key: string;
    value: PreviewRecord;
    indexes: { "by-templateId": string };
  };
  fonts: {
    key: string;
    value: FontAssetRecord;
    indexes: { "by-updatedAt": string };
  };
  designAssets: {
    key: string;
    value: DesignAssetRecord;
    indexes: { "by-templateId": string };
  };
  userDesigns: {
    key: string;
    value: UserDesignRecord;
    indexes: {
      "by-templateId": string;
      "by-expiresAt": string;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<FybStudioDb>> | null = null;

function assertBrowser(): void {
  if (typeof window === "undefined") {
    throw new Error(
      "FYB storage is browser-only. Import this module from client components only.",
    );
  }
}

export function getDb(): Promise<IDBPDatabase<FybStudioDb>> {
  assertBrowser();

  if (!dbPromise) {
    dbPromise = openDB<FybStudioDb>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("templates")) {
          const store = db.createObjectStore("templates", { keyPath: "id" });
          store.createIndex("by-status", "status");
          store.createIndex("by-updatedAt", "updatedAt");
        }

        if (!db.objectStoreNames.contains("previews")) {
          const store = db.createObjectStore("previews", { keyPath: "id" });
          store.createIndex("by-templateId", "templateId");
        }

        if (!db.objectStoreNames.contains("fonts")) {
          const store = db.createObjectStore("fonts", { keyPath: "family" });
          store.createIndex("by-updatedAt", "updatedAt");
        }

        if (!db.objectStoreNames.contains("designAssets")) {
          const store = db.createObjectStore("designAssets", { keyPath: "id" });
          store.createIndex("by-templateId", "templateId");
        }

        if (!db.objectStoreNames.contains("userDesigns")) {
          const store = db.createObjectStore("userDesigns", { keyPath: "id" });
          store.createIndex("by-templateId", "templateId");
          store.createIndex("by-expiresAt", "expiresAt");
        }
      },
    });
  }

  return dbPromise;
}
