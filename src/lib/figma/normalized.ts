export type NormalizedDesignV1 = {
  version: 1;
  source: "figma";
  sourceName?: string;
  rootIds: string[];
  canvas: {
    width: number;
    height: number;
    background?: { css: string };
    offsetX: number;
    offsetY: number;
  };
  nodesById: Record<string, NormalizedNode>;
  childrenById: Record<string, string[]>;
  stats: {
    nodeCount: number;
    textCount: number;
    imageCount: number;
    shapeCount: number;
    containerCount: number;
  };
  assets: {
    imageHashes: string[];
    fonts: string[];
  };
  warnings: Array<{ code: string; message: string; nodeId?: string }>;
};

export type NormalizedNodeBase = {
  id: string;
  name?: string;
  figmaType: string;
  visible: boolean;
  opacity: number;
  rotation: number;
  // Absolute transform from Figma export, normalized into design-canvas coordinates
  // (i.e. already offset by canvas.offsetX/Y).
  transform?: { a: number; b: number; c: number; d: number; tx: number; ty: number };
  // Node-local size from the export (often differs from axis-aligned bounding box when rotated).
  size?: { width: number; height: number };
  frame: { x: number; y: number; width: number; height: number };
};

export type NormalizedFill =
  | { kind: "solid"; css: string }
  | {
      kind: "image";
      imageHash: string;
      scaleMode?: string;
      cssFallback: string;
    }
  | {
      kind: "gradient";
      gradientType: "linear" | "radial" | "angular" | "diamond";
      stops: Array<{ offset: number; colorCss: string }>;
      handlePositions?: Array<{ x: number; y: number }>;
      opacity: number;
      cssFallback: string;
    };

export type NormalizedStroke = { css: string; weight: number };

export type NormalizedContainerNode = NormalizedNodeBase & {
  kind: "container";
  clipsContent: boolean;
  fills: NormalizedFill[];
  strokes: NormalizedStroke[];
  cornerRadius?: {
    tl: number;
    tr: number;
    bl: number;
    br: number;
  };
};

export type NormalizedShapeNode = NormalizedNodeBase & {
  kind: "shape";
  fills: NormalizedFill[];
  strokes: NormalizedStroke[];
  cornerRadius?: {
    tl: number;
    tr: number;
    bl: number;
    br: number;
  };
  vectorPaths?: string[];
};

export type NormalizedTextNode = NormalizedNodeBase & {
  kind: "text";
  text: {
    characters: string;
    // Some Figma export JSONs include exact text outlines via `fillGeometry`.
    // When present, the renderer/exporter can use these paths for pixel-perfect text,
    // while still falling back to font-based text when the user edits the content.
    outlinePaths?: string[];
    fontSize?: number;
    fontWeight?: number;
    fontFamily?: string;
    fontStyle?: "normal" | "italic";
    lineHeight?: { unit: string; value?: number };
    letterSpacing?: { unit: string; value: number };
    textAlignHorizontal?: string;
    textAlignVertical?: string;
    textCase?: string;
    textDecoration?: "none" | "underline" | "line-through";
  };
  fills: NormalizedFill[];
};

export type NormalizedNode =
  | NormalizedContainerNode
  | NormalizedShapeNode
  | NormalizedTextNode;
