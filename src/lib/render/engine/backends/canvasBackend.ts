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
import { applyBackgroundBlur } from "@/lib/render/features/effects/backgroundBlur";
import { applyNoiseOverlay } from "@/lib/render/features/effects/noise";
import { applyTextureOverlay } from "@/lib/render/features/effects/texture";
import { applyGlassOverlay } from "@/lib/render/features/effects/glass";
import { applyProgressiveLayerBlur } from "@/lib/render/features/effects/progressiveBlur";
import { applyImageFill } from "@/lib/render/features/paints/imageFill";
import { paintGradientFill } from "@/lib/render/features/canvasGradient";
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
 * Canvas backend - paints shapes, containers and image fills onto the
 * supplied 2D context. Text is intentionally not painted here; the SVG layer
 * handles that so editor preview and PNG export share the same text engine.
 */
export class CanvasBackend implements RenderBackend {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly opts: RenderOpts;
  private readonly colorOverride: Record<string, string>;
  private readonly resolvePreviewImage: CanvasBackendDeps["resolvePreviewImage"];

  // Stack-of-stacks - each push wraps in a save() so pop is just restore().
  private readonly alphaStack: number[] = [];
  private readonly blendStack: GlobalCompositeOperation[] = [];

  constructor(deps: CanvasBackendDeps) {
    this.ctx = deps.ctx;
    this.opts = deps.opts;
    this.colorOverride = deps.colorOverrideByNodeId;
    this.resolvePreviewImage = deps.resolvePreviewImage;
    // High-quality image scaling: matters for design-fidelity rendering of
    // user-uploaded photos and the plugin's embedded base64 images. Without
    // this, browsers may use the lower-quality default which produces
    // softer/jaggier results on downscale.
    this.ctx.imageSmoothingEnabled = true;
    (this.ctx as unknown as { imageSmoothingQuality?: ImageSmoothingQuality }).imageSmoothingQuality = "high";
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
      const bgFrame = { x: 0, y: 0, width: designWidth, height: designHeight };
      const bgPath = new Path2D();
      bgPath.rect(0, 0, designWidth, designHeight);
      for (const fill of backgrounds) {
        if (!fill.visible) continue;
        if (fill.kind === "solid") {
          ctx.fillStyle = fill.css;
          ctx.fillRect(0, 0, designWidth, designHeight);
        } else if (fill.kind === "gradient") {
          const ok = paintGradientFill(ctx, bgPath, fill, bgFrame);
          if (!ok) {
            ctx.fillStyle = fill.cssFallback;
            ctx.fillRect(0, 0, designWidth, designHeight);
          }
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

    // For SHAPE nodes, geometry preference is:
    //   1. fillGeometry - Figma's resolved silhouette. Already accounts for
    //      corner radius, boolean ops, vertex-level corner smoothing, etc.
    //      A "Rectangle 1" VECTOR with 10px rounded corners has square
    //      vectorPaths but a rounded fillGeometry - so fillGeometry wins.
    //   2. vectorPaths - the editable source path. Used only when fillGeometry
    //      is absent (some legacy exporters skip it).
    //   3. boundsPathAt - a corner-radius-aware rectangle covering the bbox.
    //
    // strokeGeometry is the closed path Figma renders FOR the stroke. For
    // zero-area shapes (LINE) it's the only thing visible - see strokeFillPath
    // below.
    const fillGeomPaths =
      node.kind === "shape" && node.fillGeometry?.length
        ? node.fillGeometry.map((g) => g.data)
        : null;

    const shapePath = (): Path2D => {
      const tryBuild = (paths: string[]): Path2D | null => {
        try {
          const p = buildCompoundVectorPath(paths);
          if (!p) return null;
          // Local-vs-absolute check kept as a sanity guard - both paths get
          // returned the same way today, but the heuristic stays here so a
          // future transform-baking branch can hook in without re-walking.
          void paths.every((path) =>
            isLikelyLocalSvgPath(path, { x: 0, y: 0, width: localW, height: localH }),
          );
          return p;
        } catch {
          return null;
        }
      };

      if (fillGeomPaths) {
        const p = tryBuild(fillGeomPaths);
        if (p) return p;
      }
      if (node.kind === "shape" && node.vectorPaths?.length) {
        const p = tryBuild(node.vectorPaths);
        if (p) return p;
      }
      return boundsPathAt(0, 0, localW, localH);
    };

    const fillPath = shapePath();

    // strokeGeometry is Figma's closed silhouette of the stroke itself -
    // useful when the bbox is degenerate (LINE has height=0, so stroking
    // around the bbox path produces nothing). When present, paint it as a
    // FILL of the stroke's color rather than stroking around fillPath.
    const strokeFillPath: Path2D | null =
      node.kind === "shape" && node.strokeGeometry?.length
        ? buildCompoundVectorPath(node.strokeGeometry.map((g) => g.data))
        : null;

    const dropShadows = (node.effects ?? []).filter(
      (e): e is Extract<NormalizedNode["effects"][number], { kind: "drop-shadow" }> =>
        e.kind === "drop-shadow" && e.visible,
    );
    const innerShadows = (node.effects ?? []).filter(
      (e): e is Extract<NormalizedNode["effects"][number], { kind: "inner-shadow" }> =>
        e.kind === "inner-shadow" && e.visible,
    );
    // Layer blur: blurs the node's own content. Two flavours:
    //   - NORMAL: ctx.filter before fills so every draw appears blurred.
    //   - PROGRESSIVE: capture rendered result, then ramp blur across the
    //     node - handled separately after fills/strokes paint.
    const layerBlurNormal = (node.effects ?? []).reduce(
      (max, e) =>
        e.kind === "layer-blur" && e.visible && !e.progressive && e.radius > max
          ? e.radius
          : max,
      0,
    );
    const layerBlurRadius = layerBlurNormal;
    const progressiveLayerBlur = (node.effects ?? []).find(
      (e): e is Extract<NormalizedNode["effects"][number], { kind: "layer-blur" }> =>
        e.kind === "layer-blur" && e.visible && Boolean(e.progressive),
    );
    // Background blur: blurs canvas content that lies behind this node, then
    // paints it back clipped to the node shape. Must run before fills.
    const bgBlurEffect = (node.effects ?? []).find(
      (e): e is Extract<NormalizedNode["effects"][number], { kind: "background-blur" }> =>
        e.kind === "background-blur" && e.visible,
    );

    const overrideColor = this.colorOverride[node.id];
    const fillFrame = canUseMatrix
      ? { x: 0, y: 0, width: localW, height: localH }
      : { x: node.frame.x, y: node.frame.y, width: node.frame.width, height: node.frame.height };

    // Paint drop shadows behind the actual fills (not affected by layer blur).
    for (const eff of dropShadows) {
      applyDropShadow(ctx, fillPath, eff);
    }

    // Background blur: capture and blur what's already on canvas under the node.
    if (bgBlurEffect && bgBlurEffect.radius > 0) {
      applyBackgroundBlur(ctx, fillPath, fillFrame, bgBlurEffect.radius);
    }

    // Glass effect: samples the backdrop, refracts + light-sweeps. Must run
    // BEFORE fills (it composites the refracted backdrop where the node sits).
    const glassEffect = (node.effects ?? []).find(
      (e): e is Extract<NormalizedNode["effects"][number], { kind: "glass" }> =>
        e.kind === "glass" && e.visible,
    );
    if (glassEffect) {
      applyGlassOverlay(ctx, fillPath, fillFrame, glassEffect);
    }

    // Layer blur: set filter before fills so all subsequent draws appear blurred.
    if (layerBlurRadius > 0) {
      const pxScale = Math.abs(ctx.getTransform().a) || 1;
      ctx.filter = `blur(${layerBlurRadius * pxScale}px)`;
    }

    // Fills
    if (overrideColor) {
      ctx.fillStyle = overrideColor;
      this.fillWithPath(ctx, node, fillPath, baseTransform, nodeSpaceTransform, canUseMatrix, localW, localH);
    } else {
      for (const fill of node.fills) {
        if (!fill.visible) continue;
        ctx.save();
        // Apply per-fill blend mode (composites this fill against fills below it).
        const fillBlendOp = BLEND_MODE_TO_CANVAS[fill.blendMode] ?? "source-over";
        if (fillBlendOp !== "source-over") {
          ctx.globalCompositeOperation = fillBlendOp;
        }
        if (fill.kind === "solid") {
          ctx.fillStyle = fill.css;
          this.fillWithPath(ctx, node, fillPath, baseTransform, nodeSpaceTransform, canUseMatrix, localW, localH);
        } else if (fill.kind === "gradient") {
          // paintGradientFill handles all 4 gradient types and paints into
          // the path itself (native CanvasGradient for linear/radial,
          // pixel-exact offscreen blit for angular/diamond). On failure
          // (e.g. cross-origin tainted offscreen) it returns false and we
          // fall back to the gradient's cssFallback solid colour.
          const ok = paintGradientFill(ctx, fillPath, fill, fillFrame);
          if (!ok) {
            ctx.fillStyle = fill.cssFallback;
            this.fillWithPath(ctx, node, fillPath, baseTransform, nodeSpaceTransform, canUseMatrix, localW, localH);
          }
        } else if (fill.kind === "image") {
          // Image fill opacity is not baked into the bitmap (unlike solid/gradient
          // fills where opacity is baked into the CSS alpha). Apply it explicitly.
          if (fill.opacity < 1) ctx.globalAlpha *= fill.opacity;
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
          } else {
            // No override yet - show a placeholder clipped to the same shape.
            drawImagePlaceholder(
              ctx,
              0,
              0,
              canUseMatrix ? localW : node.frame.width,
              canUseMatrix ? localH : node.frame.height,
              { label: "IMAGE" },
            );
          }
          void drawImageCoverContain;
        }
        ctx.restore();
      }
    }

    // Strokes. Two paths exist:
    //   - strokeFillPath: Figma already resolved the stroke into a closed
    //     silhouette (e.g. LINE nodes, or any node whose stroke alignment
    //     and dash pattern Figma serialised pre-baked). Paint it as a fill
    //     of the stroke colour - pixel-exact with no canvas-side miter/cap
    //     differences. Gradient strokes are rendered via paintGradientFill.
    //   - else: stroke around fillPath using canvas line-rendering with
    //     INSIDE/CENTER/OUTSIDE alignment.
    for (const stroke of node.strokes) {
      // Per-side weights override the flat `weight` field - render each
      // side as its own segment so asymmetric borders look right.
      const hasPerSide =
        stroke.individualWeights &&
        // Skip the work when all sides equal the flat weight already.
        !(stroke.individualWeights.top === stroke.weight &&
          stroke.individualWeights.right === stroke.weight &&
          stroke.individualWeights.bottom === stroke.weight &&
          stroke.individualWeights.left === stroke.weight);

      if (hasPerSide && !strokeFillPath) {
        this.strokePerSide(ctx, stroke, fillFrame, canUseMatrix, localW, localH);
        continue;
      }

      if (stroke.weight <= 0 && !hasPerSide) continue;
      if (!stroke.paint.visible) continue;
      if (strokeFillPath) {
        ctx.save();
        if (stroke.paint.kind === "gradient") {
          const ok = paintGradientFill(ctx, strokeFillPath, stroke.paint, fillFrame);
          if (!ok) {
            ctx.fillStyle = stroke.css;
            ctx.fill(strokeFillPath);
          }
        } else {
          ctx.fillStyle = stroke.css;
          ctx.fill(strokeFillPath);
        }
        ctx.restore();
      } else {
        this.strokeWithAlignment(ctx, node, stroke, fillPath, canUseMatrix, localW, localH);
      }
    }

    // Inner shadows are painted on top of fills (clipped to the shape).
    for (const eff of innerShadows) {
      applyInnerShadow(ctx, fillPath, eff);
    }

    // Progressive layer blur - captures the rendered fills+strokes+inner
    // shadows for this node and re-paints them with a ramped blur radius.
    if (progressiveLayerBlur && progressiveLayerBlur.progressive) {
      applyProgressiveLayerBlur(ctx, fillPath, fillFrame, {
        startRadius: progressiveLayerBlur.progressive.startRadius,
        endRadius: progressiveLayerBlur.radius,
        startOffset: progressiveLayerBlur.progressive.startOffset,
        endOffset: progressiveLayerBlur.progressive.endOffset,
      });
    }

    // Noise overlays - painted on top of fills + inner shadows, clipped
    // to the node silhouette. Multiple noise effects compose (each with
    // its own blendMode).
    const noiseEffects = (node.effects ?? []).filter(
      (e): e is Extract<NormalizedNode["effects"][number], { kind: "noise" }> =>
        e.kind === "noise" && e.visible,
    );
    if (noiseEffects.length > 0) {
      for (const eff of noiseEffects) {
        applyNoiseOverlay(ctx, fillPath, fillFrame, eff);
      }
    }

    // Texture overlays - embossed grain via overlay-blend value noise.
    const textureEffects = (node.effects ?? []).filter(
      (e): e is Extract<NormalizedNode["effects"][number], { kind: "texture" }> =>
        e.kind === "texture" && e.visible,
    );
    if (textureEffects.length > 0) {
      for (const eff of textureEffects) {
        applyTextureOverlay(ctx, fillPath, fillFrame, eff);
      }
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

  /**
   * Paint each side of an asymmetric border (Figma's "individual stroke
   * weights") independently. Each side is rendered as a thin rectangle
   * placed against the corresponding edge of the node frame so designers
   * who use 0px top + 4px bottom (etc.) get the exact silhouette Figma
   * does. Works for axis-aligned rectangles; for vectors the side-stroke
   * concept doesn't apply and the caller falls back to flat-weight mode.
   */
  private strokePerSide(
    ctx: CanvasRenderingContext2D,
    stroke: NormalizedStroke,
    fillFrame: { x: number; y: number; width: number; height: number },
    canUseMatrix: boolean,
    localW: number,
    localH: number,
  ): void {
    const w = stroke.individualWeights;
    if (!w) return;

    // When the node is being rendered in its local matrix the frame origin
    // is at (0,0); otherwise we paint at the absolute frame origin.
    const fx = canUseMatrix ? 0 : fillFrame.x;
    const fy = canUseMatrix ? 0 : fillFrame.y;
    const fw = canUseMatrix ? localW : fillFrame.width;
    const fh = canUseMatrix ? localH : fillFrame.height;

    ctx.save();
    ctx.fillStyle = stroke.css;
    if (stroke.align === "INSIDE") {
      // Strips sit fully inside the frame.
      if (w.top > 0) ctx.fillRect(fx, fy, fw, w.top);
      if (w.bottom > 0) ctx.fillRect(fx, fy + fh - w.bottom, fw, w.bottom);
      if (w.left > 0) ctx.fillRect(fx, fy, w.left, fh);
      if (w.right > 0) ctx.fillRect(fx + fw - w.right, fy, w.right, fh);
    } else if (stroke.align === "OUTSIDE") {
      // Strips sit fully outside the frame.
      if (w.top > 0) ctx.fillRect(fx - w.left, fy - w.top, fw + w.left + w.right, w.top);
      if (w.bottom > 0) ctx.fillRect(fx - w.left, fy + fh, fw + w.left + w.right, w.bottom);
      if (w.left > 0) ctx.fillRect(fx - w.left, fy, w.left, fh);
      if (w.right > 0) ctx.fillRect(fx + fw, fy, w.right, fh);
    } else {
      // CENTER: each strip straddles its edge by half the weight on each side.
      if (w.top > 0) ctx.fillRect(fx, fy - w.top / 2, fw, w.top);
      if (w.bottom > 0) ctx.fillRect(fx, fy + fh - w.bottom / 2, fw, w.bottom);
      if (w.left > 0) ctx.fillRect(fx - w.left / 2, fy, w.left, fh);
      if (w.right > 0) ctx.fillRect(fx + fw - w.right / 2, fy, w.right, fh);
    }
    ctx.restore();
  }
}
