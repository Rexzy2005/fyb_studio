/**
 * FigmaDesignV1 - the JSON contract emitted by the FYB Extractor plugin.
 *
 * Vendored from `fyb_studio_figma_to_json_plugin/src/code/ir/schema.ts`.
 * Keep this file in sync; both the plugin and the renderer must agree on the
 * shape of the JSON that flows between them.
 *
 * Self-contained - no imports - so it loads identically in both runtimes.
 */

export type SchemaVersion = 1;

export interface Vec2 {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 2×3 affine matrix `[[m00, m01, m02], [m10, m11, m12]]`. */
export type PluginTransform = [
  [number, number, number],
  [number, number, number],
];

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export type BlendMode =
  | "PASS_THROUGH"
  | "NORMAL"
  | "DARKEN"
  | "MULTIPLY"
  | "LINEAR_BURN"
  | "COLOR_BURN"
  | "LIGHTEN"
  | "SCREEN"
  | "LINEAR_DODGE"
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

export interface BasePaint {
  visible: boolean;
  opacity: number;
  blendMode: BlendMode;
}

export interface SolidPaint extends BasePaint {
  type: "SOLID";
  color: RGB;
  css: string;
  boundVariables?: { color?: { type: "VARIABLE_ALIAS"; id: string } };
}

export interface ColorStop {
  position: number;
  color: RGBA;
  boundVariables?: { color?: { type: "VARIABLE_ALIAS"; id: string } };
}

export type GradientType =
  | "GRADIENT_LINEAR"
  | "GRADIENT_RADIAL"
  | "GRADIENT_ANGULAR"
  | "GRADIENT_DIAMOND";

export interface GradientPaint extends BasePaint {
  type: GradientType;
  gradientTransform: PluginTransform;
  gradientStops: ColorStop[];
}

export type ImageScaleMode = "FILL" | "FIT" | "CROP" | "TILE";

export interface ImageFiltersV1 {
  exposure?: number;
  contrast?: number;
  saturation?: number;
  temperature?: number;
  tint?: number;
  highlights?: number;
  shadows?: number;
}

export interface ImagePaint extends BasePaint {
  type: "IMAGE";
  scaleMode: ImageScaleMode;
  imageHash: string | null;
  imageTransform?: PluginTransform;
  scalingFactor?: number;
  rotation?: number;
  filters?: ImageFiltersV1;
}

export type Paint = SolidPaint | GradientPaint | ImagePaint;

export interface Stroke {
  paints: Paint[];
  strokeStyleId: string | null;
  weight:
    | number
    | { mixed: true; perSide: { top: number; right: number; bottom: number; left: number } };
  align: "CENTER" | "INSIDE" | "OUTSIDE";
  cap: string | { __mixed: true };
  join: string | { __mixed: true };
  miterLimit: number;
  dashPattern: number[];
  geometry: Array<{ data: string; windingRule: "NONZERO" | "EVENODD" | "NONE" }>;
  includedInLayout: boolean;
}

export type EffectKind =
  | "DROP_SHADOW"
  | "INNER_SHADOW"
  | "LAYER_BLUR"
  | "BACKGROUND_BLUR"
  | "NOISE"
  | "TEXTURE"
  | "GLASS";

/** All effects flatten into this shape; `kind`-specific fields are optional. */
export interface Effect {
  type: EffectKind;
  visible?: boolean;
  blendMode?: BlendMode;
  color?: RGBA;
  offset?: Vec2;
  radius?: number;
  spread?: number;
  showShadowBehindNode?: boolean;
  blurType?: "NORMAL" | "PROGRESSIVE";
  startRadius?: number;
  startOffset?: Vec2;
  endOffset?: Vec2;
  noiseType?: "MONOTONE" | "DUOTONE" | "MULTITONE";
  secondaryColor?: RGBA;
  noiseSize?: number;
  density?: number;
  clipToShape?: boolean;
  lightIntensity?: number;
  lightAngle?: number;
  refraction?: number;
  depth?: number;
  dispersion?: number;
}

export interface VectorPath {
  data: string;
  windingRule: "NONZERO" | "EVENODD" | "NONE";
}

export interface FontName {
  family: string;
  style: string;
}

export type LetterSpacing = { unit: "PIXELS" | "PERCENT"; value: number };
export type LineHeight =
  | { unit: "PIXELS" | "PERCENT"; value: number }
  | { unit: "AUTO" };

export type TextCase =
  | "ORIGINAL"
  | "UPPER"
  | "LOWER"
  | "TITLE"
  | "SMALL_CAPS"
  | "SMALL_CAPS_FORCED";
export type TextDecoration = "NONE" | "UNDERLINE" | "STRIKETHROUGH";

export interface TextRunV1 {
  start: number;
  end: number;
  characters: string;
  fontName: FontName;
  fontSize: number;
  fontWeight: number;
  fontStyle?: string;
  textCase: TextCase;
  textDecoration: TextDecoration;
  letterSpacing: LetterSpacing;
  lineHeight: LineHeight;
  fills: Paint[];
}

export interface MixedNumber {
  __mixed: true;
  ranges: Array<{ start: number; end: number; value: number }>;
}

interface BasePluginNode {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: BlendMode;
  isMask: boolean;
  maskType?: "ALPHA" | "VECTOR" | "LUMINANCE" | "OUTLINE";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  relativeTransform: PluginTransform;
  absoluteTransform: PluginTransform;
  absoluteBoundingBox: Rect | null;
  absoluteRenderBounds: Rect | null;
  constraints?: { horizontal: string; vertical: string };
  fills?: Paint[];
  fillStyleId?: string | null;
  strokes?: Stroke[];
  // Per-side stroke weights - Figma emits these on every node that can carry
  // strokes (rectangles, frames, vectors, …). When all four agree, the stroke
  // is uniform; when they differ, the renderer needs to honor each side.
  strokeTopWeight?: number;
  strokeRightWeight?: number;
  strokeBottomWeight?: number;
  strokeLeftWeight?: number;
  effects?: Effect[];
  effectStyleId?: string | null;
}

export interface FrameLikeNode extends BasePluginNode {
  type: "FRAME" | "COMPONENT" | "COMPONENT_SET" | "INSTANCE";
  children: SceneNode[];
  clipsContent: boolean;
  topLeftRadius: number;
  topRightRadius: number;
  bottomLeftRadius: number;
  bottomRightRadius: number;
  cornerSmoothing: number;
  layoutMode: "NONE" | "HORIZONTAL" | "VERTICAL" | "GRID";
  layoutWrap: "NO_WRAP" | "WRAP";
  itemSpacing: number;
  paddingTop: number;
  paddingRight: number;
  paddingBottom: number;
  paddingLeft: number;
  layoutGrids: unknown[];
}

export interface GroupNode extends BasePluginNode {
  type: "GROUP";
  children: SceneNode[];
}

export interface SectionNode extends BasePluginNode {
  type: "SECTION";
  children: SceneNode[];
  sectionContentsHidden: boolean;
}

export interface RectangleNode extends BasePluginNode {
  type: "RECTANGLE";
  topLeftRadius: number;
  topRightRadius: number;
  bottomLeftRadius: number;
  bottomRightRadius: number;
  cornerSmoothing: number;
  fillGeometry: VectorPath[];
  strokeGeometry: VectorPath[];
}

export interface EllipseNode extends BasePluginNode {
  type: "ELLIPSE";
  arcData: { startingAngle: number; endingAngle: number; innerRadius: number };
  fillGeometry: VectorPath[];
  strokeGeometry: VectorPath[];
}

export interface LineNode extends BasePluginNode {
  type: "LINE";
  fillGeometry: VectorPath[];
  strokeGeometry: VectorPath[];
}

export interface PolygonNode extends BasePluginNode {
  type: "POLYGON";
  pointCount: number;
  fillGeometry: VectorPath[];
  strokeGeometry: VectorPath[];
}

export interface StarNode extends BasePluginNode {
  type: "STAR";
  pointCount: number;
  innerRadius: number;
  fillGeometry: VectorPath[];
  strokeGeometry: VectorPath[];
}

export interface VectorNode extends BasePluginNode {
  type: "VECTOR";
  vectorPaths: VectorPath[];
  vectorNetwork: unknown;
  fillGeometry: VectorPath[];
  strokeGeometry: VectorPath[];
}

export interface BooleanOperationNode extends BasePluginNode {
  type: "BOOLEAN_OPERATION";
  booleanOperation: string;
  vectorPaths: VectorPath[];
  fillGeometry: VectorPath[];
  strokeGeometry: VectorPath[];
  children: SceneNode[];
}

export interface TextNodeV1 extends Omit<BasePluginNode, "fills"> {
  type: "TEXT";
  characters: string;
  hasMissingFont: boolean;
  autoRename?: boolean;
  textAutoResize: "NONE" | "WIDTH_AND_HEIGHT" | "HEIGHT" | "TRUNCATE";
  textTruncation?: "DISABLED" | "ENDING";
  maxLines?: number | null;
  textAlignHorizontal: "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED";
  textAlignVertical: "TOP" | "CENTER" | "BOTTOM";
  paragraphIndent: number | MixedNumber;
  paragraphSpacing: number | MixedNumber;
  listSpacing?: number | MixedNumber;
  hangingPunctuation?: boolean;
  hangingList?: boolean;
  leadingTrim?: "NONE" | "CAP_HEIGHT" | { __mixed: true };
  textStyleId?: string;
  fontName: FontName | { __mixed: true };
  fontSize: number | { __mixed: true };
  fontWeight: number | { __mixed: true };
  letterSpacing: LetterSpacing | { __mixed: true };
  lineHeight: LineHeight | { __mixed: true };
  textCase: TextCase | { __mixed: true };
  textDecoration: TextDecoration | { __mixed: true };
  fills: Paint[] | { __mixed: true };
  allFontNames: FontName[];
  runs: TextRunV1[];
  outlinePaths: VectorPath[];
}

export type SceneNode =
  | FrameLikeNode
  | GroupNode
  | SectionNode
  | RectangleNode
  | EllipseNode
  | LineNode
  | PolygonNode
  | StarNode
  | VectorNode
  | BooleanOperationNode
  | TextNodeV1
  | (BasePluginNode & { children?: SceneNode[]; type: string });

export interface PageDoc {
  id: string;
  name: string;
  backgrounds: Paint[];
  prototypeBackgrounds: Paint[];
  prototypeStartNodeId: string | null;
  flowStartingPoints: Array<{ nodeId: string; name: string }>;
  guides: Array<{ axis: "X" | "Y"; offset: number }>;
  isPageDivider: boolean;
  children: SceneNode[];
}

export interface FontUsage {
  family: string;
  style: string;
  fontWeight: number;
  sampleNodeIds: string[];
}

export interface FigmaDesignV1 {
  schemaVersion: SchemaVersion;
  pluginVersion: string;
  exportedAt: string;
  source: {
    fileKey?: string;
    documentColorProfile: "LEGACY" | "SRGB" | "DISPLAY_P3";
    documentName?: string;
  };
  warnings: Array<{ code: string; message: string; nodeId?: string }>;
  pages: PageDoc[];
  globals: {
    fonts: FontUsage[];
    styles: { paint: unknown[]; text: unknown[]; effect: unknown[]; grid: unknown[] };
    variables: { collections: unknown[]; variables: unknown[] };
    components: { components: unknown[]; componentSets: unknown[] };
    environmentFonts?: FontName[];
  };
  assets: {
    images: { [hash: string]: { mime: string; base64: string; width: number; height: number } };
    videos: { [hash: string]: { mime: string; base64: string } };
  };
}

/** Type guard - distinguishes plugin output from legacy / Figma REST shapes. */
export function isFigmaDesignV1(input: unknown): input is FigmaDesignV1 {
  if (!input || typeof input !== "object") return false;
  const o = input as { schemaVersion?: unknown; pages?: unknown; globals?: unknown };
  return (
    o.schemaVersion === 1 &&
    Array.isArray(o.pages) &&
    !!o.globals &&
    typeof o.globals === "object"
  );
}
