"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { createLocalTemplateRepository } from "@/lib/storage/templateRepo";

export type DesignAssetEntry = {
  url: string;
  blob: Blob;
  objectFit: "cover" | "contain";
  _revoke: true;
};

type State = Record<string, DesignAssetEntry>;

/**
 * Loads all admin-uploaded design-asset blobs for a template into a map keyed by nodeId,
 * exposing fresh object URLs to the renderer.
 *
 * Lifecycle:
 * - Refetches when `templateId` or the internal version counter changes.
 * - Revokes previous object URLs after a new fetch commits, on unmount, or when templateId
 *   becomes null. No leaks across template switches or hot reloads.
 *
 * Use `reloadDesignAssets()` after admin save/remove to pull the latest blobs.
 */
export function useDesignAssets(templateId: string | null | undefined): {
  designAssetImageByNodeId: State;
  reloadDesignAssets: () => void;
} {
  const repoRef = useRef<ReturnType<typeof createLocalTemplateRepository> | null>(null);
  if (!repoRef.current) repoRef.current = createLocalTemplateRepository();

  const [map, setMap] = useState<State>({});
  const [version, setVersion] = useState(0);
  const liveUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!templateId) {
      // Clear and revoke any URLs from a previous template.
      const prev = liveUrlsRef.current;
      if (prev.size > 0) {
        for (const u of prev) URL.revokeObjectURL(u);
        liveUrlsRef.current = new Set();
      }
      setMap((current) => (Object.keys(current).length === 0 ? current : {}));
      return;
    }

    let cancelled = false;
    const repo = repoRef.current;
    if (!repo) return;

    const createdUrls: string[] = [];

    repo
      .listDesignAssets(templateId)
      .then((records) => {
        if (cancelled) {
          // We were superseded; revoke any URLs we created in this run.
          for (const u of createdUrls) URL.revokeObjectURL(u);
          return;
        }

        const next: State = {};
        for (const r of records) {
          const url = URL.createObjectURL(r.blob);
          createdUrls.push(url);
          next[r.nodeId] = {
            url,
            blob: r.blob,
            objectFit: "cover", // overridden by composeImageMap based on field config
            _revoke: true,
          };
        }

        // Atomically swap: commit the new URLs, then revoke the old ones.
        const previousUrls = liveUrlsRef.current;
        liveUrlsRef.current = new Set(createdUrls);
        setMap(next);
        for (const u of previousUrls) URL.revokeObjectURL(u);
      })
      .catch(() => {
        if (!cancelled) {
          for (const u of createdUrls) URL.revokeObjectURL(u);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [templateId, version]);

  // Final cleanup on unmount.
  useEffect(() => {
    return () => {
      for (const u of liveUrlsRef.current) URL.revokeObjectURL(u);
      liveUrlsRef.current = new Set();
    };
  }, []);

  const reloadDesignAssets = useCallback(() => {
    setVersion((v) => v + 1);
  }, []);

  return { designAssetImageByNodeId: map, reloadDesignAssets };
}
