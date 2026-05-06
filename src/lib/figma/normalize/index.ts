import { z } from "zod";

import type { NormalizedDesignV1, NormalizedFill, NormalizedNode } from "../normalized";
import { adaptFigmaDesignV1 } from "../plugin/adapter";
import { isFigmaDesignV1 } from "../plugin/schema";
import { collectBounds, getChildNodes } from "./geometry";
import { adaptLegacyTreeToFigmaExport } from "./legacy";
import { normalizeNode } from "./nodes";
import { firstSolidPaint, parseFills } from "./paints";
import { rgbaCss } from "./shared/color";
import { asNumber, asString, isRecord, type AnyRecord } from "./shared/coerce";

const FigmaExportSchema = z
  .object({
    name: z.string().optional(),
    document: z.unknown().optional(),
  })
  .passthrough();

export function normalizeFigmaExport(input: unknown): NormalizedDesignV1 {
  // FYB Extractor plugin output — detect and route through the dedicated
  // adapter. Output is the same `NormalizedDesignV1` shape with richer data
  // (real fonts, mixed text runs, embedded image bytes, full effects).
  if (isFigmaDesignV1(input)) {
    return adaptFigmaDesignV1(input).design;
  }
  const adapted = adaptLegacyTreeToFigmaExport(input);
  const parsed = FigmaExportSchema.safeParse(adapted ?? input);
  const root = parsed.success ? parsed.data : isRecord(input) ? (input as AnyRecord) : {};

  const warnings: NormalizedDesignV1["warnings"] = [];
  const imageHashes = new Set<string>();
  const fonts = new Set<string>();

  const document = isRecord(root.document) ? (root.document as AnyRecord) : undefined;
  const docChildren = document ? getChildNodes(document) : [];

  const pages = docChildren.filter(
    (n) => isRecord(n) && asString((n as AnyRecord).type) === "PAGE",
  );
  const page = pages[0] as unknown | undefined;

  if (pages.length > 1) {
    warnings.push({
      code: "multiple_pages",
      message: `Multiple pages detected (${pages.length}). The first page is used for normalization in this phase.`,
    });
  }

  const pageChildren = page ? getChildNodes(page) : docChildren;

  if (pageChildren.length === 0) {
    warnings.push({
      code: "empty_document",
      message: "No nodes found under the selected page/document.",
    });
  }

  if (adapted) {
    warnings.push({
      code: "legacy_import_adapted",
      message:
        "Detected a non-Figma JSON format and adapted it into a Figma-like shape (document/page/bounds). If something is missing (e.g. gradients), ensure your exporter includes full paint data.",
    });
  }

  // Determine global bounds and offset so the canvas starts at (0,0).
  const acc = {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };
  for (const n of pageChildren) collectBounds(n, acc);

  const offsetX = Number.isFinite(acc.minX) ? acc.minX : 0;
  const offsetY = Number.isFinite(acc.minY) ? acc.minY : 0;

  const width = Number.isFinite(acc.maxX - acc.minX) ? Math.max(0, acc.maxX - acc.minX) : 0;
  const height = Number.isFinite(acc.maxY - acc.minY) ? Math.max(0, acc.maxY - acc.minY) : 0;

  // Page background — capture all paints (any kind), and keep the first SOLID
  // as the convenience `background.css` field for the legacy renderer.
  let backgroundCss: string | undefined;
  let backgrounds: NormalizedFill[] = [];
  if (page && isRecord(page) && Array.isArray((page as AnyRecord).backgrounds)) {
    backgrounds = parseFills(
      { fills: (page as AnyRecord).backgrounds } as AnyRecord,
      warnings,
      imageHashes,
    );
    const firstSolid = backgrounds.find((f) => f.kind === "solid");
    if (firstSolid && firstSolid.kind === "solid") backgroundCss = firstSolid.css;
    // Final fallback to legacy single-paint code path if parseFills produced nothing.
    if (!backgroundCss) {
      const bgs = (page as AnyRecord).backgrounds as unknown[];
      const solid = bgs.find(
        (b) => isRecord(b) && asString((b as AnyRecord).type) === "SOLID",
      ) as AnyRecord | undefined;
      if (solid && isRecord(solid.color)) {
        backgroundCss = rgbaCss({
          r: asNumber((solid.color as AnyRecord).r, 0),
          g: asNumber((solid.color as AnyRecord).g, 0),
          b: asNumber((solid.color as AnyRecord).b, 0),
          a: asNumber(solid.opacity, 1),
        });
      }
    }
  }

  const nodesById: Record<string, NormalizedNode> = {};
  const childrenById: Record<string, string[]> = {};

  function walk(
    node: unknown,
    parentId: string | null,
    inheritedBg?: { r: number; g: number; b: number },
  ) {
    const normalized = normalizeNode(node, {
      warnings,
      imageHashes,
      fonts,
      offsetX,
      offsetY,
      inheritedBg,
    });
    if (!normalized) {
      for (const child of getChildNodes(node)) walk(child, parentId, inheritedBg);
      return;
    }

    nodesById[normalized.id] = normalized;

    if (parentId) {
      childrenById[parentId] = childrenById[parentId] ?? [];
      childrenById[parentId].push(normalized.id);
    }

    const childNodes = getChildNodes(node);
    if (childNodes.length) {
      childrenById[normalized.id] = childrenById[normalized.id] ?? [];

      let nextBg = inheritedBg;
      if (isRecord(node)) {
        const solid = firstSolidPaint(node);
        if (solid) nextBg = { r: solid.r, g: solid.g, b: solid.b };
      }

      for (const child of childNodes) walk(child, normalized.id, nextBg);
    }
  }

  const rootIds: string[] = [];
  for (const node of pageChildren) {
    const normalized = normalizeNode(node, {
      warnings,
      imageHashes,
      fonts,
      offsetX,
      offsetY,
      inheritedBg: undefined,
    });
    if (!normalized) continue;
    rootIds.push(normalized.id);
    // walk will re-normalize root; that's OK but avoid double-write by walking children only.
    nodesById[normalized.id] = normalized;

    let rootBg: { r: number; g: number; b: number } | undefined;
    if (isRecord(node)) {
      const solid = firstSolidPaint(node as AnyRecord);
      if (solid) rootBg = { r: solid.r, g: solid.g, b: solid.b };
    }

    for (const child of getChildNodes(node)) walk(child, normalized.id, rootBg);
  }

  const allNodes = Object.values(nodesById);
  const stats = {
    nodeCount: allNodes.length,
    textCount: allNodes.filter((n) => n.kind === "text").length,
    imageCount: allNodes.filter(
      (n) =>
        (n.kind === "shape" || n.kind === "container") &&
        n.fills.some((f) => f.kind === "image"),
    ).length,
    shapeCount: allNodes.filter((n) => n.kind === "shape").length,
    containerCount: allNodes.filter((n) => n.kind === "container").length,
  };

  // Raise the image-asset-missing warning once per design (instead of once per
  // image fill, which used to spam the warnings array).
  if (imageHashes.size > 0) {
    warnings.push({
      code: "image_asset_missing",
      message:
        "Design references one or more image assets by hash; raw bytes are not part of the Figma JSON. Attach images via the upload step before exporting.",
    });
  }

  return {
    version: 2,
    source: "figma",
    sourceName: typeof root.name === "string" ? root.name : undefined,
    rootIds,
    canvas: {
      width,
      height,
      background: backgroundCss ? { css: backgroundCss } : undefined,
      backgrounds: backgrounds.length ? backgrounds : undefined,
      offsetX,
      offsetY,
    },
    nodesById,
    childrenById,
    stats,
    assets: {
      imageHashes: [...imageHashes],
      fonts: [...fonts],
    },
    warnings,
  };
}
