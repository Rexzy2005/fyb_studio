import { normalizeLegacyColor01 } from "./shared/color";
import { asNumber, asString, isRecord, type AnyRecord } from "./shared/coerce";

function adaptLegacyGradientStops(paint: AnyRecord): AnyRecord[] | undefined {
  const candidates =
    (Array.isArray(paint.gradientStops) ? (paint.gradientStops as unknown[]) : null) ??
    (Array.isArray(paint.stops) ? (paint.stops as unknown[]) : null) ??
    null;
  if (!candidates) return undefined;

  const out: AnyRecord[] = [];
  for (const s of candidates) {
    if (!isRecord(s)) continue;
    const position = asNumber((s as AnyRecord).position, NaN);
    const offset = asNumber((s as AnyRecord).offset, NaN);
    const pos = Number.isFinite(position) ? position : Number.isFinite(offset) ? offset : NaN;
    if (!Number.isFinite(pos)) continue;
    const c = isRecord((s as AnyRecord).color) ? ((s as AnyRecord).color as AnyRecord) : null;
    if (!c) continue;
    out.push({ position: Math.max(0, Math.min(1, pos)), color: normalizeLegacyColor01(c) });
  }

  return out.length ? out : undefined;
}

function adaptLegacyGradientHandles(paint: AnyRecord): AnyRecord[] | undefined {
  const handles =
    (Array.isArray(paint.gradientHandlePositions)
      ? (paint.gradientHandlePositions as unknown[])
      : null) ??
    (Array.isArray(paint.handles) ? (paint.handles as unknown[]) : null) ??
    null;
  if (!handles) return undefined;

  const out: AnyRecord[] = [];
  for (const h of handles) {
    if (!isRecord(h)) continue;
    const x = asNumber((h as AnyRecord).x, NaN);
    const y = asNumber((h as AnyRecord).y, NaN);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    out.push({ x, y });
  }

  return out.length ? out : undefined;
}

function isLegacyNodeShape(value: unknown): value is AnyRecord {
  if (!isRecord(value)) return false;
  if (typeof value.type !== "string") return false;

  // Support both legacy shapes:
  // A) { properties: { position: {x,y}, size:{width,height} } }
  // B) flat: { x,y,width,height } (Figma-plugin-like)
  const props = isRecord(value.properties) ? (value.properties as AnyRecord) : null;
  const position = props && isRecord(props.position) ? (props.position as AnyRecord) : null;
  const size = props && isRecord(props.size) ? (props.size as AnyRecord) : null;

  const x = Number.isFinite(asNumber((value as AnyRecord).x, NaN))
    ? asNumber((value as AnyRecord).x, NaN)
    : position
      ? asNumber(position.x, NaN)
      : NaN;
  const y = Number.isFinite(asNumber((value as AnyRecord).y, NaN))
    ? asNumber((value as AnyRecord).y, NaN)
    : position
      ? asNumber(position.y, NaN)
      : NaN;
  const w = Number.isFinite(asNumber((value as AnyRecord).width, NaN))
    ? asNumber((value as AnyRecord).width, NaN)
    : size
      ? asNumber(size.width, NaN)
      : NaN;
  const h = Number.isFinite(asNumber((value as AnyRecord).height, NaN))
    ? asNumber((value as AnyRecord).height, NaN)
    : size
      ? asNumber(size.height, NaN)
      : NaN;

  return [x, y, w, h].every((n) => Number.isFinite(n));
}

function adaptLegacyPaintsToFigma(paints: unknown, fallbackId: string): AnyRecord[] {
  const arr = Array.isArray(paints) ? (paints as unknown[]) : [];
  const out: AnyRecord[] = [];
  for (let i = 0; i < arr.length; i++) {
    const p = arr[i];
    if (!isRecord(p)) continue;
    const type = asString(p.type);
    if (!type) continue;

    if (type === "SOLID") {
      const color = isRecord(p.color) ? (p.color as AnyRecord) : {};
      out.push({
        type: "SOLID",
        color: normalizeLegacyColor01(color),
        opacity: asNumber(p.opacity, 1),
        visible: (p as AnyRecord).visible !== false,
      });
      continue;
    }

    if (type === "IMAGE") {
      const imageHash = asString((p as AnyRecord).imageHash) ?? `legacy_${fallbackId}_${i}`;
      out.push({
        type: "IMAGE",
        imageHash,
        opacity: asNumber(p.opacity, 1),
        visible: (p as AnyRecord).visible !== false,
      });
      continue;
    }

    if (type.startsWith("GRADIENT")) {
      // If the legacy export doesn't include stops, we still preserve the fact it's a gradient.
      out.push({
        type,
        opacity: asNumber(p.opacity, 1),
        visible: (p as AnyRecord).visible !== false,
        gradientStops: adaptLegacyGradientStops(p as AnyRecord),
        gradientHandlePositions: adaptLegacyGradientHandles(p as AnyRecord),
      });
      continue;
    }
  }
  return out;
}

function inferLegacyFontWeight(styleName: string | undefined): number | undefined {
  const s = (styleName ?? "").trim().toLowerCase();
  if (!s) return undefined;

  // Order matters: check more specific styles first.
  if (s.includes("thin")) return 100;
  if (
    s.includes("extralight") ||
    s.includes("extra light") ||
    s.includes("ultralight") ||
    s.includes("ultra light")
  )
    return 200;
  if (s.includes("light")) return 300;
  if (s.includes("regular") || s.includes("normal") || s.includes("book") || s.includes("roman"))
    return 400;
  if (s.includes("medium")) return 500;
  if (
    s.includes("semibold") ||
    s.includes("semi bold") ||
    s.includes("demibold") ||
    s.includes("demi bold")
  )
    return 600;
  if (
    s.includes("extrabold") ||
    s.includes("extra bold") ||
    s.includes("ultrabold") ||
    s.includes("ultra bold") ||
    s.includes("heavy")
  )
    return 800;
  if (s.includes("black")) return 900;
  if (s.includes("bold")) return 700;

  return undefined;
}

function inferLegacyItalic(styleName: string | undefined): boolean | undefined {
  const s = (styleName ?? "").trim().toLowerCase();
  if (!s) return undefined;
  return s.includes("italic") ? true : undefined;
}

function readLegacyBBoxFromProps(
  props: AnyRecord,
): { x: number; y: number; width: number; height: number } | null {
  const pos = isRecord(props.position) ? (props.position as AnyRecord) : null;
  const size = isRecord(props.size) ? (props.size as AnyRecord) : null;
  if (!pos || !size) return null;
  const x = asNumber(pos.x, NaN);
  const y = asNumber(pos.y, NaN);
  const width = asNumber(size.width, NaN);
  const height = asNumber(size.height, NaN);
  if (![x, y, width, height].every((n) => Number.isFinite(n))) return null;
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

function readLegacyBBoxFromNode(
  node: AnyRecord,
): { x: number; y: number; width: number; height: number } | null {
  const x = asNumber(node.x, NaN);
  const y = asNumber(node.y, NaN);
  const width = asNumber(node.width, NaN);
  const height = asNumber(node.height, NaN);
  if (![x, y, width, height].every((n) => Number.isFinite(n))) return null;
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

function inferLegacyBBox(
  node: unknown,
): { x: number; y: number; width: number; height: number } | null {
  if (!isRecord(node)) return null;
  const directNode = readLegacyBBoxFromNode(node as AnyRecord);
  if (directNode) return directNode;

  const props = isRecord((node as AnyRecord).properties)
    ? ((node as AnyRecord).properties as AnyRecord)
    : null;
  if (props) {
    const direct = readLegacyBBoxFromProps(props);
    if (direct) return direct;
  }

  const children = Array.isArray((node as AnyRecord).children)
    ? ((node as AnyRecord).children as unknown[])
    : [];
  if (children.length === 0) return null;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let found = false;

  for (const child of children) {
    const bb = inferLegacyBBox(child);
    if (!bb) continue;
    found = true;
    minX = Math.min(minX, bb.x);
    minY = Math.min(minY, bb.y);
    maxX = Math.max(maxX, bb.x + bb.width);
    maxY = Math.max(maxY, bb.y + bb.height);
  }

  if (!found) return null;
  const width = maxX - minX;
  const height = maxY - minY;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { x: minX, y: minY, width, height };
}

function cryptoRandomId(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = (globalThis as any).crypto as Crypto | undefined;
    if (c?.randomUUID) return c.randomUUID();
  } catch {
    // ignore
  }
  return `legacy_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

function inferIconGlyph(label: string | undefined): string | null {
  const v = (label ?? "").toLowerCase();
  if (!v) return null;
  if (v.includes("facebook")) return "f";
  if (v.includes("github")) return "GH";
  if (v.includes("phone") || v.includes("communication")) return "☎";
  if (v.includes("instagram")) return "IG";
  if (v.includes("x") || v.includes("twitter")) return "X";
  return null;
}

function convertLegacyNode(node: unknown): AnyRecord {
  const rec = isRecord(node) ? (node as AnyRecord) : {};
  const id = asString(rec.id) ?? cryptoRandomId();
  const figmaType = asString(rec.type) ?? "FRAME";
  const name = asString(rec.name);
  const props = isRecord(rec.properties) ? (rec.properties as AnyRecord) : {};

  const bb = inferLegacyBBox(rec);
  const pos = isRecord(props.position) ? (props.position as AnyRecord) : {};
  const size = isRecord(props.size) ? (props.size as AnyRecord) : {};
  const x = bb ? bb.x : asNumber(pos.x, 0);
  const y = bb ? bb.y : asNumber(pos.y, 0);
  const w = bb ? bb.width : asNumber(size.width, 0);
  const h = bb ? bb.height : asNumber(size.height, 0);

  const styles = isRecord(props.styles) ? (props.styles as AnyRecord) : {};

  // Support both legacy paint locations:
  // A) props.styles.fills/strokes
  // B) node.fills/strokes (flat exports)
  const fillsSource =
    (Array.isArray((styles as AnyRecord).fills) ? (styles as AnyRecord).fills : undefined) ??
    (rec as AnyRecord).fills;
  const strokesSource =
    (Array.isArray((styles as AnyRecord).strokes) ? (styles as AnyRecord).strokes : undefined) ??
    (rec as AnyRecord).strokes;

  const fills = adaptLegacyPaintsToFigma(fillsSource, id);
  const strokes = adaptLegacyPaintsToFigma(strokesSource, `${id}_stroke`);

  // Corner radius support (if the legacy exporter provides it).
  const cornerRadius = Number.isFinite(asNumber((rec as AnyRecord).cornerRadius, NaN))
    ? asNumber((rec as AnyRecord).cornerRadius, NaN)
    : asNumber((props as AnyRecord).cornerRadius, NaN);
  const cornerRadii = isRecord((props as AnyRecord).cornerRadii)
    ? ((props as AnyRecord).cornerRadii as AnyRecord)
    : null;
  const tl = cornerRadii ? asNumber((cornerRadii as AnyRecord).tl, NaN) : NaN;
  const tr = cornerRadii ? asNumber((cornerRadii as AnyRecord).tr, NaN) : NaN;
  const bl = cornerRadii ? asNumber((cornerRadii as AnyRecord).bl, NaN) : NaN;
  const br = cornerRadii ? asNumber((cornerRadii as AnyRecord).br, NaN) : NaN;

  // Flat per-corner radii (common in plugin exports)
  const tlFlat = asNumber((rec as AnyRecord).topLeftRadius, NaN);
  const trFlat = asNumber((rec as AnyRecord).topRightRadius, NaN);
  const blFlat = asNumber((rec as AnyRecord).bottomLeftRadius, NaN);
  const brFlat = asNumber((rec as AnyRecord).bottomRightRadius, NaN);

  // Icon fallback: some exporters omit vector path geometry for INSTANCES/COMPONENTS.
  // If we can recognize common social/media icon components, render them as centered TEXT glyphs.
  const componentInfo = isRecord((props as AnyRecord).componentInfo)
    ? ((props as AnyRecord).componentInfo as AnyRecord)
    : null;
  const mainComponent =
    componentInfo && isRecord((componentInfo as AnyRecord).mainComponent)
      ? ((componentInfo as AnyRecord).mainComponent as AnyRecord)
      : null;
  const mainComponentName = mainComponent
    ? asString((mainComponent as AnyRecord).name)
    : undefined;

  const iconLabel = mainComponentName ?? name;
  const iconGlyphCandidate = inferIconGlyph(iconLabel);
  const looksLikeIconName = typeof iconLabel === "string" && iconLabel.includes(":");
  const iconGlyph =
    iconGlyphCandidate &&
    looksLikeIconName &&
    (figmaType === "INSTANCE" ||
      figmaType === "COMPONENT" ||
      figmaType === "FRAME" ||
      figmaType === "GROUP")
      ? iconGlyphCandidate
      : null;

  const out: AnyRecord = {
    id,
    name,
    type: iconGlyph ? "TEXT" : figmaType,
    visible: (rec as AnyRecord).visible !== false,
    opacity: asNumber((rec as AnyRecord).opacity, 1),
    rotation: asNumber((rec as AnyRecord).rotation, asNumber(props.rotation, 0)),
    absoluteBoundingBox: { x, y, width: w, height: h },
    width: w,
    height: h,
    fills,
    strokes,
    strokeWeight:
      asNumber((rec as AnyRecord).strokeWeight, strokes.length ? 1 : 0) ||
      (strokes.length ? 1 : undefined),
    // Keep legacy layout info in passthrough for future use.
    layout: props.layout,
  };

  if (
    Number.isFinite(tlFlat) &&
    Number.isFinite(trFlat) &&
    Number.isFinite(blFlat) &&
    Number.isFinite(brFlat)
  ) {
    out.topLeftRadius = tlFlat;
    out.topRightRadius = trFlat;
    out.bottomLeftRadius = blFlat;
    out.bottomRightRadius = brFlat;
  } else if (
    Number.isFinite(tl) &&
    Number.isFinite(tr) &&
    Number.isFinite(bl) &&
    Number.isFinite(br)
  ) {
    out.topLeftRadius = tl;
    out.topRightRadius = tr;
    out.bottomLeftRadius = bl;
    out.bottomRightRadius = br;
  } else if (Number.isFinite(cornerRadius)) {
    out.cornerRadius = cornerRadius;
  }

  if (iconGlyph) {
    out.characters = iconGlyph;
    out.textAlignHorizontal = "CENTER";
    out.textAlignVertical = "CENTER";

    const fontSize = Math.max(10, Math.min(64, Math.floor(Math.min(w, h) * 0.78)));
    out.style = {
      fontName: { family: "Inter", style: "Bold" },
      fontFamily: "Inter",
      fontSize,
      fontWeight: 700,
    };

    // If the instance has no fills, default to a readable icon color.
    if (!Array.isArray(out.fills) || (out.fills as unknown[]).length === 0) {
      out.fills = [
        {
          type: "SOLID",
          // Default to black; these icon frames often have a white background fill.
          color: { r: 0, g: 0, b: 0, a: 1 },
          opacity: 1,
          visible: true,
        },
      ];
    }

    out.children = [];
    return out;
  }

  if (figmaType === "TEXT") {
    const characters = asString((rec as AnyRecord).characters) ?? asString(props.text) ?? "";
    out.characters = characters;

    const fontFromProps = isRecord(props.font) ? (props.font as AnyRecord) : null;
    const fontNameFromNode = isRecord((rec as AnyRecord).fontName)
      ? ((rec as AnyRecord).fontName as AnyRecord)
      : null;

    const family =
      asString((fontNameFromNode as AnyRecord | null)?.family) ??
      (fontFromProps ? asString((fontFromProps as AnyRecord).family) : undefined);

    const fontStyleName =
      asString((fontNameFromNode as AnyRecord | null)?.style) ??
      (fontFromProps ? asString((fontFromProps as AnyRecord).style) : undefined);

    const fontSize = asNumber((rec as AnyRecord).fontSize, NaN);
    const fontSizeFallback = fontFromProps ? asNumber((fontFromProps as AnyRecord).size, NaN) : NaN;
    const resolvedFontSize = Number.isFinite(fontSize) ? fontSize : fontSizeFallback;

    // Many legacy exports only include font.style (e.g. "Bold", "SemiBold Italic")
    // and omit numeric fontWeight. Normalize expects a numeric fontWeight.
    const weightFromNode =
      typeof (rec as AnyRecord).fontWeight === "number" &&
      Number.isFinite((rec as AnyRecord).fontWeight as number)
        ? ((rec as AnyRecord).fontWeight as number)
        : undefined;
    const weightFromFont =
      weightFromNode ??
      (fontFromProps
        ? typeof (fontFromProps as AnyRecord).weight === "number" &&
          Number.isFinite((fontFromProps as AnyRecord).weight as number)
          ? ((fontFromProps as AnyRecord).weight as number)
          : typeof (fontFromProps as AnyRecord).fontWeight === "number" &&
              Number.isFinite((fontFromProps as AnyRecord).fontWeight as number)
            ? ((fontFromProps as AnyRecord).fontWeight as number)
            : undefined
        : undefined);
    const weight = weightFromFont ?? inferLegacyFontWeight(fontStyleName);
    const italic =
      (fontFromProps && typeof (fontFromProps as AnyRecord).italic === "boolean"
        ? ((fontFromProps as AnyRecord).italic as boolean)
        : undefined) ?? inferLegacyItalic(fontStyleName);

    out.style = {
      fontName: family ? { family, style: fontStyleName ?? "Regular" } : undefined,
      fontFamily: family,
      fontSize: Number.isFinite(resolvedFontSize) ? resolvedFontSize : undefined,
      fontWeight: weight,
      ...(italic ? { fontStyle: "italic", italic: true } : null),
    };

    if (typeof weight === "number") out.fontWeight = weight;
    if (italic) out.italic = true;

    // Preserve alignment/lineHeight when present (either flat or under properties).
    if (isRecord((rec as AnyRecord).lineHeight)) out.lineHeight = (rec as AnyRecord).lineHeight;
    else if (isRecord(props.lineHeight)) out.lineHeight = props.lineHeight;

    const align =
      asString((rec as AnyRecord).textAlignHorizontal) ?? asString(props.alignment);
    if (align) out.textAlignHorizontal = align;

    const vAlign = asString((rec as AnyRecord).textAlignVertical);
    if (vAlign) out.textAlignVertical = vAlign;
  }

  const children = Array.isArray(rec.children) ? (rec.children as unknown[]) : [];
  if (children.length) out.children = children.map(convertLegacyNode);
  else out.children = [];

  return out;
}

export function adaptLegacyTreeToFigmaExport(input: unknown): AnyRecord | null {
  const roots = Array.isArray(input)
    ? (input as unknown[])
    : isRecord(input)
      ? ([input] as unknown[])
      : null;
  if (!roots || roots.length === 0) return null;
  if (!roots.some((n) => isLegacyNodeShape(n))) return null;

  return {
    name: "Legacy import",
    document: {
      type: "DOCUMENT",
      children: [
        {
          id: "legacy_page",
          name: "Page 1",
          type: "PAGE",
          children: roots.map(convertLegacyNode),
        },
      ],
    },
  };
}
