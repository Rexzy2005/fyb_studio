import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("MONGODB_URI", "mongodb://localhost:27017/fyb_test");
  vi.stubEnv("MONGODB_DB", "fyb_test");
  vi.stubEnv("AUTH_SECRET", "test-secret");
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-google-client-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-google-client-secret");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("parseCloudinaryUsageStats", () => {
  it("reads Cloudinary Admin API usage fields", async () => {
    const { parseCloudinaryUsageStats } = await import("@/backend/services/storage.service");

    const stats = parseCloudinaryUsageStats({
      plan: "Free",
      last_updated: "2026-05-25T12:30:00Z",
      storage: { usage: 25, limit: 100 },
      objects: { usage: 7, limit: 1000 },
      transformations: { usage: 11, limit: 25000 },
    });

    expect(stats).toEqual({
      usedBytes: 25,
      quotaBytes: 100,
      remainingBytes: 75,
      percentUsed: 25,
      assetCount: 7,
      transformationCount: 11,
      lastUpdated: "2026-05-25T12:30:00Z",
      plan: "Free",
    });
  });

  it("falls back to used fields and handles missing quota", async () => {
    const { parseCloudinaryUsageStats } = await import("@/backend/services/storage.service");

    const stats = parseCloudinaryUsageStats({
      storage: { used: 512 },
      objects: { used: 4 },
      transformations: { used: 9 },
    });

    expect(stats.usedBytes).toBe(512);
    expect(stats.quotaBytes).toBeNull();
    expect(stats.remainingBytes).toBeNull();
    expect(stats.percentUsed).toBe(0);
    expect(stats.assetCount).toBe(4);
    expect(stats.transformationCount).toBe(9);
  });
});
