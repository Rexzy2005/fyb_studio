import type { NormalizedDesignV1 } from "@/lib/figma";

/**
 * Compute a flat array of node ids in render order (depth-first, root → leaf,
 * children rendered after parents = "on top of"). Used both by the renderer
 * and by hit-testing so they never disagree.
 */
export function computeRenderOrder(design: NormalizedDesignV1): string[] {
  const out: string[] = [];
  function visit(id: string) {
    out.push(id);
    const children = design.childrenById[id] ?? [];
    for (const c of children) visit(c);
  }
  for (const r of design.rootIds) visit(r);
  return out;
}
