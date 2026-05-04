import type { NormalizedNode } from "@/lib/figma";
import {
  areLikelyLocalSvgPaths,
  boundsPath,
  buildCompoundVectorPath,
  clampRadius,
} from "./path2d";

type NonTextNode = Exclude<NormalizedNode, { kind: "text" }>;

/**
 * Fill the node's geometry with the current ctx.fillStyle.
 * Prefers vector path geometry when available; falls back to the rounded-rect frame.
 */
export function fillNode(ctx: CanvasRenderingContext2D, node: NonTextNode): void {
  if (node.kind === "shape" && node.vectorPaths?.length) {
    try {
      const p = buildCompoundVectorPath(node.vectorPaths);
      if (!p) throw new Error("No valid vector paths");
      const local = areLikelyLocalSvgPaths(node.vectorPaths, node.frame);
      if (local) {
        ctx.save();
        ctx.translate(node.frame.x, node.frame.y);
        ctx.fill(p);
        ctx.restore();
      } else {
        ctx.fill(p);
      }
      return;
    } catch {
      // fall back
    }
  }
  ctx.fill(boundsPath(node));
}

/**
 * Stroke the node's geometry with the current ctx.strokeStyle/lineWidth.
 */
export function strokeNode(ctx: CanvasRenderingContext2D, node: NonTextNode): void {
  if (node.kind === "shape" && node.vectorPaths?.length) {
    try {
      const p = buildCompoundVectorPath(node.vectorPaths);
      if (!p) throw new Error("No valid vector paths");
      const local = areLikelyLocalSvgPaths(node.vectorPaths, node.frame);
      if (local) {
        ctx.save();
        ctx.translate(node.frame.x, node.frame.y);
        ctx.stroke(p);
        ctx.restore();
      } else {
        ctx.stroke(p);
      }
      return;
    } catch {
      // fall back
    }
  }
  ctx.stroke(boundsPath(node));
}

/**
 * Clip the current ctx to the node's geometry.
 *
 * Honors the node's per-corner radii via its `transform` + `size` matrix when
 * available, so a rotated container clips correctly. Falls back to the
 * axis-aligned frame.
 */
export function clipNode(ctx: CanvasRenderingContext2D, node: NonTextNode): void {
  if (node.transform && node.size) {
    const prev = ctx.getTransform();
    ctx.transform(
      node.transform.a,
      node.transform.b,
      node.transform.c,
      node.transform.d,
      node.transform.tx,
      node.transform.ty,
    );
    const p = new Path2D();
    const r = node.cornerRadius;
    if (r && (r.tl || r.tr || r.br || r.bl)) {
      const tl = clampRadius(r.tl, node.size.width, node.size.height);
      const tr = clampRadius(r.tr, node.size.width, node.size.height);
      const br = clampRadius(r.br, node.size.width, node.size.height);
      const bl = clampRadius(r.bl, node.size.width, node.size.height);

      p.moveTo(0 + tl, 0);
      p.lineTo(node.size.width - tr, 0);
      p.quadraticCurveTo(node.size.width, 0, node.size.width, 0 + tr);
      p.lineTo(node.size.width, node.size.height - br);
      p.quadraticCurveTo(
        node.size.width,
        node.size.height,
        node.size.width - br,
        node.size.height,
      );
      p.lineTo(0 + bl, node.size.height);
      p.quadraticCurveTo(0, node.size.height, 0, node.size.height - bl);
      p.lineTo(0, 0 + tl);
      p.quadraticCurveTo(0, 0, 0 + tl, 0);
      p.closePath();
    } else {
      p.rect(0, 0, node.size.width, node.size.height);
    }

    ctx.clip(p);
    ctx.setTransform(prev);
    return;
  }

  ctx.clip(boundsPath(node));
}
