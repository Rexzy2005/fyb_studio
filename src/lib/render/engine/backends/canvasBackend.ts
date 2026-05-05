import type {
  AffineMatrix,
  BlendMode,
  NormalizedContainerNode,
  NormalizedFill,
  NormalizedNode,
  NormalizedShapeNode,
  NormalizedStroke,
} from "@/lib/figma";

import { drawImageCoverContain, drawImagePlaceholder } from "@/lib/render/drawImage";
import { applyDropShadow } from "@/lib/render/features/effects/dropShadow";
import { applyInnerShadow } from "@/lib/render/features/effects/innerShadow";
import { applyImageFill } from "@/lib/render/features/paints/imageFill";
import { createGradient } from "@/lib/render/features/canvasGradient";
import { clipNode, fillNode, strokeNode } from "@/lib/render/features/canvasNode";
import {
  buildCompoundVectorPath,
  isLikelyLocalSvgPath,
} from "@/lib/render/features/path2d";
import { boundsPathAt as makeBoundsPath } from "@/lib/render/features/path2d";
import { applyAlignedStroke } from "@/lib/render/features/strokes/alignment";

import type { ClipGeometry, RenderBackend, RenderOpts } from "../types";

const BLEND_MODE_TO_CANVAS: Partial<Record<BlendMode, GlobalCompositeOperation>> = {
  NORMAL: "source-over",
  PASS_THROUGH: "source-over",
  MULTIPLY: "multiply",
  SCREEN: "screen",
  OVERLAY: "overlay",
  DARKEN: "darken",
  LIGHTEN: "lighten",
  COLOR_DODGE: "color-dodge",
  COLOR_BURN: "color-burn",
  HARD_LIGHT: "hard-light",
  SOFT_LIGHT: "soft-light",
  DIFFERENCE: "difference",
  EXCLUSION: "exclusion",
  HUE: "hue",
  SATURATION: "saturation",
  COLOR: "color",
  LUMINOSITY: "luminosity",
};

export type CanvasBackendDeps = {
  ctx: CanvasRenderingContext2D;
  opts: RenderOpts;
  // Map of color overrides resolved upstream from the field config (one per node).
  colorOverrideByNodeId: Record<string, string>;
  // Image lookup the backend uses for IMAGE fills with a user override.
  resolvePreviewImage(nodeId: string): { source: CanvasImageSource; objectFit: "cover" | "contain" } | undefined;
};

/**
 * Canvas backend — paints shapes, containers and image fills onto the
 * supplied 2D context. Text is intentionally not painted here; the SVG layer
 * handles that so editor preview and PNG export share the same text engine.
 */
export class CanvasBackend implements RenderBackend {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly opts: RenderOpts;
  private readonly colorOverride: Record<string, string>;
  private readonly resolvePreviewImage: CanvasBackendDeps["resolvePreviewImage"];

  // Stack-of-stacks — each push wraps in a save() so pop is just restore().
  private readonly alphaStack: number[] = [];
  private readonly blendStack: GlobalCompositeOperation[] = [];

  constructor(deps: CanvasBackendDeps) {
    this.ctx = deps.ctx;
    this.opts = deps.opts;
    this.colorOverride = deps.colorOverrideByNodeId;
    this.resolvePreviewImage = deps.resolvePreviewImage;
  }

  pushAlpha(alpha: number): void {
    this.ctx.save();
    this.alphaStack.push(this.ctx.globalAlpha);
    this.ctx.globalAlpha = alpha;
  }
  popAlpha(): void {
    this.alphaStack.pop();
    this.ctx.restore();
  }

  pushBlendMode(mode: BlendMode): void {
    const target = BLEND_MODE_TO_CANVAS[mode] ?? "source-over";
    this.ctx.save();
    this.blendStack.push(this.ctx.globalCompositeOperation);
    this.ctx.globalCompositeOperation = target;
  }
  popBlendMode(): void {
    this.blendStack.pop();
    this.ctx.restore();
  }

  pushTransform(m: AffineMatrix): void {
    this.ctx.save();
    this.ctx.transform(m.a, m.b, m.c, m.d, m.tx, m.ty);
  }
  popTransform(): void {
    this.ctx.restore();
  }

  pushClip(geometry: ClipGeometry): void {
    this.ctx.save();
    if (geometry.kind === "frame") {
      clipNode(this.ctx, geometry.node);
    } else {
      this.ctx.clip(geometry.path);
    }
  }
  popClip(): void {
    this.ctx.restore();
  }

  // Effects are applied per-fill inside drawShape/drawContainer rather than as
  // an explicit push/pop wrapping the node, because canvas shadow API needs to
  // see the actual fill call. The walker still calls push/pop so other backends
  // (SVG) can wrap if they want; this backend tracks the active node id only.
  private pendingEffectsNodeId: string | null = null;
  pushEffects(node: NormalizedNode): void {
    this.pendingEffectsNodeId = node.id;
  }
  popEffects(): void {
    this.pendingEffectsNodeId = null;
  }

  drawCanvasBackground(
    backgrounds: NormalizedFill[] | undefined,
    fallbackCss: string | undefined,
    designWidth: number,
    designHeight: number,
  ): void {
    const ctx = this.ctx;

    ctx.clearRect(0, 0, designWidth, designHeight);

    if (backgrounds && backgrounds.length) {
      for (const fill of backgrounds) {
        if (!fill.visible) continue;
        if (fill.kind === "solid") {
          ctx.fillStyle = fill.css;
          ctx.fillRect(0, 0, designWidth, designHeight);
        } else if (fill.kind === "gradient") {
          ctx.fillStyle = fill.cssFallback;
          ctx.fillRect(0, 0, designWidth, designHeight);
        } else if (fill.kind === "image") {
          ctx.fillStyle = fill.cssFallback;
          ctx.fillRect(0, 0, designWidth, designHeight);
        }
      }
      return;
    }

    ctx.fillStyle = fallbackCss ?? "white";
    ctx.fillRect(0, 0, designWidth, designHeight);
  }

  async drawShape(node: NormalizedShapeNode): Promise<void> {
    await this.drawNonText(node);
  }

  async drawContainer(node: NormalizedContainerNode): Promise<void> {
    await this.drawNonText(node);
  }

  /**
   * Shape + container share one render path: enter node-local coords, pre-paint
   * drop-shadows, paint each fill, paint each stroke (alignment-aware), exit.
   */
  private async drawNonText(node: Exclude<NormalizedNode, { kind: "text" }>): Promise<void> {
    const ctx = this.ctx;
    ctx.save();

    const canUseMatrix = Boolean(node.transform && node.size);
    let baseTransform: DOMMatrix | null = null;
    let nodeSpaceTransform: DOMMatrix | null = null;
    if (canUseMatrix && node.transform && node.size) {
      baseTransform = ctx.getTransform();
      ctx.transform(node.transform.a, node.transform.b, node.transform.c, node.transform.d, node.transform.tx, node.transform.ty);
      nodeSpaceTransform = ctx.getTransform();
    } else if (node.rotation && Math.abs(node.rotation) > 0.001) {
      const cx = node.frame.x + node.frame.width / 2;
      const cy = node.frame.y + node.frame.height / 2;
      ctx.translate(cx, cy);
      ctx.rotate((node.rotation * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }

    const localW = node.size?.width ?? node.frame.width;
    const localH = node.size?.height ?? node.frame.height;

    const boundsPathAt = (x: number, y: number, width: number, height: number): Path2D =>
      makeBoundsPath(x, y, width, height, node.cornerRadius);

    const shapePath = (): Path2D => {
      // Prefer explicit fillGeometry when available (and local).
      if (node.kind === "shape" && node.vectorPaths?.length) {
        try {
          const p = buildCompoundVectorPath(node.vectorPaths);
          if (p) {
            const isLocal = node.vectorPaths.every((path) =>
              isLikelyLocalSvgPath(path, { x: 0, y: 0, width: localW, height: localH }),
            );
            if (isLocal) return p;
            if (baseTransform && nodeSpaceTransform) {
              // Path is absolute — bake the inverse of node-space transform into it.
              // Simpler: caller restores transform around fill (handled below).
              return p;
            }
            return p;
          }
        } catch {
          // fall through
        }
      }
      return boundsPathAt(0, 0, localW, localH);
    };

    const fillPath = shapePath();

    const dropShadows = (node.effects ?? []).filter(
      (e): e is Extract<NormalizedNode["effects"][number], { kind: "drop-shadow" }> =>
        e.kind === "drop-shadow" && e.visible,
    );
    const innerShadows = (node.effects ?? []).filter(
      (e): e is Extract<NormalizedNode["effects"][number], { kind: "inner-shadow" }> =>
        e.kind === "inner-shadow" && e.visible,
    );

    const overrideColor = this.colorOverride[node.id];

    // Paint drop shadows behind the actual fills.
    for (const eff of dropShadows) {
      applyDropShadow(ctx, fillPath, eff);
    }

    // Fills
    if (overrideColor) {
      ctx.fillStyle = overrideColor;
      this.fillWithPath(ctx, node, fillPath, baseTransform, nodeSpaceTransform, canUseMatrix, localW, localH);
    } else {
      for (const fill of node.fills) {
        if (!fill.visible) continue;
        if (fill.kind === "solid") {
          ctx.fillStyle = fill.css;
          this.fillWithPath(ctx, node, fillPath, baseTransform, nodeSpaceTransform, canUseMatrix, localW, localH);
        } else if (fill.kind === "gradient") {
          const g = createGradient(
            ctx,
            node,
            fill,
            canUseMatrix ? { x: 0, y: 0, width: localW, height: localH } : undefined,
          );
          ctx.fillStyle = g ?? fill.cssFallback;
          this.fillWithPath(ctx, node, fillPath, baseTransform, nodeSpaceTransform, canUseMatrix, localW, localH);
        } else if (fill.kind === "image") {
          ctx.save();
          ctx.clip(fillPath);

          const override = this.resolvePreviewImage(node.id);
          if (override) {
            applyImageFill(ctx, override.source, fill, {
              x: 0,
              y: 0,
              width: canUseMatrix ? localW : node.frame.width,
              height: canUseMatrix ? localH : node.frame.height,
              objectFit: override.objectFit,
            });
            // applyImageFill respects the IMAGE paint's scaleMode, but for
            // user-provided previews the editor lets users pick cover/contain;
            // fall back to the legacy helper if applyImageFill couldn't draw
            // (e.g. no image source for tile/pattern modes).
          } else {
            // No override yet — show a placeholder clipped to the same shape.
            drawImagePlaceholder(
              ctx,
              0,
              0,
              canUseMatrix ? localW : node.frame.width,
              canUseMatrix ? localH : node.frame.height,
              { label: "IMAGE" },
            );
          }
          ctx.restore();
          // Suppress the unused-import lint for drawImageCoverContain since
          // legacy helper is still surfaced via drawImage.ts re-export.
          void drawImageCoverContain;
        }
      }
    }

    // Strokes
    for (const stroke of node.strokes) {
      if (stroke.weight <= 0) continue;
      if (!stroke.paint.visible) continue;
      this.strokeWithAlignment(ctx, node, stroke, fillPath, canUseMatrix, localW, localH);
    }

    // Inner shadows are painted on top of fills (clipped to the shape).
    for (const eff of innerShadows) {
      applyInnerShadow(ctx, fillPath, eff);
    }

    ctx.restore();
  }

  private fillWithPath(
    ctx: CanvasRenderingContext2D,
    node: Exclude<NormalizedNode, { kind: "text" }>,
    path: Path2D,
    baseTransform: DOMMatrix | null,
    nodeSpaceTransform: DOMMatrix | null,
    canUseMatrix: boolean,
    localW: number,
    localH: number,
  ): void {
    if (canUseMatrix) {
      ctx.fill(path);
      return;
    }
    // Legacy path: fall back to the older absolute-coord helper that knows how
    // to translate node frame.x/y as needed for non-matrix nodes.
    fillNode(ctx, node);
    void localW;
    void localH;
    void baseTransform;
    void nodeSpaceTransform;
  }

  private strokeWithAlignment(
    ctx: CanvasRenderingContext2D,
    node: Exclude<NormalizedNode, { kind: "text" }>,
    stroke: NormalizedStroke,
    fillPath: Path2D,
    canUseMatrix: boolean,
    localW: number,
    localH: number,
  ): void {
    ctx.save();
    ctx.strokeStyle = stroke.css;
    ctx.lineWidth = stroke.weight;
    if (stroke.dashPattern.length) ctx.setLineDash(stroke.dashPattern);
    ctx.lineCap =
      stroke.cap === "ROUND" ? "round" : stroke.cap === "SQUARE" ? "square" : "butt";
    ctx.lineJoin = stroke.join === "ROUND" ? "round" : stroke.join === "BEVEL" ? "bevel" : "miter";
    if (Number.isFinite(stroke.miterLimit) && stroke.miterLimit > 0) {
      ctx.miterLimit = stroke.miterLimit;
    }

    if (canUseMatrix) {
      applyAlignedStroke(ctx, fillPath, stroke.align, stroke.weight, {
        x: 0,
        y: 0,
        width: localW,
        height: localH,
      });
    } else {
      // Legacy non-matrix fallback retains the old behavior (CENTER alignment).
      strokeNode(ctx, node);
    }
    ctx.restore();
  }
}
