// Normalized design IR. Bump `version` when the shape of this type changes.
// Backwards-compatible additions (new optional fields) do NOT require a bump.

export type BlendMode =
  | "PASS_THROUGH"
  | "NORMAL"
  | "DARKEN"
  | "MULTIPLY"
  | "COLOR_BURN"
  | "LIGHTEN"
  | "SCREEN"
  | "COLOR_DODGE"
  | "OVERLAY"
  | "SOFT_LIGHT"
  | "HARD_LIGHT"
  | "DIFFERENCE"
  | "EXCLUSION"
  | "HUE"
  | "SATURATION"
  | "COLOR"
  | "LUMINOSITY";

export type ConstraintMode = "MIN" | "MAX" | "CENTER" | "STRETCH" | "SCALE";

export type AffineMatrix = {
  a: number;
  b: number;
  c: number;
  d: number;
  tx: number;
  ty: number;
};

export type ImageFilters = {
  exposure: number;
  contrast: number;
  saturation: number;
  temperature: number;
  tint: number;
  highlights: number;
  shadows: number;
};

export type NormalizedFillBase = {
  visible: boolean;
  opacity: number;
  blendMode: BlendMode;
};

export type NormalizedSolidFill = NormalizedFillBase & {
  kind: "solid";
  css: string;
};

export type NormalizedGradientFill = NormalizedFillBase & {
  kind: "gradient";
  gradientType: "linear" | "radial" | "angular" | "diamond";
  stops: Array<{ offset: number; colorCss: string }>;
  // Figma always exports 3 handles when present: [start, end, width].
  // Some legacy exports only have 2 - we still accept that shape.
  handlePositions?: Array<{ x: number; y: number }>;
  cssFallback: string;
};

export type NormalizedImageFill = NormalizedFillBase & {
  kind: "image";
  imageHash: string;
  scaleMode: "FILL" | "FIT" | "CROP" | "TILE" | "STRETCH";
  imageTransform?: AffineMatrix;
  scalingFactor?: number;
  rotation?: number;
  filters?: ImageFilters;
  cssFallback: string;
};

export type NormalizedFill =
  | NormalizedSolidFill
  | NormalizedGradientFill
  | NormalizedImageFill;

export type NormalizedStroke = {
  paint: NormalizedFill;
  weight: number;
  align: "INSIDE" | "OUTSIDE" | "CENTER";
  cap: "NONE" | "ROUND" | "SQUARE" | "ARROW_LINES" | "ARROW_EQUILATERAL";
  join: "MITER" | "ROUND" | "BEVEL";
  miterLimit: number;
  dashPattern: number[];
  individualWeights?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  // Convenience fields kept for backwards compatibility with the legacy renderer.
  // Equivalent to `paint.css` when the paint is a solid; falls back to cssFallback otherwise.
  css: string;
};

export type NormalizedEffect =
  | {
      kind: "drop-shadow";
      offset: { x: number; y: number };
      radius: number;
      spread: number;
      color: string;
      blendMode: BlendMode;
      visible: boolean;
      showShadowBehindNode: boolean;
    }
  | {
      kind: "inner-shadow";
      offset: { x: number; y: number };
      radius: number;
      spread: number;
      color: string;
      blendMode: BlendMode;
      visible: boolean;
    }
  | { kind: "layer-blur"; radius: number; visible: boolean }
  | { kind: "background-blur"; radius: number; visible: boolean };

export type NormalizedVectorPath = {
  data: string;
  windingRule: "NONZERO" | "EVENODD";
  // "local" = numbers are in node-local coordinates (translate by frame.x/y or use transform).
  // "absolute" = numbers are already in canvas coordinates.
  // "unknown" = exporter didn't tell us; renderer falls back to a heuristic.
  coordinateSpace: "local" | "absolute" | "unknown";
};

export type NormalizedNodeBase = {
  id: string;
  name?: string;
  figmaType: string;
  visible: boolean;
  opacity: number;
  rotation: number;
  blendMode: BlendMode;
  effects: NormalizedEffect[];
  isMask: boolean;
  maskType?: "ALPHA" | "VECTOR" | "LUMINANCE";
  constraints?: { horizontal: ConstraintMode; vertical: ConstraintMode };
  // Absolute transform from Figma export, normalized into design-canvas coordinates
  // (i.e. already offset by canvas.offsetX/Y).
  transform?: AffineMatrix;
  // Relative transform (parent space) - useful for the coordinate-space classifier.
  relativeTransform?: AffineMatrix;
  // Node-local size from the export (often differs from axis-aligned bounding box when rotated).
  size?: { width: number; height: number };
  frame: { x: number; y: number; width: number; height: number };
};

export type NormalizedContainerNode = NormalizedNodeBase & {
  kind: "container";
  containerType: "FRAME" | "GROUP" | "COMPONENT" | "INSTANCE" | "SECTION";
  clipsContent: boolean;
  fills: NormalizedFill[];
  strokes: NormalizedStroke[];
  cornerRadius?: { tl: number; tr: number; bl: number; br: number };
  layoutMode?: "NONE" | "HORIZONTAL" | "VERTICAL";
};

export type NormalizedShapeNode = NormalizedNodeBase & {
  kind: "shape";
  fills: NormalizedFill[];
  strokes: NormalizedStroke[];
  cornerRadius?: { tl: number; tr: number; bl: number; br: number };
  // Legacy/back-compat: flattened path data for renderers that only want strings.
  vectorPaths?: string[];
  fillGeometry?: NormalizedVectorPath[];
  strokeGeometry?: NormalizedVectorPath[];
};

export type TextStyle = {
  fontSize: number;
  fontWeight: number;
  fontFamily: string;
  fontStyle: "normal" | "italic";
  letterSpacing?: { unit: "PIXELS" | "PERCENT"; value: number };
  fills?: NormalizedFill[];
  textDecoration: "none" | "underline" | "line-through";
  textCase?: string;
};

export type TextRun = {
  start: number; // char index, inclusive
  end: number; // char index, exclusive
  fontFamily?: string;
  fontWeight?: number;
  fontStyle?: "normal" | "italic";
  fontSize?: number;
  // The original Figma style label ("Bold", "SemiBold", "ExtraLight"). Carried
  // alongside the resolved CSS `fontStyle` so the editor can re-apply the
  // exact named font face when the user starts editing.
  fontStyleName?: string;
  letterSpacing?: { unit: "PIXELS" | "PERCENT"; value: number };
  lineHeight?: { unit: string; value?: number };
  fills?: NormalizedFill[];
  textDecoration?: "none" | "underline" | "line-through";
  textCase?: string;
};

export type NormalizedTextNode = NormalizedNodeBase & {
  kind: "text";
  // Text can carry strokes (stroke-around glyphs) - common for headline/logo styles.
  // Renderer maps to SVG `stroke` + `paint-order` to honor INSIDE/OUTSIDE alignment.
  strokes: NormalizedStroke[];
  text: {
    characters: string;
    // Pre-baked outline geometry from the Figma export (one path per glyph cluster).
    // Used for pixel-perfect display of the *original* text; dropped when the user edits.
    outlinePaths?: string[];
    fontSize?: number;
    fontWeight?: number;
    fontFamily?: string;
    fontStyle?: "normal" | "italic";
    // Original Figma style name ("Bold", "Medium", "ExtraLight"). Lets the
    // editor reapply the precise font face after the user starts editing.
    fontStyleName?: string;
    lineHeight?: { unit: string; value?: number };
    letterSpacing?: { unit: string; value: number };
    textAlignHorizontal?: string;
    textAlignVertical?: string;
    textCase?: string;
    textDecoration?: "none" | "underline" | "line-through";
    paragraphSpacing?: number;
    paragraphIndent?: number;
    listSpacing?: number;
    hangingPunctuation?: boolean;
    hangingList?: boolean;
    leadingTrim?: "NONE" | "CAP_HEIGHT";
    textTruncation?: "DISABLED" | "ENDING";
    maxLines?: number;
    autoResize?: "NONE" | "WIDTH_AND_HEIGHT" | "HEIGHT" | "TRUNCATE";
    // Original font family/style as Figma reported them - used by the editor
    // when re-rendering after user edits, so the wrong font isn't substituted.
    originalFontName?: { family: string; style: string };
    // Whether the export marked this font as missing in the editor session;
    // when true the renderer prefers the bundled outline paths over font
    // rendering since the substituted font would be visually wrong.
    hasMissingFont?: boolean;
    runs?: TextRun[];
  };
  fills: NormalizedFill[];
};

export type NormalizedNode =
  | NormalizedContainerNode
  | NormalizedShapeNode
  | NormalizedTextNode;

export type NormalizedDesignV1 = {
  version: 2;
  source: "figma";
  sourceName?: string;
  rootIds: string[];
  canvas: {
    width: number;
    height: number;
    background?: { css: string };
    backgrounds?: NormalizedFill[];
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

// Re-export under the V2 name for forward-compatibility.
export type NormalizedDesignV2 = NormalizedDesignV1;
