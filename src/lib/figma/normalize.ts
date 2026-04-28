import { z } from "zod";

import type { NormalizedDesignV1, NormalizedFill, NormalizedNode, NormalizedStroke } from "./normalized";

const FigmaExportSchema = z
  .object({
    name: z.string().optional(),
    document: z.unknown().optional(),
  })
  .passthrough();

type AnyRecord = Record<string, unknown>;

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === "object" && value !== null;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function normalizeLegacyColor01(color: AnyRecord): { r: number; g: number; b: number; a: number } {
  const rRaw = asNumber(color.r, 0);
  const gRaw = asNumber(color.g, 0);
  const bRaw = asNumber(color.b, 0);
  const aRaw = asNumber(color.a, 1);

  // Detect 0..255 encoding by looking at RGB channels collectively.
  // This avoids the common case where r=1 (looks like 0..1) but g/b are 31/98 (0..255).
  const rgbLooks255 = Math.max(rRaw, gRaw, bRaw) > 1;

  const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
  const to01 = (v: number) => (rgbLooks255 ? v / 255 : v);

  return {
    r: clamp01(to01(rRaw)),
    g: clamp01(to01(gRaw)),
    b: clamp01(to01(bRaw)),
    // Alpha is typically already 0..1 in these exports; only normalize if it looks like 0..255.
    a: clamp01(aRaw > 1 ? aRaw / 255 : aRaw),
  };
}

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
    (Array.isArray(paint.gradientHandlePositions) ? (paint.gradientHandlePositions as unknown[]) : null) ??
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

function adaptLegacyTreeToFigmaExport(input: unknown): AnyRecord | null {
  const roots = Array.isArray(input)
    ? (input as unknown[])
    : isRecord(input)
      ? ([input] as unknown[])
      : null;
  if (!roots || roots.length === 0) return null;
  if (!roots.some((n) => isLegacyNodeShape(n))) return null;

  function inferLegacyFontWeight(styleName: string | undefined): number | undefined {
    const s = (styleName ?? "").trim().toLowerCase();
    if (!s) return undefined;

    // Order matters: check more specific styles first.
    if (s.includes("thin")) return 100;
    if (s.includes("extralight") || s.includes("extra light") || s.includes("ultralight") || s.includes("ultra light")) return 200;
    if (s.includes("light")) return 300;
    if (s.includes("regular") || s.includes("normal") || s.includes("book") || s.includes("roman")) return 400;
    if (s.includes("medium")) return 500;
    if (s.includes("semibold") || s.includes("semi bold") || s.includes("demibold") || s.includes("demi bold")) return 600;
    if (s.includes("extrabold") || s.includes("extra bold") || s.includes("ultrabold") || s.includes("ultra bold") || s.includes("heavy")) return 800;
    if (s.includes("black")) return 900;
    if (s.includes("bold")) return 700;

    return undefined;
  }

  function inferLegacyItalic(styleName: string | undefined): boolean | undefined {
    const s = (styleName ?? "").trim().toLowerCase();
    if (!s) return undefined;
    return s.includes("italic") ? true : undefined;
  }

  function readLegacyBBoxFromProps(props: AnyRecord): { x: number; y: number; width: number; height: number } | null {
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

  function readLegacyBBoxFromNode(node: AnyRecord): { x: number; y: number; width: number; height: number } | null {
    const x = asNumber(node.x, NaN);
    const y = asNumber(node.y, NaN);
    const width = asNumber(node.width, NaN);
    const height = asNumber(node.height, NaN);
    if (![x, y, width, height].every((n) => Number.isFinite(n))) return null;
    if (width <= 0 || height <= 0) return null;
    return { x, y, width, height };
  }

  function inferLegacyBBox(node: unknown): { x: number; y: number; width: number; height: number } | null {
    if (!isRecord(node)) return null;
    const directNode = readLegacyBBoxFromNode(node as AnyRecord);
    if (directNode) return directNode;

    const props = isRecord((node as AnyRecord).properties) ? ((node as AnyRecord).properties as AnyRecord) : null;
    if (props) {
      const direct = readLegacyBBoxFromProps(props);
      if (direct) return direct;
    }

    const children = Array.isArray((node as AnyRecord).children) ? ((node as AnyRecord).children as unknown[]) : [];
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

  function convert(node: unknown): AnyRecord {
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
    const fillsSource = (Array.isArray((styles as AnyRecord).fills) ? (styles as AnyRecord).fills : undefined) ?? (rec as AnyRecord).fills;
    const strokesSource = (Array.isArray((styles as AnyRecord).strokes) ? (styles as AnyRecord).strokes : undefined) ?? (rec as AnyRecord).strokes;

    const fills = adaptLegacyPaintsToFigma(fillsSource, id);
    const strokes = adaptLegacyPaintsToFigma(strokesSource, `${id}_stroke`);

    // Corner radius support (if the legacy exporter provides it).
    const cornerRadius = Number.isFinite(asNumber((rec as AnyRecord).cornerRadius, NaN))
      ? asNumber((rec as AnyRecord).cornerRadius, NaN)
      : asNumber((props as AnyRecord).cornerRadius, NaN);
    const cornerRadii = isRecord((props as AnyRecord).cornerRadii) ? ((props as AnyRecord).cornerRadii as AnyRecord) : null;
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
    const mainComponent = componentInfo && isRecord((componentInfo as AnyRecord).mainComponent)
      ? ((componentInfo as AnyRecord).mainComponent as AnyRecord)
      : null;
    const mainComponentName = mainComponent ? asString((mainComponent as AnyRecord).name) : undefined;

    function inferIconGlyph(label: string | undefined): string | null {
      const v = (label ?? name ?? "").toLowerCase();
      if (!v) return null;
      if (v.includes("facebook")) return "f";
      if (v.includes("github")) return "GH";
      if (v.includes("phone") || v.includes("communication")) return "☎";
      if (v.includes("instagram")) return "IG";
      if (v.includes("x") || v.includes("twitter")) return "X";
      return null;
    }

    const iconLabel = mainComponentName ?? name;
    const iconGlyphCandidate = inferIconGlyph(iconLabel);
    const looksLikeIconName = typeof iconLabel === "string" && iconLabel.includes(":");
    const iconGlyph = iconGlyphCandidate && looksLikeIconName && (figmaType === "INSTANCE" || figmaType === "COMPONENT" || figmaType === "FRAME" || figmaType === "GROUP")
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
      strokeWeight: asNumber((rec as AnyRecord).strokeWeight, strokes.length ? 1 : 0) || (strokes.length ? 1 : undefined),
      // Keep legacy layout info in passthrough for future use.
      layout: props.layout,
    };

    if (Number.isFinite(tlFlat) && Number.isFinite(trFlat) && Number.isFinite(blFlat) && Number.isFinite(brFlat)) {
      out.topLeftRadius = tlFlat;
      out.topRightRadius = trFlat;
      out.bottomLeftRadius = blFlat;
      out.bottomRightRadius = brFlat;
    } else if (Number.isFinite(tl) && Number.isFinite(tr) && Number.isFinite(bl) && Number.isFinite(br)) {
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
      const fontNameFromNode = isRecord((rec as AnyRecord).fontName) ? ((rec as AnyRecord).fontName as AnyRecord) : null;

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
      const weightFromNode = asOptionalNumber((rec as AnyRecord).fontWeight);
      const weightFromFont =
        weightFromNode ??
        (fontFromProps ? asOptionalNumber((fontFromProps as AnyRecord).weight) ?? asOptionalNumber((fontFromProps as AnyRecord).fontWeight) : undefined);
      const weight = weightFromFont ?? inferLegacyFontWeight(fontStyleName);
      const italic =
        (fontFromProps && typeof (fontFromProps as AnyRecord).italic === "boolean" ? ((fontFromProps as AnyRecord).italic as boolean) : undefined) ??
        inferLegacyItalic(fontStyleName);

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

      const align = asString((rec as AnyRecord).textAlignHorizontal) ?? asString(props.alignment);
      if (align) out.textAlignHorizontal = align;

      const vAlign = asString((rec as AnyRecord).textAlignVertical);
      if (vAlign) out.textAlignVertical = vAlign;
    }

    const children = Array.isArray(rec.children) ? (rec.children as unknown[]) : [];
    if (children.length) out.children = children.map(convert);
    else out.children = [];

    return out;
  }

  // Tiny helper: avoid importing nanoid just for this.
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

  return {
    name: "Legacy import",
    document: {
      type: "DOCUMENT",
      children: [
        {
          id: "legacy_page",
          name: "Page 1",
          type: "PAGE",
          children: roots.map(convert),
        },
      ],
    },
  };
}

function cleanFontFamily(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const v = raw.trim();
  if (!v) return undefined;
  // Strip wrapping quotes that sometimes appear in exports or CSS stacks.
  return v.replace(/^['\"]/, "").replace(/['\"]$/, "").trim() || undefined;
}

function inferFontFamilyFromPostScriptName(raw: string | undefined): string | undefined {
  const v = cleanFontFamily(raw);
  if (!v) return undefined;
  // Common patterns: "Inter-Regular", "Poppins-SemiBoldItalic".
  // We only want the family portion for CSS/SVG usage.
  const head = v.split(/[-_]/)[0]?.trim();
  return head ? head : v;
}

function pickMostCommonFontFamilyFromOverrides(input: AnyRecord): string | undefined {
  const overrides = isRecord(input.styleOverrideTable)
    ? (input.styleOverrideTable as AnyRecord)
    : null;
  if (!overrides) return undefined;

  const styleById = new Map<number, AnyRecord>();
  for (const [k, v] of Object.entries(overrides)) {
    const id = Number(k);
    if (!Number.isFinite(id)) continue;
    if (!isRecord(v)) continue;
    styleById.set(id, v as AnyRecord);
  }
  if (styleById.size === 0) return undefined;

  const charOverrides = Array.isArray(input.characterStyleOverrides)
    ? (input.characterStyleOverrides as unknown[])
    : null;
  if (!charOverrides) {
    // No per-character info; just pick the first override that yields a family.
    for (const style of styleById.values()) {
      const styleFontName = isRecord(style.fontName) ? (style.fontName as AnyRecord) : null;
      const fam =
        cleanFontFamily(
          (styleFontName && typeof styleFontName.family === "string" ? (styleFontName.family as string) : undefined) ??
            (typeof style.fontFamily === "string" ? (style.fontFamily as string) : undefined),
        ) ??
        inferFontFamilyFromPostScriptName(typeof style.fontPostScriptName === "string" ? (style.fontPostScriptName as string) : undefined);
      if (fam) return fam;
    }
    return undefined;
  }

  const counts = new Map<number, number>();
  for (const v of charOverrides) {
    const n = typeof v === "number" ? v : NaN;
    if (!Number.isFinite(n)) continue;
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [id] of sorted) {
    const style = styleById.get(id);
    if (!style) continue;
    const styleFontName = isRecord(style.fontName) ? (style.fontName as AnyRecord) : null;
    const fam =
      cleanFontFamily(
        (styleFontName && typeof styleFontName.family === "string" ? (styleFontName.family as string) : undefined) ??
          (typeof style.fontFamily === "string" ? (style.fontFamily as string) : undefined),
      ) ??
      inferFontFamilyFromPostScriptName(typeof style.fontPostScriptName === "string" ? (style.fontPostScriptName as string) : undefined);
    if (fam) return fam;
  }

  return undefined;
}

function parseAbsoluteTransform(node: AnyRecord): { a: number; b: number; c: number; d: number; tx: number; ty: number } | undefined {
  const t = Array.isArray(node.absoluteTransform) ? (node.absoluteTransform as unknown[]) : null;
  if (!t || t.length < 2) return undefined;

  const r0 = Array.isArray(t[0]) ? (t[0] as unknown[]) : null;
  const r1 = Array.isArray(t[1]) ? (t[1] as unknown[]) : null;
  if (!r0 || !r1 || r0.length < 3 || r1.length < 3) return undefined;

  const a = asNumber(r0[0], NaN);
  const c = asNumber(r0[1], NaN);
  const tx = asNumber(r0[2], NaN);
  const b = asNumber(r1[0], NaN);
  const d = asNumber(r1[1], NaN);
  const ty = asNumber(r1[2], NaN);

  if (![a, b, c, d, tx, ty].every((v) => Number.isFinite(v))) return undefined;
  return { a, b, c, d, tx, ty };
}

function getChildNodes(node: unknown): unknown[] {
  if (!isRecord(node)) return [];
  const children = node.children;
  return Array.isArray(children) ? children : [];
}

function rgbaCss(input: {
  r?: number;
  g?: number;
  b?: number;
  a?: number;
}): string {
  const r = Math.round(Math.max(0, Math.min(1, input.r ?? 0)) * 255);
  const g = Math.round(Math.max(0, Math.min(1, input.g ?? 0)) * 255);
  const b = Math.round(Math.max(0, Math.min(1, input.b ?? 0)) * 255);
  const a = Math.max(0, Math.min(1, input.a ?? 1));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function parseFills(node: AnyRecord, warnings: NormalizedDesignV1["warnings"], imageHashes: Set<string>): NormalizedFill[] {
  const fills = Array.isArray(node.fills) ? (node.fills as unknown[]) : [];
  const backgrounds = Array.isArray(node.backgrounds) ? (node.backgrounds as unknown[]) : [];
  const source = fills.length > 0 ? fills : backgrounds;

  const normalized: NormalizedFill[] = [];

  for (const fill of source) {
    if (!isRecord(fill)) continue;
    const type = asString(fill.type);
    if (!type) continue;

    if (type === "SOLID") {
      const color = isRecord(fill.color) ? (fill.color as AnyRecord) : {};
      const opacity = asNumber(fill.opacity, 1);
      normalized.push({ kind: "solid", css: rgbaCss({
        r: asNumber(color.r, 0),
        g: asNumber(color.g, 0),
        b: asNumber(color.b, 0),
        a: opacity,
      }) });
      continue;
    }

    if (type === "IMAGE") {
      const imageHash = asString(fill.imageHash);
      if (imageHash) {
        imageHashes.add(imageHash);
        normalized.push({
          kind: "image",
          imageHash,
          scaleMode: asString(fill.scaleMode),
          cssFallback: "rgba(0,0,0,0.06)",
        });
        warnings.push({
          code: "image_asset_missing",
          message:
            "Image fill references an imageHash, but the export JSON does not include the bitmap bytes. You must attach the image asset during import (next phase).",
        });
      }
      continue;
    }

    if (type.startsWith("GRADIENT")) {
      const gradientStops = Array.isArray(fill.gradientStops)
        ? (fill.gradientStops as unknown[])
        : [];
      const handlePositions = Array.isArray(fill.gradientHandlePositions)
        ? (fill.gradientHandlePositions as unknown[])
        : [];

      const stops = gradientStops
        .map((s) => {
          if (!isRecord(s)) return null;
          const position = asNumber(s.position, NaN);
          const color = isRecord(s.color) ? (s.color as AnyRecord) : {};
          if (!Number.isFinite(position)) return null;
          return {
            offset: Math.max(0, Math.min(1, position)),
            colorCss: rgbaCss({
              r: asNumber(color.r, 0),
              g: asNumber(color.g, 0),
              b: asNumber(color.b, 0),
              a: asNumber(color.a, 1) * asNumber(fill.opacity, 1),
            }),
          };
        })
        .filter((v): v is NonNullable<typeof v> => Boolean(v));

      const handles = handlePositions
        .map((p) => {
          if (!isRecord(p)) return null;
          const x = asNumber(p.x, NaN);
          const y = asNumber(p.y, NaN);
          if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
          return { x, y };
        })
        .filter((v): v is NonNullable<typeof v> => Boolean(v));

      const gradientType =
        type === "GRADIENT_LINEAR"
          ? "linear"
          : type === "GRADIENT_RADIAL"
            ? "radial"
            : type === "GRADIENT_ANGULAR"
              ? "angular"
              : "diamond";

      normalized.push({
        kind: "gradient",
        gradientType,
        stops,
        handlePositions: handles.length ? handles : undefined,
        opacity: asNumber(fill.opacity, 1),
        cssFallback: stops[0]?.colorCss ?? "rgba(0,0,0,0.08)",
      });
      warnings.push({
        code: "gradient_unimplemented",
        message: `Gradient fill type '${type}' detected; gradient data captured and will be rendered by the hybrid renderer/export pipeline.`,
      });
      continue;
    }
  }

  return normalized;
}

function firstSolidPaint(node: AnyRecord): { r: number; g: number; b: number; a: number } | null {
  const fills = Array.isArray(node.fills) ? (node.fills as unknown[]) : [];
  const backgrounds = Array.isArray(node.backgrounds) ? (node.backgrounds as unknown[]) : [];
  const source = fills.length > 0 ? fills : backgrounds;
  for (const fill of source) {
    if (!isRecord(fill)) continue;
    const type = asString(fill.type);
    if (type !== "SOLID") continue;
    if ((fill as AnyRecord).visible === false) continue;
    const color = isRecord((fill as AnyRecord).color) ? ((fill as AnyRecord).color as AnyRecord) : {};
    const opacity = asNumber((fill as AnyRecord).opacity, 1);
    const a = opacity * asNumber(color.a, 1);
    if (a <= 0) continue;
    return {
      r: asNumber(color.r, 0),
      g: asNumber(color.g, 0),
      b: asNumber(color.b, 0),
      a,
    };
  }
  return null;
}

function relativeLuminance(rgb: { r: number; g: number; b: number }) {
  // Inputs are expected as 0..1 floats from Figma exports.
  function toLinear(u: number) {
    const v = Math.max(0, Math.min(1, u));
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  }
  const R = toLinear(rgb.r);
  const G = toLinear(rgb.g);
  const B = toLinear(rgb.b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function parseStrokes(node: AnyRecord): NormalizedStroke[] {
  const strokes = Array.isArray(node.strokes) ? (node.strokes as unknown[]) : [];
  const weight = asNumber(node.strokeWeight, 0);
  const normalized: NormalizedStroke[] = [];

  for (const stroke of strokes) {
    if (!isRecord(stroke)) continue;
    const type = asString(stroke.type);
    if (type !== "SOLID") continue;
    const color = isRecord(stroke.color) ? (stroke.color as AnyRecord) : {};
    const opacity = asNumber(stroke.opacity, 1);
    normalized.push({ css: rgbaCss({
      r: asNumber(color.r, 0),
      g: asNumber(color.g, 0),
      b: asNumber(color.b, 0),
      a: opacity,
    }), weight });
  }

  return normalized;
}

function getBounds(node: AnyRecord): { x: number; y: number; width: number; height: number } | null {
  function boundsFromAbsoluteTransform(): { x: number; y: number; width: number; height: number } | null {
    const t = Array.isArray(node.absoluteTransform) ? (node.absoluteTransform as unknown[]) : null;
    if (!t || t.length < 2) return null;

    const r0 = Array.isArray(t[0]) ? (t[0] as unknown[]) : null;
    const r1 = Array.isArray(t[1]) ? (t[1] as unknown[]) : null;
    if (!r0 || !r1 || r0.length < 3 || r1.length < 3) return null;

    const a = asNumber(r0[0], NaN);
    const c = asNumber(r0[1], NaN);
    const tx = asNumber(r0[2], NaN);
    const b = asNumber(r1[0], NaN);
    const d = asNumber(r1[1], NaN);
    const ty = asNumber(r1[2], NaN);
    if (![a, b, c, d, tx, ty].every((v) => Number.isFinite(v))) return null;

    const w = asNumber(node.width, NaN);
    const h = asNumber(node.height, NaN);
    if (!Number.isFinite(w) || !Number.isFinite(h)) return null;

    const corners = [
      { x: 0, y: 0 },
      { x: w, y: 0 },
      { x: 0, y: h },
      { x: w, y: h },
    ].map((p) => ({
      x: a * p.x + c * p.y + tx,
      y: b * p.x + d * p.y + ty,
    }));

    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const p of corners) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }

    return {
      x: minX,
      y: minY,
      width: Math.max(0, maxX - minX),
      height: Math.max(0, maxY - minY),
    };
  }

  const bb = isRecord(node.absoluteBoundingBox) ? (node.absoluteBoundingBox as AnyRecord) : null;
  if (bb) {
    const bounds = {
      x: asNumber(bb.x, 0),
      y: asNumber(bb.y, 0),
      width: asNumber(bb.width, asNumber(node.width, 0)),
      height: asNumber(bb.height, asNumber(node.height, 0)),
    };

    // Some exports produce nearly-zero width/height for rotated LINE nodes (and similar).
    // If bounds are degenerate, prefer computing from absoluteTransform + (width,height).
    const minDim = Math.min(bounds.width, bounds.height);
    const maxDim = Math.max(bounds.width, bounds.height);
    const degenerate = minDim < 0.5 && maxDim > 10;
    if (degenerate) {
      return boundsFromAbsoluteTransform() ?? bounds;
    }

    return bounds;
  }

  // Fallbacks for exports that omit absoluteBoundingBox.
  const width = asNumber(node.width, NaN);
  const height = asNumber(node.height, NaN);
  if (Number.isFinite(width) && Number.isFinite(height)) {
    return boundsFromAbsoluteTransform() ?? { x: 0, y: 0, width, height };
  }

  return null;
}

function getCornerRadius(node: AnyRecord): { tl: number; tr: number; bl: number; br: number } | undefined {
  const tl = asNumber(node.topLeftRadius, NaN);
  const tr = asNumber(node.topRightRadius, NaN);
  const bl = asNumber(node.bottomLeftRadius, NaN);
  const br = asNumber(node.bottomRightRadius, NaN);

  if ([tl, tr, bl, br].every((v) => Number.isFinite(v))) {
    return { tl, tr, bl, br };
  }

  const cornerRadius = asNumber(node.cornerRadius, NaN);
  if (Number.isFinite(cornerRadius)) {
    return { tl: cornerRadius, tr: cornerRadius, bl: cornerRadius, br: cornerRadius };
  }

  return undefined;
}

function normalizeNode(input: unknown, ctx: {
  warnings: NormalizedDesignV1["warnings"];
  imageHashes: Set<string>;
  fonts: Set<string>;
  offsetX: number;
  offsetY: number;
  inheritedBg?: { r: number; g: number; b: number };
}): NormalizedNode | null {
  if (!isRecord(input)) return null;

  const id = asString(input.id);
  const figmaType = asString(input.type);
  if (!id || !figmaType) return null;

  const bounds = getBounds(input);
  if (!bounds) {
    ctx.warnings.push({
      code: "missing_bounds",
      message: `Node '${id}' is missing absolute bounds; it may not render correctly until bounds are available.`,
      nodeId: id,
    });
  }

  const visible = input.visible !== false;
  const opacity = asNumber(input.opacity, 1);
  const rotation = asNumber(input.rotation, 0);
  const name = asString(input.name);

  const absT = parseAbsoluteTransform(input);
  const transform = absT
    ? {
        a: absT.a,
        b: absT.b,
        c: absT.c,
        d: absT.d,
        tx: absT.tx - ctx.offsetX,
        ty: absT.ty - ctx.offsetY,
      }
    : undefined;

  const sizeW = asNumber((input as AnyRecord).width, NaN);
  const sizeH = asNumber((input as AnyRecord).height, NaN);
  const size = Number.isFinite(sizeW) && Number.isFinite(sizeH)
    ? { width: sizeW, height: sizeH }
    : bounds
      ? { width: bounds.width, height: bounds.height }
      : undefined;

  const frame = {
    x: (bounds?.x ?? 0) - ctx.offsetX,
    y: (bounds?.y ?? 0) - ctx.offsetY,
    width: bounds?.width ?? 0,
    height: bounds?.height ?? 0,
  };

  let fills = parseFills(input, ctx.warnings, ctx.imageHashes);

  if (figmaType === "TEXT") {
    const characters = asString(input.characters) ?? "";

    const style = isRecord(input.style) ? (input.style as AnyRecord) : null;

    // Some exports omit node-level `fills` on TEXT, but may include them under `style.fills`.
    if (fills.length === 0 && style) {
      fills = parseFills({ fills: (style as AnyRecord).fills, backgrounds: (style as AnyRecord).backgrounds }, ctx.warnings, ctx.imageHashes);
    }

    const fontName = isRecord((input as AnyRecord).fontName)
      ? ((input as AnyRecord).fontName as AnyRecord)
      : null;
    const fontFamilyFromFontName =
      fontName && typeof fontName.family === "string" ? (fontName.family as string) : undefined;

    // Different Figma-export JSONs place font info in slightly different fields.
    // Capture it as robustly as possible so edited SVG text keeps the intended font.
    const styleFontName = style && isRecord(style.fontName) ? (style.fontName as AnyRecord) : null;
    const fontFamilyFromStyleFontName =
      styleFontName && typeof styleFontName.family === "string"
        ? (styleFontName.family as string)
        : undefined;

    // Prefer `fontName.family` when present. Some exports populate `style.fontFamily`
    // with a composite display name (e.g. "Poppins SemiBold"), which won't match
    // Google Fonts or our custom-font store keys, causing edited text to fall back.
    const overrideFontFamily = pickMostCommonFontFamilyFromOverrides(input as AnyRecord);
    const fontFamily =
      cleanFontFamily(
        fontFamilyFromStyleFontName ??
          fontFamilyFromFontName ??
          (style && typeof style.fontFamily === "string" ? (style.fontFamily as string) : undefined) ??
          asString((input as AnyRecord).fontFamily),
      ) ??
      overrideFontFamily ??
      inferFontFamilyFromPostScriptName(
        style && typeof style.fontPostScriptName === "string"
          ? (style.fontPostScriptName as string)
          : undefined,
      );

    const fontStyle: "normal" | "italic" | undefined =
      (style && typeof style.fontStyle === "string"
        ? ((style.fontStyle as string).toLowerCase() === "italic" ? "italic" : "normal")
        : undefined) ??
      (style && typeof style.italic === "boolean" ? (style.italic ? "italic" : "normal") : undefined);

    const textDecoration: "none" | "underline" | "line-through" | undefined =
      style && typeof style.textDecoration === "string"
        ? ((style.textDecoration as string).toLowerCase().includes("underline")
            ? "underline"
            : (style.textDecoration as string).toLowerCase().includes("line-through")
              ? "line-through"
              : "none")
        : undefined;

    if (fontFamily) ctx.fonts.add(fontFamily);

    // If TEXT paints are missing (common in some exports), infer a readable color.
    // This makes text visible instead of defaulting to black on dark backgrounds.
    if (fills.length === 0) {
      const bg = ctx.inheritedBg;
      if (bg) {
        const lum = relativeLuminance(bg);
        const inferred = lum < 0.5
          ? { kind: "solid" as const, css: "rgba(255, 255, 255, 1)" }
          : { kind: "solid" as const, css: "rgba(0, 0, 0, 1)" };
        fills = [inferred];
        ctx.warnings.push({
          code: "text_fill_missing_inferred",
          message: "TEXT node has no fills; inferred a contrasting text color from ancestor background.",
          nodeId: id,
        });
      }
    }

    const fillGeometry = Array.isArray((input as AnyRecord).fillGeometry)
      ? ((input as AnyRecord).fillGeometry as unknown[])
      : [];
    const outlinePaths: string[] = [];
    for (const g of fillGeometry) {
      if (!isRecord(g)) continue;
      const data = asString(g.data);
      if (data) outlinePaths.push(data);
    }

    return {
      id,
      name,
      figmaType,
      kind: "text",
      visible,
      opacity,
      rotation,
      transform,
      size,
      frame,
      fills,
      text: {
        characters,
        outlinePaths: outlinePaths.length ? outlinePaths : undefined,
        fontSize: asOptionalNumber((input as AnyRecord).fontSize) ?? (style ? asOptionalNumber(style.fontSize) : undefined),
        fontWeight: asOptionalNumber((input as AnyRecord).fontWeight) ?? (style ? asOptionalNumber(style.fontWeight) : undefined),
        fontFamily,
        fontStyle,
        lineHeight: isRecord(input.lineHeight)
          ? {
              unit: asString(input.lineHeight.unit) ?? "AUTO",
              value: asOptionalNumber((input.lineHeight as AnyRecord).value),
            }
          : undefined,
        letterSpacing: isRecord(input.letterSpacing) && typeof input.letterSpacing.value === "number"
          ? {
              unit: asString(input.letterSpacing.unit) ?? "PERCENT",
              value: asNumber(input.letterSpacing.value, 0),
            }
          : undefined,
        textAlignHorizontal: asString(input.textAlignHorizontal),
        textAlignVertical: asString(input.textAlignVertical),
        textCase: asString(input.textCase),
        textDecoration,
      },
    };
  }

  const strokes = parseStrokes(input);
  const cornerRadius = getCornerRadius(input);

  const containerTypes = new Set(["FRAME", "GROUP", "COMPONENT", "INSTANCE", "SECTION"]);
  const shapeTypes = new Set([
    "RECTANGLE",
    "ELLIPSE",
    "LINE",
    "VECTOR",
    "POLYGON",
    "STAR",
    "BOOLEAN_OPERATION",
  ]);

  if (containerTypes.has(figmaType)) {
    return {
      id,
      name,
      figmaType,
      kind: "container",
      visible,
      opacity,
      rotation,
      transform,
      size,
      frame,
      clipsContent: (input as AnyRecord).clipsContent === true,
      fills,
      strokes,
      cornerRadius,
    };
  }

  if (shapeTypes.has(figmaType)) {
    const fillGeometry = Array.isArray((input as AnyRecord).fillGeometry)
      ? ((input as AnyRecord).fillGeometry as unknown[])
      : [];

    const strokeGeometry = Array.isArray((input as AnyRecord).strokeGeometry)
      ? ((input as AnyRecord).strokeGeometry as unknown[])
      : [];

    const vectorPaths: string[] = [];
    for (const g of fillGeometry) {
      if (!isRecord(g)) continue;
      const data = asString(g.data);
      if (data) vectorPaths.push(data);
    }

    // Many exports store LINE geometry under strokeGeometry only.
    for (const g of strokeGeometry) {
      if (!isRecord(g)) continue;
      const data = asString(g.data);
      if (data) vectorPaths.push(data);
    }

    // If a vector-like node has fills/strokes but no geometry, it will render as “missing icon”.
    // This is typical of legacy exporters that omit SVG/path data.
    const isVectorLike = figmaType === "VECTOR" || figmaType === "LINE" || figmaType === "BOOLEAN_OPERATION";
    const hasPaint = fills.length > 0 || strokes.length > 0;
    if (isVectorLike && hasPaint && vectorPaths.length === 0) {
      ctx.warnings.push({
        code: "vector_geometry_missing",
        message:
          "A vector layer has fills/strokes but no path geometry (fillGeometry/strokeGeometry missing). Icons may render blank unless the exporter includes vector paths.",
        nodeId: id,
      });
    }

    return {
      id,
      name,
      figmaType,
      kind: "shape",
      visible,
      opacity,
      rotation,
      transform,
      size,
      frame,
      fills,
      strokes,
      cornerRadius,
      vectorPaths: vectorPaths.length ? vectorPaths : undefined,
    };
  }

  // Preserve unknown node types as containers so the tree stays intact.
  ctx.warnings.push({
    code: "unknown_node_type",
    message: `Unsupported node type '${figmaType}' preserved as a container placeholder.`,
    nodeId: id,
  });

  return {
    id,
    name,
    figmaType,
    kind: "container",
    visible,
    opacity,
    rotation,
    transform,
    size,
    frame,
    clipsContent: (input as AnyRecord).clipsContent === true,
    fills,
    strokes,
    cornerRadius,
  };
}

function collectBounds(node: unknown, acc: { minX: number; minY: number; maxX: number; maxY: number }) {
  if (!isRecord(node)) return;
  const bb = isRecord(node.absoluteBoundingBox) ? (node.absoluteBoundingBox as AnyRecord) : null;
  if (bb) {
    const x = asNumber(bb.x, NaN);
    const y = asNumber(bb.y, NaN);
    const w = asNumber(bb.width, NaN);
    const h = asNumber(bb.height, NaN);
    if ([x, y, w, h].every((v) => Number.isFinite(v))) {
      acc.minX = Math.min(acc.minX, x);
      acc.minY = Math.min(acc.minY, y);
      acc.maxX = Math.max(acc.maxX, x + w);
      acc.maxY = Math.max(acc.maxY, y + h);
    }
  }
  for (const child of getChildNodes(node)) collectBounds(child, acc);
}

export function normalizeFigmaExport(input: unknown): NormalizedDesignV1 {
  const adapted = adaptLegacyTreeToFigmaExport(input);
  const parsed = FigmaExportSchema.safeParse(adapted ?? input);
  const root = parsed.success ? parsed.data : (isRecord(input) ? (input as AnyRecord) : {});

  const warnings: NormalizedDesignV1["warnings"] = [];
  const imageHashes = new Set<string>();
  const fonts = new Set<string>();

  const document = isRecord(root.document) ? (root.document as AnyRecord) : undefined;
  const docChildren = document ? getChildNodes(document) : [];

  const pages = docChildren.filter((n) => isRecord(n) && asString((n as AnyRecord).type) === "PAGE");
  const page = pages[0] as unknown | undefined;

  if (pages.length > 1) {
    warnings.push({
      code: "multiple_pages",
      message: `Multiple pages detected (${pages.length}). The first page is used for normalization in this phase.`,
    });
  }

  const pageChildren = page ? getChildNodes(page) : docChildren;

  if (pageChildren.length === 0) {
    warnings.push({
      code: "empty_document",
      message: "No nodes found under the selected page/document.",
    });
  }

  if (adapted) {
    warnings.push({
      code: "legacy_import_adapted",
      message:
        "Detected a non-Figma JSON format and adapted it into a Figma-like shape (document/page/bounds). If something is missing (e.g. gradients), ensure your exporter includes full paint data.",
    });
  }

  // Determine global bounds and offset so the canvas starts at (0,0).
  const acc = { minX: Number.POSITIVE_INFINITY, minY: Number.POSITIVE_INFINITY, maxX: Number.NEGATIVE_INFINITY, maxY: Number.NEGATIVE_INFINITY };
  for (const n of pageChildren) collectBounds(n, acc);

  const offsetX = Number.isFinite(acc.minX) ? acc.minX : 0;
  const offsetY = Number.isFinite(acc.minY) ? acc.minY : 0;

  const width = Number.isFinite(acc.maxX - acc.minX) ? Math.max(0, acc.maxX - acc.minX) : 0;
  const height = Number.isFinite(acc.maxY - acc.minY) ? Math.max(0, acc.maxY - acc.minY) : 0;

  // Background from PAGE backgrounds (if present)
  let backgroundCss: string | undefined;
  if (page && isRecord(page) && Array.isArray((page as AnyRecord).backgrounds)) {
    const bgs = (page as AnyRecord).backgrounds as unknown[];
    const solid = bgs.find((b) => isRecord(b) && asString((b as AnyRecord).type) === "SOLID") as AnyRecord | undefined;
    if (solid && isRecord(solid.color)) {
      backgroundCss = rgbaCss({
        r: asNumber((solid.color as AnyRecord).r, 0),
        g: asNumber((solid.color as AnyRecord).g, 0),
        b: asNumber((solid.color as AnyRecord).b, 0),
        a: asNumber(solid.opacity, 1),
      });
    }
  }

  const nodesById: Record<string, NormalizedNode> = {};
  const childrenById: Record<string, string[]> = {};

  function walk(node: unknown, parentId: string | null, inheritedBg?: { r: number; g: number; b: number }) {
    const normalized = normalizeNode(node, { warnings, imageHashes, fonts, offsetX, offsetY, inheritedBg });
    if (!normalized) {
      for (const child of getChildNodes(node)) walk(child, parentId, inheritedBg);
      return;
    }

    nodesById[normalized.id] = normalized;

    if (parentId) {
      childrenById[parentId] = childrenById[parentId] ?? [];
      childrenById[parentId].push(normalized.id);
    }

    const childNodes = getChildNodes(node);
    if (childNodes.length) {
      childrenById[normalized.id] = childrenById[normalized.id] ?? [];

      let nextBg = inheritedBg;
      if (isRecord(node)) {
        const solid = firstSolidPaint(node);
        if (solid) nextBg = { r: solid.r, g: solid.g, b: solid.b };
      }

      for (const child of childNodes) walk(child, normalized.id, nextBg);
    }
  }

  const rootIds: string[] = [];
  for (const node of pageChildren) {
    const normalized = normalizeNode(node, { warnings, imageHashes, fonts, offsetX, offsetY, inheritedBg: undefined });
    if (!normalized) continue;
    rootIds.push(normalized.id);
    // walk will re-normalize root; that's OK but avoid double-write by walking children only.
    nodesById[normalized.id] = normalized;

    let rootBg: { r: number; g: number; b: number } | undefined;
    if (isRecord(node)) {
      const solid = firstSolidPaint(node as AnyRecord);
      if (solid) rootBg = { r: solid.r, g: solid.g, b: solid.b };
    }

    for (const child of getChildNodes(node)) walk(child, normalized.id, rootBg);
  }

  const allNodes = Object.values(nodesById);
  const stats = {
    nodeCount: allNodes.length,
    textCount: allNodes.filter((n) => n.kind === "text").length,
    imageCount: allNodes.filter((n) =>
      (n.kind === "shape" || n.kind === "container") && n.fills.some((f) => f.kind === "image"),
    ).length,
    shapeCount: allNodes.filter((n) => n.kind === "shape").length,
    containerCount: allNodes.filter((n) => n.kind === "container").length,
  };

  return {
    version: 1,
    source: "figma",
    sourceName: typeof root.name === "string" ? root.name : undefined,
    rootIds,
    canvas: {
      width,
      height,
      background: backgroundCss ? { css: backgroundCss } : undefined,
      offsetX,
      offsetY,
    },
    nodesById,
    childrenById,
    stats,
    assets: {
      imageHashes: [...imageHashes],
      fonts: [...fonts],
    },
    warnings,
  };
}
