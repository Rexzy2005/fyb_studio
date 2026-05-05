import type { BlendMode } from "../../normalized";

const BLEND_MODES = new Set<BlendMode>([
  "PASS_THROUGH",
  "NORMAL",
  "DARKEN",
  "MULTIPLY",
  "COLOR_BURN",
  "LIGHTEN",
  "SCREEN",
  "COLOR_DODGE",
  "OVERLAY",
  "SOFT_LIGHT",
  "HARD_LIGHT",
  "DIFFERENCE",
  "EXCLUSION",
  "HUE",
  "SATURATION",
  "COLOR",
  "LUMINOSITY",
]);

export function asBlendMode(value: unknown, fallback: BlendMode): BlendMode {
  return typeof value === "string" && BLEND_MODES.has(value as BlendMode)
    ? (value as BlendMode)
    : fallback;
}

const SCALE_MODES = new Set(["FILL", "FIT", "CROP", "TILE", "STRETCH"]);
export function asScaleMode(
  value: unknown,
): "FILL" | "FIT" | "CROP" | "TILE" | "STRETCH" {
  return typeof value === "string" && SCALE_MODES.has(value)
    ? (value as "FILL" | "FIT" | "CROP" | "TILE" | "STRETCH")
    : "FILL";
}

const STROKE_ALIGN = new Set(["INSIDE", "OUTSIDE", "CENTER"]);
export function asStrokeAlign(value: unknown): "INSIDE" | "OUTSIDE" | "CENTER" {
  return typeof value === "string" && STROKE_ALIGN.has(value)
    ? (value as "INSIDE" | "OUTSIDE" | "CENTER")
    : "CENTER";
}

const STROKE_CAP = new Set([
  "NONE",
  "ROUND",
  "SQUARE",
  "ARROW_LINES",
  "ARROW_EQUILATERAL",
]);
export function asStrokeCap(
  value: unknown,
): "NONE" | "ROUND" | "SQUARE" | "ARROW_LINES" | "ARROW_EQUILATERAL" {
  return typeof value === "string" && STROKE_CAP.has(value)
    ? (value as
        | "NONE"
        | "ROUND"
        | "SQUARE"
        | "ARROW_LINES"
        | "ARROW_EQUILATERAL")
    : "NONE";
}

const STROKE_JOIN = new Set(["MITER", "ROUND", "BEVEL"]);
export function asStrokeJoin(value: unknown): "MITER" | "ROUND" | "BEVEL" {
  return typeof value === "string" && STROKE_JOIN.has(value)
    ? (value as "MITER" | "ROUND" | "BEVEL")
    : "MITER";
}

const CONTAINER_TYPES = new Set([
  "FRAME",
  "GROUP",
  "COMPONENT",
  "INSTANCE",
  "SECTION",
]);
export function asContainerType(
  value: unknown,
): "FRAME" | "GROUP" | "COMPONENT" | "INSTANCE" | "SECTION" {
  return typeof value === "string" && CONTAINER_TYPES.has(value)
    ? (value as "FRAME" | "GROUP" | "COMPONENT" | "INSTANCE" | "SECTION")
    : "FRAME";
}

const LAYOUT_MODES = new Set(["NONE", "HORIZONTAL", "VERTICAL"]);
export function asLayoutMode(
  value: unknown,
): "NONE" | "HORIZONTAL" | "VERTICAL" | undefined {
  return typeof value === "string" && LAYOUT_MODES.has(value)
    ? (value as "NONE" | "HORIZONTAL" | "VERTICAL")
    : undefined;
}

const MASK_TYPES = new Set(["ALPHA", "VECTOR", "LUMINANCE"]);
export function asMaskType(
  value: unknown,
): "ALPHA" | "VECTOR" | "LUMINANCE" | undefined {
  return typeof value === "string" && MASK_TYPES.has(value)
    ? (value as "ALPHA" | "VECTOR" | "LUMINANCE")
    : undefined;
}

const AUTO_RESIZE = new Set(["NONE", "WIDTH_AND_HEIGHT", "HEIGHT", "TRUNCATE"]);
export function asAutoResize(
  value: unknown,
): "NONE" | "WIDTH_AND_HEIGHT" | "HEIGHT" | "TRUNCATE" | undefined {
  return typeof value === "string" && AUTO_RESIZE.has(value)
    ? (value as "NONE" | "WIDTH_AND_HEIGHT" | "HEIGHT" | "TRUNCATE")
    : undefined;
}
