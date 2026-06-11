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
  throwIfAborted(opts);
  backend.drawCanvasBackground(
    design.canvas.backgrounds,
    design.canvas.background?.css,
    design.canvas.width,
    design.canvas.height,
  );

  for (const rootId of design.rootIds) {
    throwIfAborted(opts);
    await walk(rootId, design, backend, opts, 1);
  }
}

function throwIfAborted(opts: RenderOpts): void {
  if (opts.abortSignal?.aborted) {
    throw new DOMException("Render aborted", "AbortError");
  }
}

async function walk(
  id: string,
  design: NormalizedDesignV1,
  backend: RenderBackend,
  opts: RenderOpts,
  inheritedAlpha: number,
): Promise<void> {
  throwIfAborted(opts);
  const node = design.nodesById[id] as NormalizedNode | undefined;
  if (!node) return;
  if (!node.visible) return;
  const alpha = inheritedAlpha * Math.max(0, Math.min(1, node.opacity));
  if (alpha <= 0) return;
  // Mask nodes are not painted directly - they're consumed by mask siblings.
  if (node.isMask) return;

  const pushedBlend = Boolean(node.blendMode && node.blendMode !== "PASS_THROUGH");
  const pushedClip = node.kind === "container" && node.clipsContent;
  const hasEffects = node.effects && node.effects.length > 0;

  backend.pushAlpha(alpha);
  if (pushedBlend) backend.pushBlendMode(node.blendMode);
  if (pushedClip) backend.pushClip({ kind: "frame", node });
  if (hasEffects) backend.pushEffects(node);

  try {
    if (node.kind === "text") {
      if (!opts.skipText && backend.drawText) {
        await backend.drawText(node);
      }
    } else if (node.kind === "shape") {
      await backend.drawShape(node);
    } else {
      await backend.drawContainer(node);
    }
    throwIfAborted(opts);

    // Walk children - handling sibling masks: a child with isMask=true clips all subsequent siblings.
    const childIds = design.childrenById[id] ?? [];
    await walkChildren(childIds, design, backend, opts, alpha);
  } finally {
    if (hasEffects) backend.popEffects();
    if (pushedClip) backend.popClip();
    if (pushedBlend) backend.popBlendMode();
    backend.popAlpha();
  }
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
  let activeMaskClipPushed = false;
  try {
    for (const cid of childIds) {
      throwIfAborted(opts);
      const node = design.nodesById[cid];
      if (!node) continue;
      if (node.isMask) {
        // End any previous mask, push a new one.
        if (activeMaskClipPushed) backend.popClip();
        activeMaskClipPushed = false;
        // For ALPHA/LUMINANCE masks the renderer uses the mask node's frame as a
        // path-based clip. (Vector masks in arbitrary paths fall back to the
        // node's bounding rect for now - a follow-up will route them through
        // applyMask.ts when full alpha-channel masking lands.)
        if (node.kind !== "text") {
          backend.pushClip({ kind: "frame", node });
          activeMaskClipPushed = true;
        }
        continue;
      }
      await walk(cid, design, backend, opts, alpha);
    }
  } finally {
    if (activeMaskClipPushed) backend.popClip();
  }
}
