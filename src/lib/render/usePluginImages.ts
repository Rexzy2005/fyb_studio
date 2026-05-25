"use client";

import { useMemo } from "react";

import type { NormalizedDesignV1 } from "@/lib/figma/normalized";
import type { PluginImageMap } from "@/lib/figma/plugin/adapter";

export type PluginImageEntry = {
  url: string;
  objectFit: "cover" | "contain";
  preservePaintScaleMode: true;
};

/**
 * Resolve the FYB Extractor plugin's embedded image bytes into a per-node
 * image map. The renderer uses this as a fallback layer behind user uploads
 * and admin design-assets, so the design renders pixel-perfect with its
 * original images out-of-the-box.
 *
 * Data URLs and Cloudinary URLs are used directly. Export paths fetch the URL
 * into a Blob only when they need one.
 */
export function usePluginImages(design: NormalizedDesignV1 | null | undefined): Record<string, PluginImageEntry> {
  return useMemo(() => {
    if (!design) return {};
    const pluginImages = (design as unknown as { __pluginImages?: PluginImageMap }).__pluginImages;
    if (!pluginImages) return {};
    const out: Record<string, PluginImageEntry> = {};
    for (const [nodeId, hash] of Object.entries(pluginImages.byNodeId)) {
      const url = pluginImages.byHash[hash]?.dataUrl;
      if (!url) continue;
      out[nodeId] = {
        url,
        objectFit: "cover",
        preservePaintScaleMode: true,
      };
    }
    return out;
  }, [design]);
}
