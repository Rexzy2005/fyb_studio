import type { NormalizedDesignV1, NormalizedNode } from "@/lib/figma";

import type { RenderBackend, RenderOpts } from "./types";

/**
 * Single source of truth for node-tree traversal during rendering.
 *
 * Both the editor preview (canvas + SVG text overlay) and the PNG exporter
 * (canvas + Canvg-rendered SVG text on top) drive this walker. The Backend
 * decides how each node is painted; the walker decides:
 *   - visibility / opacity short-circuit
 *   - clipping inheritance (containers with clipsContent)
 *   - mask siblings
 *   - effect lifecycle (push/pop around the node)
 */
export async function renderTree(
  design: NormalizedDesignV1,
  backend: RenderBackend,
  opts: RenderOpts,
): Promise<void> {
  backend.drawCanvasBackground(
    design.canvas.backgrounds,
    design.canvas.background?.css,
    design.canvas.width,
    design.canvas.height,
  );

  for (const rootId of design.rootIds) {
    await walk(rootId, design, backend, opts, 1);
  }
}

async function walk(
  id: string,
  design: NormalizedDesignV1,
  backend: RenderBackend,
  opts: RenderOpts,
  inheritedAlpha: number,
): Promise<void> {
  const node = design.nodesById[id] as NormalizedNode | undefined;
  if (!node) return;
  if (!node.visible) return;
  const alpha = inheritedAlpha * Math.max(0, Math.min(1, node.opacity));
  if (alpha <= 0) return;
  // Mask nodes are not painted directly - they're consumed by mask siblings.
  if (node.isMask) return;

  backend.pushAlpha(alpha);
  if (node.blendMode && node.blendMode !== "PASS_THROUGH") {
    backend.pushBlendMode(node.blendMode);
  }

  if (node.kind === "container" && node.clipsContent) {
    backend.pushClip({ kind: "frame", node });
  }

  const hasEffects = node.effects && node.effects.length > 0;
  if (hasEffects) backend.pushEffects(node);

  if (node.kind === "text") {
    if (!opts.skipText && backend.drawText) {
      await backend.drawText(node);
    }
  } else if (node.kind === "shape") {
    await backend.drawShape(node);
  } else {
    await backend.drawContainer(node);
  }

  // Walk children - handling sibling masks: a child with isMask=true clips all subsequent siblings.
  const childIds = design.childrenById[id] ?? [];
  await walkChildren(childIds, design, backend, opts, alpha);

  if (hasEffects) backend.popEffects();
  if (node.kind === "container" && node.clipsContent) backend.popClip();
  if (node.blendMode && node.blendMode !== "PASS_THROUGH") backend.popBlendMode();
  backend.popAlpha();
}

async function walkChildren(
  childIds: string[],
  design: NormalizedDesignV1,
  backend: RenderBackend,
  opts: RenderOpts,
  alpha: number,
): Promise<void> {
  // First pass: detect mask siblings. In Figma, a child marked `isMask` clips
  // all siblings rendered after it (within the same parent), until the parent
  // ends or another mask resets it. We honour that lazily here.
  let activeMaskId: string | null = null;
  for (const cid of childIds) {
    const node = design.nodesById[cid];
    if (!node) continue;
    if (node.isMask) {
      // End any previous mask, push a new one.
      if (activeMaskId) backend.popClip();
      activeMaskId = cid;
      // For ALPHA/LUMINANCE masks the renderer uses the mask node's frame as a
      // path-based clip. (Vector masks in arbitrary paths fall back to the
      // node's bounding rect for now - a follow-up will route them through
      // applyMask.ts when full alpha-channel masking lands.)
      if (node.kind !== "text") {
        backend.pushClip({ kind: "frame", node });
      }
      continue;
    }
    await walk(cid, design, backend, opts, alpha);
  }
  if (activeMaskId) backend.popClip();
}
