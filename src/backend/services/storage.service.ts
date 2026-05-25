import { connectDb } from "@/backend/db/client";
import { env } from "@/backend/env";
import { getCloudinary } from "@/backend/cloudinary/client";
import { AppError } from "@/backend/errors/app-error";

export interface DatabaseStorageStats {
  /** Logical document bytes (uncompressed). */
  dataSizeBytes: number;
  /** Disk bytes used (after compression + per-collection padding). */
  storageSizeBytes: number;
  /** Bytes consumed by indexes. */
  indexSizeBytes: number;
  /** Sum of storageSize + indexSize - what Atlas bills against quota. */
  totalUsedBytes: number;
  /** Configured cluster quota in bytes. */
  quotaBytes: number;
  /** Remaining bytes before the quota is hit. */
  remainingBytes: number;
  /** Percentage of quota used (0–100). */
  percentUsed: number;
  /** Document count across all collections in this db. */
  documentCount: number;
  /** Number of collections in the database. */
  collectionCount: number;
  /** Number of indexes across all collections. */
  indexCount: number;
}

export interface CloudinaryStorageStats {
  usedBytes: number;
  quotaBytes: number | null;
  remainingBytes: number | null;
  percentUsed: number;
  assetCount: number;
  transformationCount: number;
  lastUpdated: string | null;
  plan: string | null;
}

/**
 * Reads `db.stats()` from MongoDB and combines the result with the
 * configured cluster quota (`MONGODB_STORAGE_QUOTA_MB`, defaults to
 * the Atlas Free tier 512 MB) so the admin dashboard can show a
 * "used / total" gauge.
 *
 * `db.stats()` returns sizes for the SINGLE database the app is using
 * (configured via `MONGODB_DB`). Atlas quotas are usually cluster-wide
 * but in practice the FYB Studio cluster only hosts this one db, so
 * the per-db total is the right number to display.
 */
export async function getDatabaseStorageStats(): Promise<DatabaseStorageStats> {
  const mongoose = await connectDb();
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error("Database connection is not ready");
  }

  // `db.stats()` returns scaled fields (we leave scale at default 1, bytes).
  // The shape is well-defined by the driver - we narrow via a tiny type so
  // strict mode doesn't complain about index access on `Document`.
  const raw = (await db.stats()) as {
    dataSize: number;
    storageSize: number;
    indexSize: number;
    objects?: number;
    collections?: number;
    indexes?: number;
  };

  const dataSizeBytes = Number(raw.dataSize ?? 0);
  const storageSizeBytes = Number(raw.storageSize ?? 0);
  const indexSizeBytes = Number(raw.indexSize ?? 0);
  // Atlas measures usage as storage + indexes (compressed footprint).
  const totalUsedBytes = storageSizeBytes + indexSizeBytes;
  const quotaBytes = env.MONGODB_STORAGE_QUOTA_MB * 1024 * 1024;
  const remainingBytes = Math.max(0, quotaBytes - totalUsedBytes);
  const percentUsed = quotaBytes > 0
    ? Math.min(100, (totalUsedBytes / quotaBytes) * 100)
    : 0;

  return {
    dataSizeBytes,
    storageSizeBytes,
    indexSizeBytes,
    totalUsedBytes,
    quotaBytes,
    remainingBytes,
    percentUsed,
    documentCount: Number(raw.objects ?? 0),
    collectionCount: Number(raw.collections ?? 0),
    indexCount: Number(raw.indexes ?? 0),
  };
}

type CloudinaryUsageMetric = {
  usage?: unknown;
  used?: unknown;
  limit?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function metricUsed(metric: CloudinaryUsageMetric): number {
  const value = metric.usage ?? metric.used;
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function metricLimit(metric: CloudinaryUsageMetric): number | null {
  const parsed = Number(metric.limit);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function parseCloudinaryUsageStats(usage: unknown): CloudinaryStorageStats {
  const root = asRecord(usage);
  const storage = asRecord(root.storage) as CloudinaryUsageMetric;
  const objects = asRecord(root.objects ?? root.resources) as CloudinaryUsageMetric;
  const transformations = asRecord(root.transformations) as CloudinaryUsageMetric;

  const usedBytes = metricUsed(storage);
  const quotaBytes = metricLimit(storage);
  const remainingBytes = quotaBytes === null ? null : Math.max(0, quotaBytes - usedBytes);
  const percentUsed = quotaBytes
    ? Math.min(100, (usedBytes / quotaBytes) * 100)
    : 0;

  const lastUpdated = root.last_updated ?? root.lastUpdated;
  const plan = root.plan;

  return {
    usedBytes,
    quotaBytes,
    remainingBytes,
    percentUsed,
    assetCount: metricUsed(objects),
    transformationCount: metricUsed(transformations),
    lastUpdated: typeof lastUpdated === "string" ? lastUpdated : null,
    plan: typeof plan === "string" ? plan : null,
  };
}

export async function getCloudinaryStorageStats(): Promise<CloudinaryStorageStats> {
  const cloudinary = getCloudinary();
  if (!cloudinary) {
    throw new AppError(
      "INTERNAL_ERROR",
      "Cloudinary is not configured",
      500
    );
  }

  const usage = await cloudinary.api.usage();
  return parseCloudinaryUsageStats(usage);
}
