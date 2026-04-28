"use client";

import { useEffect, useState } from "react";

import { createLocalTemplateRepository } from "@/lib/storage/templateRepo";

export function usePreviewUrl(previewId?: string) {
  const [url, setUrl] = useState<string | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    (async () => {
      try {
        setError(null);
        setUrl(null);
        setSize(null);
        if (!previewId) return;

        const repo = createLocalTemplateRepository();
        const preview = await repo.getPreview(previewId);
        if (!preview) return;

        objectUrl = URL.createObjectURL(preview.blob);
        if (!cancelled) {
          setUrl(objectUrl);
          setSize({ width: preview.width, height: preview.height });
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load preview");
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [previewId]);

  return { url, width: size?.width ?? null, height: size?.height ?? null, error };
}
