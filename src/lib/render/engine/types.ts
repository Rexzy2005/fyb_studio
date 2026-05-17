import type {
  AffineMatrix,
  BlendMode,
  NormalizedContainerNode,
  NormalizedFill,
  NormalizedNode,
  NormalizedShapeNode,
  NormalizedTextNode,
} from "@/lib/figma";

export type RenderOpts = {
  previewTextByNodeId?: Record<string, string>;
  previewImageByNodeId?: Record<
    string,
    { source: CanvasImageSource; objectFit: "cover" | "contain" }
  >;
  previewColorByNodeId?: Record<string, string>;
  // When true, the canvas backend does not paint TEXT nodes - text is composited
  // separately via the SVG layer (see SvgTextLayerBuilder).
  skipText: boolean;
};

export interface RenderBackend {
  pushAlpha(alpha: number): void;
  popAlpha(): void;
  pushBlendMode(mode: BlendMode): void;
  popBlendMode(): void;
  pushTransform(m: AffineMatrix): void;
  popTransform(): void;
  pushClip(geometry: ClipGeometry): void;
  popClip(): void;
  /** Begin an offscreen pass for effects on the next drawShape/Container call. */
  pushEffects(node: NormalizedNode): void;
  popEffects(): void;
  /** Draw a non-text node's fills + strokes at its current location. */
  drawShape(node: NormalizedShapeNode): Promise<void>;
  drawContainer(node: NormalizedContainerNode): Promise<void>;
  /** Optional - backends that don't render text (canvas backend in SVG-text mode) leave this empty. */
  drawText?(node: NormalizedTextNode): Promise<void>;
  /**
   * Paint canvas-level backgrounds (page backgrounds before any node renders).
   * The design's canvas dimensions are passed explicitly - never back-computed
   * from the active transform - so fractional design sizes don't drift.
   */
  drawCanvasBackground(
    backgrounds: NormalizedFill[] | undefined,
    fallbackCss: string | undefined,
    designWidth: number,
    designHeight: number,
  ): void;
}

export type ClipGeometry =
  | { kind: "frame"; node: Exclude<NormalizedNode, { kind: "text" }> }
  | { kind: "path"; path: Path2D };
