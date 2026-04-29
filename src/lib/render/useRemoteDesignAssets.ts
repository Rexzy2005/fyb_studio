"use client";

import { useEffect, useRef, useState } from "react";

export type RemoteAssetEntry = {
  url: string;
  blob: Blob;
  objectFit: "cover" | "contain";
  _revoke: true;
};

/**
 * Fetches each Cloudinary asset URL into a Blob and creates fresh object URLs
 * suitable for both <img> rendering and canvas export. Mirrors the shape of
 * useDesignAssets() so render code can be source-agnostic.
 */
export function useRemoteDesignAssets(assetUrlsByNodeId: Record<string, string>): {
  designAssetImageByNodeId: Record<string, RemoteAssetEntry>;
} {
  const [map, setMap] = useState<Record<string, RemoteAssetEntry>>({});
  const liveUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    const createdUrls: string[] = [];

    (async () => {
      const entries = Object.entries(assetUrlsByNodeId);
      if (entries.length === 0) {
        if (!cancelled) {
          const previous = liveUrlsRef.current;
          liveUrlsRef.current = new Set();
          setMap({});
          for (const u of previous) URL.revokeObjectURL(u);
        }
        return;
      }

      const next: Record<string, RemoteAssetEntry> = {};
      for (const [nodeId, url] of entries) {
        try {
          const res = await fetch(url, { mode: "cors" });
          if (!res.ok) continue;
          const blob = await res.blob();
          if (cancelled) return;
          const objectUrl = URL.createObjectURL(blob);
          createdUrls.push(objectUrl);
          next[nodeId] = { url: objectUrl, blob, objectFit: "cover", _revoke: true };
        } catch (err) {
          console.warn("[useRemoteDesignAssets] failed to fetch", nodeId, url, err);
        }
      }

      if (cancelled) {
        for (const u of createdUrls) URL.revokeObjectURL(u);
        return;
      }

      const previous = liveUrlsRef.current;
      liveUrlsRef.current = new Set(createdUrls);
      setMap(next);
      for (const u of previous) URL.revokeObjectURL(u);
    })();

    return () => {
      cancelled = true;
    };
  }, [assetUrlsByNodeId]);

  useEffect(() => {
    return () => {
      for (const u of liveUrlsRef.current) URL.revokeObjectURL(u);
      liveUrlsRef.current = new Set();
    };
  }, []);

  return { designAssetImageByNodeId: map };
}
