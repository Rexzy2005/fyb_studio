import { Canvg } from "canvg";

import type { NormalizedDesignV1, NormalizedNode } from "@/lib/figma";
import { drawImageCoverContain, drawImagePlaceholder } from "@/lib/render/drawImage";
import { applyTextCase, resolveEffectiveTextCase } from "@/lib/render/textCase";
import type { FieldConfig } from "@/lib/storage/types";
import { ensureGoogleFontsLoaded } from "@/lib/fonts/googleFonts";
import { createLocalTemplateRepository } from "@/lib/storage/templateRepo";

export type ExportPngInput = {
  design: NormalizedDesignV1;
  fieldConfig: FieldConfig;
  previewTextByNodeId?: Record<string, string>;
  previewImageByNodeId?: Record<string, { blob: Blob; objectFit: "cover" | "contain" }>;
  previewColorByNodeId?: Record<string, string>;
  scale: number;
};

export async function exportTemplatePng({
  design,
  fieldConfig,
  previewTextByNodeId = {},
  previewImageByNodeId = {},
  previewColorByNodeId = {},
  scale,
}: ExportPngInput): Promise<{ blob: Blob; width: number; height: number }> {
  if (typeof window === "undefined") {
    throw new Error("PNG export must run in the browser");
  }

  // Ensure fonts are present before any text measurement/layout.
  // This prevents exports rendering with fallback fonts on first run.
  await ensureGoogleFontsLoaded(design.assets?.fonts ?? []);
  await ensureCustomFontsLoaded(design.assets?.fonts ?? []);

  const width = Math.max(1, Math.round(design.canvas.width));
  const height = Math.max(1, Math.round(design.canvas.height));

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to create 2D context");
  const ctx2: CanvasRenderingContext2D = ctx;

  // Draw shapes at design coordinates scaled up.
  ctx2.setTransform(scale, 0, 0, scale, 0, 0);


  // Background
  ctx2.clearRect(0, 0, width, height);
  ctx2.fillStyle = design.canvas.background?.css ?? "white";
  ctx2.fillRect(0, 0, width, height);

  const colorOverrideByNodeId: Record<string, string> = {};
  for (const f of fieldConfig.fields) {
    if (f.kind !== "color") continue;
    if ((f.colorBehavior?.enabled ?? true) === false) continue;
    const paletteFirst = f.colorBehavior?.palette?.[0];
    const value = previewColorByNodeId[f.nodeId] ?? paletteFirst;
    if (value) colorOverrideByNodeId[f.nodeId] = value;
  }

  async function drawNodeSelf(node: Exclude<NormalizedNode, { kind: "text" }>) {
    // Draw the node itself in a nested save/restore so rotation doesn't break descendants.
    ctx2.save();

    const canUseMatrix = Boolean(node.transform && node.size);
    let baseTransform: DOMMatrix | null = null;
    let nodeSpaceTransform: DOMMatrix | null = null;
    if (canUseMatrix && node.transform && node.size) {
      baseTransform = ctx2.getTransform();
      ctx2.transform(node.transform.a, node.transform.b, node.transform.c, node.transform.d, node.transform.tx, node.transform.ty);
      nodeSpaceTransform = ctx2.getTransform();
    } else if (node.rotation && Math.abs(node.rotation) > 0.001) {
      const cx = node.frame.x + node.frame.width / 2;
      const cy = node.frame.y + node.frame.height / 2;
      ctx2.translate(cx, cy);
      ctx2.rotate((node.rotation * Math.PI) / 180);
      ctx2.translate(-cx, -cy);
    }

    const localW = node.size?.width ?? node.frame.width;
    const localH = node.size?.height ?? node.frame.height;

    function boundsPathAt(x: number, y: number, width: number, height: number) {
      const p = new Path2D();
      const r = node.cornerRadius;
      if (r && (r.tl || r.tr || r.br || r.bl)) {
        const tl = clampRadius(r.tl, width, height);
        const tr = clampRadius(r.tr, width, height);
        const br = clampRadius(r.br, width, height);
        const bl = clampRadius(r.bl, width, height);

        p.moveTo(x + tl, y);
        p.lineTo(x + width - tr, y);
        p.quadraticCurveTo(x + width, y, x + width, y + tr);
        p.lineTo(x + width, y + height - br);
        p.quadraticCurveTo(x + width, y + height, x + width - br, y + height);
        p.lineTo(x + bl, y + height);
        p.quadraticCurveTo(x, y + height, x, y + height - bl);
        p.lineTo(x, y + tl);
        p.quadraticCurveTo(x, y, x + tl, y);
        p.closePath();
      } else {
        p.rect(x, y, width, height);
      }
      return p;
    }

    function clipLocal() {
      if (node.kind === "shape" && node.vectorPaths?.length) {
        try {
          const p = buildCompoundVectorPath(node.vectorPaths);
          if (!p) throw new Error("No valid vector paths");
          const local = areLikelyLocalSvgPaths(node.vectorPaths, { x: 0, y: 0, width: localW, height: localH });
          if (local) {
            ctx2.clip(p);
            return;
          }

          // Absolute geometry: temporarily drop the node transform.
          if (baseTransform && nodeSpaceTransform) {
            ctx2.setTransform(baseTransform);
            ctx2.clip(p);
            ctx2.setTransform(nodeSpaceTransform);
            return;
          }
        } catch {
          // fall back
        }
      }

      ctx2.clip(boundsPathAt(0, 0, localW, localH));
    }

    function clipNonMatrix() {
      if (node.kind === "shape" && node.vectorPaths?.length) {
        try {
          const p = buildCompoundVectorPath(node.vectorPaths);
          if (!p) throw new Error("No valid vector paths");
          const local = areLikelyLocalSvgPaths(node.vectorPaths, node.frame);
          if (local) {
            ctx2.translate(node.frame.x, node.frame.y);
            ctx2.clip(p);
            ctx2.translate(-node.frame.x, -node.frame.y);
            return;
          }

          ctx2.clip(p);
          return;
        } catch {
          // fall back
        }
      }

      clipNode(ctx2, node);
    }

    function fillLocal() {
      if (node.kind === "shape" && node.vectorPaths?.length) {
        try {
          const p = buildCompoundVectorPath(node.vectorPaths);
          if (!p) throw new Error("No valid vector paths");
          const local = areLikelyLocalSvgPaths(node.vectorPaths, { x: 0, y: 0, width: localW, height: localH });
          if (local) {
            ctx2.fill(p);
            return;
          }

          // Absolute geometry: temporarily drop the node transform.
          if (baseTransform && nodeSpaceTransform) {
            ctx2.setTransform(baseTransform);
            ctx2.fill(p);
            ctx2.setTransform(nodeSpaceTransform);
            return;
          }
        } catch {
          // fall back
        }
      }
      ctx2.fill(boundsPathAt(0, 0, localW, localH));
    }

    function strokeLocal() {
      if (node.kind === "shape" && node.vectorPaths?.length) {
        try {
          const p = buildCompoundVectorPath(node.vectorPaths);
          if (!p) throw new Error("No valid vector paths");
          const local = areLikelyLocalSvgPaths(node.vectorPaths, { x: 0, y: 0, width: localW, height: localH });
          if (local) {
            ctx2.stroke(p);
            return;
          }

          if (baseTransform && nodeSpaceTransform) {
            ctx2.setTransform(baseTransform);
            ctx2.stroke(p);
            ctx2.setTransform(nodeSpaceTransform);
            return;
          }
        } catch {
          // fall back
        }
      }
      ctx2.stroke(boundsPathAt(0, 0, localW, localH));
    }

    const overrideColor = colorOverrideByNodeId[node.id];

    // Fills
    if (overrideColor) {
      ctx2.fillStyle = overrideColor;
      if (canUseMatrix) fillLocal();
      else fillNode(ctx2, node);
    } else {
      for (const fill of node.fills) {
        if (fill.kind === "solid") {
          ctx2.fillStyle = fill.css;
          if (canUseMatrix) fillLocal();
          else fillNode(ctx2, node);
        } else if (fill.kind === "gradient") {
          const g = createGradient(ctx2, node, fill, canUseMatrix ? { x: 0, y: 0, width: localW, height: localH } : undefined);
          if (g) {
            ctx2.fillStyle = g;
            if (canUseMatrix) fillLocal();
            else fillNode(ctx2, node);
          }
        } else if (fill.kind === "image") {
          const override = previewImageByNodeId[node.id];
          ctx2.save();
          if (canUseMatrix) clipLocal();
          else clipNonMatrix();

          if (override) {
            const bmp = await createImageBitmap(override.blob);
            drawImageCoverContain(
              ctx2,
              bmp,
              canUseMatrix ? 0 : node.frame.x,
              canUseMatrix ? 0 : node.frame.y,
              canUseMatrix ? localW : node.frame.width,
              canUseMatrix ? localH : node.frame.height,
              override.objectFit,
            );
          } else {
            drawImagePlaceholder(
              ctx2,
              canUseMatrix ? 0 : node.frame.x,
              canUseMatrix ? 0 : node.frame.y,
              canUseMatrix ? localW : node.frame.width,
              canUseMatrix ? localH : node.frame.height,
              { label: "IMAGE" },
            );
          }

          ctx2.restore();
        }
      }
    }

    // Strokes
    for (const s of node.strokes) {
      if (s.weight <= 0) continue;
      ctx2.strokeStyle = s.css;
      ctx2.lineWidth = s.weight;
      if (canUseMatrix) strokeLocal();
      else strokeNode(ctx2, node);
    }

    ctx2.restore();
  }

  async function renderNode(id: string, inheritedAlpha: number) {
    const node = design.nodesById[id] as NormalizedNode | undefined;
    if (!node) return;
    if (!node.visible) return;
    const alpha = inheritedAlpha * Math.max(0, Math.min(1, node.opacity));
    if (alpha <= 0) return;

    ctx2.save();
    ctx2.globalAlpha = alpha;

    if (node.kind === "container" && node.clipsContent) {
      clipNode(ctx2, node);
    }

    if (node.kind !== "text") {
      await drawNodeSelf(node);
    }

    const children = design.childrenById[id] ?? [];
    for (const childId of children) {
      await renderNode(childId, alpha);
    }

    ctx2.restore();
  }

  for (const rootId of design.rootIds) {
    await renderNode(rootId, 1);
  }

  // Render text layer via SVG (fonts resolved by browser). We intentionally omit field outlines.
  // Reset transform so Canvg can apply its own scaling.
  ctx2.setTransform(1, 0, 0, 1, 0, 0);

  const svg = buildTextSvg({ design, fieldConfig, previewTextByNodeId, includeGuides: false });
  const v = await Canvg.fromString(ctx2, svg, {
    ignoreDimensions: true,
    ignoreClear: true,
    scaleWidth: canvas.width,
    scaleHeight: canvas.height,
  });
  await v.render();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Failed to export PNG"))), "image/png");
  });

  return { blob, width, height };
}

function normalizeFontFamily(raw: string) {
  const first = raw.split(",")[0]?.trim();
  if (!first) return "";
  return first.replace(/^['\"]/, "").replace(/['\"]$/, "").trim();
}

const loadedCustomFontFamilies = new Set<string>();

async function ensureCustomFontsLoaded(fontFamilies: string[]) {
  if (fontFamilies.length === 0) return;

  const families = [...new Set(fontFamilies.map(normalizeFontFamily).filter(Boolean))];
  if (families.length === 0) return;

  const repo = createLocalTemplateRepository();

  for (const family of families) {
    if (loadedCustomFontFamilies.has(family)) continue;

    // If already available (system-installed or already loaded), treat as loaded.
    try {
      if (document.fonts?.check(`12px "${family}"`)) {
        loadedCustomFontFamilies.add(family);
        continue;
      }
    } catch {
      // ignore
    }

    const record = await repo.getFont(family);
    if (!record) continue;

    let url: string | null = null;
    try {
      url = URL.createObjectURL(record.blob);
      const face = new FontFace(family, `url(${url})`);
      await face.load();
      document.fonts.add(face);
      loadedCustomFontFamilies.add(family);
      // Best-effort settle. Some browsers still need a load() call to fully resolve.
      await document.fonts.load(`12px "${family}"`);
    } catch {
      // ignore; fall back to installed/Google fonts
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  }
}

function clampRadius(r: number, w: number, h: number) {
  return Math.max(0, Math.min(r, Math.min(w, h) / 2));
}

function boundsPath(node: Exclude<NormalizedNode, { kind: "text" }>) {
  const p = new Path2D();
  const { x, y, width, height } = node.frame;
  const r = node.cornerRadius;
  if (r && (r.tl || r.tr || r.br || r.bl)) {
    const tl = clampRadius(r.tl, width, height);
    const tr = clampRadius(r.tr, width, height);
    const br = clampRadius(r.br, width, height);
    const bl = clampRadius(r.bl, width, height);

    p.moveTo(x + tl, y);
    p.lineTo(x + width - tr, y);
    p.quadraticCurveTo(x + width, y, x + width, y + tr);
    p.lineTo(x + width, y + height - br);
    p.quadraticCurveTo(x + width, y + height, x + width - br, y + height);
    p.lineTo(x + bl, y + height);
    p.quadraticCurveTo(x, y + height, x, y + height - bl);
    p.lineTo(x, y + tl);
    p.quadraticCurveTo(x, y, x + tl, y);
    p.closePath();
  } else {
    p.rect(x, y, width, height);
  }
  return p;
}

function fillNode(ctx: CanvasRenderingContext2D, node: Exclude<NormalizedNode, { kind: "text" }>) {
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

function strokeNode(ctx: CanvasRenderingContext2D, node: Exclude<NormalizedNode, { kind: "text" }>) {
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

function clipNode(ctx: CanvasRenderingContext2D, node: Exclude<NormalizedNode, { kind: "text" }>) {
  if (node.transform && node.size) {
    const prev = ctx.getTransform();
    ctx.transform(node.transform.a, node.transform.b, node.transform.c, node.transform.d, node.transform.tx, node.transform.ty);
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
      p.quadraticCurveTo(node.size.width, node.size.height, node.size.width - br, node.size.height);
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

function createGradient(
  ctx: CanvasRenderingContext2D,
  node: Exclude<NormalizedNode, { kind: "text" }>,
  fill: Extract<Exclude<NormalizedNode, { kind: "text" }> ["fills"][number], { kind: "gradient" }>,
  frameOverride?: { x: number; y: number; width: number; height: number },
): CanvasGradient | null {
  const { x, y, width, height } = frameOverride ?? node.frame;

  if (fill.gradientType === "linear") {
    const h0 = fill.handlePositions?.[0];
    const h1 = fill.handlePositions?.[1];
    const x0 = x + (h0 ? h0.x * width : 0);
    const y0 = y + (h0 ? h0.y * height : 0);
    const x1 = x + (h1 ? h1.x * width : width);
    const y1 = y + (h1 ? h1.y * height : 0);

    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    for (const s of fill.stops) g.addColorStop(s.offset, s.colorCss);
    return g;
  }

  if (fill.gradientType === "radial") {
    const cx = x + width / 2;
    const cy = y + height / 2;
    const r = Math.max(width, height) / 2;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    for (const s of fill.stops) g.addColorStop(s.offset, s.colorCss);
    return g;
  }

  return null;
}

function buildTextSvg({
  design,
  fieldConfig,
  previewTextByNodeId,
  includeGuides,
}: {
  design: NormalizedDesignV1;
  fieldConfig: FieldConfig;
  previewTextByNodeId: Record<string, string>;
  includeGuides: boolean;
}): string {
  const configured = new Map(fieldConfig.fields.map((f) => [f.nodeId, f] as const));

  const measureCtx = (() => {
    const canvas = document.createElement("canvas");
    return canvas.getContext("2d");
  })();

  const defs: string[] = [];
  const clipIdByNodeId = new Map<string, string>();
  const textClipIdByNodeId = new Map<string, string>();
  const textLocalClipIdByNodeId = new Map<string, string>();

  function clampNumber(value: unknown, min: number, max: number): number {
    const n = typeof value === "number" && Number.isFinite(value) ? value : NaN;
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  function computeLineHeightPx(
    lineHeight: { unit: string; value?: number } | undefined,
    fontSize: number,
    baseFontSize: number,
  ) {
    const lh = lineHeight;
    if (!lh) return Math.round(fontSize * 1.2);
    if (lh.unit === "PIXELS" && typeof lh.value === "number") {
      const ratio = baseFontSize > 0 ? fontSize / baseFontSize : 1;
      return lh.value * ratio;
    }
    if (lh.unit === "PERCENT" && typeof lh.value === "number") return (lh.value / 100) * fontSize;
    return Math.round(fontSize * 1.2);
  }

  function letterSpacingPx(letterSpacing: { unit: string; value: number } | undefined, fontSize: number) {
    const ls = letterSpacing;
    if (!ls) return 0;
    if (ls.unit === "PERCENT") return (ls.value / 100) * fontSize;
    return ls.value;
  }

  function measureTextWidth(text: string, font: string, extraLetterSpacingPx: number) {
    if (!measureCtx) return text.length * 8;
    measureCtx.font = font;
    const w = measureCtx.measureText(text).width;
    const ls = text.length > 1 ? (text.length - 1) * extraLetterSpacingPx : 0;
    return w + ls;
  }

  function wrapToWidth(input: string, maxWidth: number, font: string, extraLetterSpacingPx: number) {
    const tokens = input.split(/(\s+)/);
    const out: string[] = [];
    let line = "";

    function pushLine() {
      out.push(line.trimEnd());
      line = "";
    }

    for (const t of tokens) {
      const candidate = line + t;
      if (!line) {
        line = t;
        continue;
      }
      if (measureTextWidth(candidate, font, extraLetterSpacingPx) <= maxWidth) {
        line = candidate;
        continue;
      }

      if (measureTextWidth(t, font, extraLetterSpacingPx) > maxWidth) {
        pushLine();
        let chunk = "";
        for (const ch of t) {
          const next = chunk + ch;
          if (measureTextWidth(next, font, extraLetterSpacingPx) <= maxWidth || !chunk) {
            chunk = next;
          } else {
            out.push(chunk);
            chunk = ch;
          }
        }
        line = chunk;
      } else {
        pushLine();
        line = t;
      }
    }

    if (line.trim().length) pushLine();
    return out.length ? out : [""];
  }

  function ensureClipPath(node: Extract<NormalizedNode, { kind: "container" }>) {
    const existing = clipIdByNodeId.get(node.id);
    if (existing) return existing;
    const clipId = `clip-${node.id}`;
    clipIdByNodeId.set(node.id, clipId);
    const r = node.cornerRadius;
    const rx = r ? Math.max(r.tl, r.tr, r.bl, r.br) : 0;
    defs.push(
      `<clipPath id=\"${escapeAttr(clipId)}\"><rect x=\"${node.frame.x}\" y=\"${node.frame.y}\" width=\"${node.frame.width}\" height=\"${node.frame.height}\" rx=\"${rx}\" ry=\"${rx}\" /></clipPath>`,
    );
    return clipId;
  }

  function ensureTextClipPath(node: Extract<NormalizedNode, { kind: "text" }>) {
    const existing = textClipIdByNodeId.get(node.id);
    if (existing) return existing;
    const clipId = `clip-text-${node.id}`;
    textClipIdByNodeId.set(node.id, clipId);
    defs.push(
      `<clipPath id="${escapeAttr(clipId)}" clipPathUnits="userSpaceOnUse"><rect x="${node.frame.x}" y="${node.frame.y}" width="${node.frame.width}" height="${node.frame.height}" /></clipPath>`,
    );
    return clipId;
  }

  function ensureTextLocalClipPath(node: Extract<NormalizedNode, { kind: "text" }>, localW: number, localH: number) {
    const existing = textLocalClipIdByNodeId.get(node.id);
    if (existing) return existing;
    const clipId = `clip-text-local-${node.id}`;
    textLocalClipIdByNodeId.set(node.id, clipId);
    defs.push(
      `<clipPath id="${escapeAttr(clipId)}" clipPathUnits="userSpaceOnUse"><rect x="0" y="0" width="${localW}" height="${localH}" /></clipPath>`,
    );
    return clipId;
  }

  function renderTextNode(node: Extract<NormalizedNode, { kind: "text" }>) {
    const fill = node.fills[0];
    const fillCss = fill?.kind === "solid" ? fill.css : "#000";

    const field = configured.get(node.id);
    const override = previewTextByNodeId[node.id];
    const isOverridden = Object.prototype.hasOwnProperty.call(previewTextByNodeId, node.id);
    const maxChars = field?.kind === "text" ? field.maxChars : undefined;
    const charactersRaw = override ?? node.text.characters;
    const characters =
      typeof maxChars === "number" && maxChars > 0
        ? charactersRaw.slice(0, maxChars)
        : charactersRaw;

    const outlinePaths = node.text.outlinePaths;
    if (!isOverridden && outlinePaths?.length) {
      const sizeW = node.size?.width ?? node.frame.width;
      const sizeH = node.size?.height ?? node.frame.height;
      const local = isLikelyLocalSvgPath(outlinePaths[0], { x: 0, y: 0, width: sizeW, height: sizeH });
      const m = node.transform;

      const paths = outlinePaths
        .map((d) => `<path d="${escapeAttr(d)}" fill="${escapeAttr(fillCss)}" />`)
        .join("");

      if (local && m) {
        const matrix = `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.tx} ${m.ty})`;
        return `<g transform="${escapeAttr(matrix)}">${paths}</g>`;
      }

      // Fallback: translate by axis-aligned frame origin.
      const translate = local ? ` transform="translate(${node.frame.x} ${node.frame.y})"` : "";
      return `<g${translate}>${paths}</g>`;
    }

    const resolvedText = {
      fontSize: node.text.fontSize ?? 12,
      fontWeight: node.text.fontWeight ?? 400,
      fontFamily: node.text.fontFamily ?? "system-ui, -apple-system, Segoe UI, Roboto, Arial",
      fontStyle: node.text.fontStyle ?? "normal",
      lineHeight: node.text.lineHeight,
      letterSpacing: node.text.letterSpacing,
      textAlignHorizontal: node.text.textAlignHorizontal ?? "LEFT",
      textAlignVertical: node.text.textAlignVertical ?? "TOP",
      textCase: node.text.textCase,
      textDecoration: node.text.textDecoration ?? "none",
    };

    const effectiveTextCase = resolveEffectiveTextCase(resolvedText.textCase, field?.kind === "text" ? field.textBehavior?.case : undefined);
    const displayed = applyTextCase(characters, effectiveTextCase);
    const baseFontSize = resolvedText.fontSize;

    const localW = node.size?.width ?? node.frame.width;
    const localH = node.size?.height ?? node.frame.height;
    const m = node.transform;
    const useMatrixForOverriddenText = Boolean(isOverridden && m && localW > 0 && localH > 0);

    const behavior = field?.kind === "text"
      ? {
          autoScale: field.textBehavior?.autoScale ?? true,
        minFontSize: field.textBehavior?.minFontSize ?? baseFontSize,
          maxFontSize: field.textBehavior?.maxFontSize ?? baseFontSize,
          overflow: field.textBehavior?.overflow ?? "shrink",
        }
      : null;

    const fontFamily = resolvedText.fontFamily;
    const fontStyle = resolvedText.fontStyle;
    const textDecoration = resolvedText.textDecoration;

    function layoutAt(fontSizeCandidate: number) {
      const lh = computeLineHeightPx(resolvedText.lineHeight, fontSizeCandidate, baseFontSize);
      const ls = letterSpacingPx(resolvedText.letterSpacing, fontSizeCandidate);
      const font = `${fontStyle} ${resolvedText.fontWeight} ${fontSizeCandidate}px ${fontFamily}`;
      let lines: string[];

      const layoutW = useMatrixForOverriddenText ? localW : node.frame.width;
      const layoutH = useMatrixForOverriddenText ? localH : node.frame.height;

      if (behavior?.overflow === "wrap") {
        const paras = displayed.split("\n");
        lines = paras.flatMap((p) => wrapToWidth(p, Math.max(1, layoutW), font, ls));
      } else {
        lines = displayed.split("\n");
      }

      const maxW = lines.reduce((m, line) => Math.max(m, measureTextWidth(line, font, ls)), 0);
      const h = lines.length * lh;
      return { fontSize: fontSizeCandidate, lineHeightPx: lh, lines, maxW, h, layoutW, layoutH };
    }

    let layout = layoutAt(baseFontSize);
    const shouldConstrain = Boolean(behavior);

    if (behavior?.autoScale || behavior?.overflow === "shrink") {
      const minFs = clampNumber(behavior.minFontSize, 1, 512);
      const maxFs = clampNumber(behavior.maxFontSize, minFs, 512);
      let lo = minFs;
      let hi = maxFs;
      let best = layoutAt(lo);
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2;
        const cand = layoutAt(mid);
        const fits = cand.maxW <= cand.layoutW + 0.25 && cand.h <= cand.layoutH + 0.25;
        if (fits) {
          best = cand;
          lo = mid;
        } else {
          hi = mid;
        }
      }
      layout = best;
    }

    const textBlockHeight = layout.lines.length * layout.lineHeightPx;

    const baseY =
      useMatrixForOverriddenText
        ? resolvedText.textAlignVertical === "CENTER"
          ? (localH - textBlockHeight) / 2
          : resolvedText.textAlignVertical === "BOTTOM"
            ? localH - textBlockHeight
            : 0
        : resolvedText.textAlignVertical === "CENTER"
          ? node.frame.y + (node.frame.height - textBlockHeight) / 2
          : resolvedText.textAlignVertical === "BOTTOM"
            ? node.frame.y + node.frame.height - textBlockHeight
            : node.frame.y;

    const anchor =
      resolvedText.textAlignHorizontal === "CENTER"
        ? "middle"
        : resolvedText.textAlignHorizontal === "RIGHT"
          ? "end"
          : "start";

    const x =
      useMatrixForOverriddenText
        ? anchor === "middle"
          ? localW / 2
          : anchor === "end"
            ? localW
            : 0
        : anchor === "middle"
          ? node.frame.x + node.frame.width / 2
          : anchor === "end"
            ? node.frame.x + node.frame.width
            : node.frame.x;

    const y = baseY;

    const rotated = !useMatrixForOverriddenText && node.rotation && Math.abs(node.rotation) > 0.001;
    const cx = node.frame.x + node.frame.width / 2;
    const cy = node.frame.y + node.frame.height / 2;
    const transform = rotated ? `rotate(${node.rotation} ${cx} ${cy})` : "";

    const tspans = layout.lines
      .map(
        (line, idx) =>
          `<tspan x=\"${x}\" dy=\"${idx === 0 ? 0 : layout.lineHeightPx}\">${escapeText(line)}</tspan>`,
      )
      .join("");

    const letterSpacingCss =
      resolvedText.letterSpacing?.unit === "PERCENT"
        ? `${(resolvedText.letterSpacing.value / 100) * layout.fontSize}px`
        : `${resolvedText.letterSpacing?.value ?? 0}px`;

    const textEl = `<text xml:space=\"preserve\" x=\"${x}\" y=\"${y}\" fill=\"${escapeAttr(fillCss)}\" font-size=\"${layout.fontSize}\" font-weight=\"${resolvedText.fontWeight}\" font-style=\"${fontStyle}\" text-decoration=\"${textDecoration}\" text-anchor=\"${anchor}\" dominant-baseline=\"hanging\" ${transform ? `transform=\"${escapeAttr(transform)}\"` : ""} style=\"white-space:pre;font-family:${escapeAttr(fontFamily)};letter-spacing:${escapeAttr(letterSpacingCss)};\">${tspans}</text>`;

    const matrix = useMatrixForOverriddenText && m
      ? `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.tx} ${m.ty})`
      : "";

    if (!shouldConstrain) {
      return matrix ? `<g transform=\"${escapeAttr(matrix)}\">${textEl}</g>` : textEl;
    }

    if (matrix) {
      const clip = ensureTextLocalClipPath(node, localW, localH);
      return `<g transform=\"${escapeAttr(matrix)}\" clip-path=\"url(#${escapeAttr(clip)})\">${textEl}</g>`;
    }

    return `<g clip-path=\"url(#${escapeAttr(ensureTextClipPath(node))})\">${textEl}</g>`;
  }

  function renderGuidesForText(node: Extract<NormalizedNode, { kind: "text" }>) {
    const field = configured.get(node.id);
    if (!includeGuides || !field) return "";
    return `<rect x=\"${node.frame.x}\" y=\"${node.frame.y}\" width=\"${node.frame.width}\" height=\"${node.frame.height}\" fill=\"none\" stroke=\"rgba(16,185,129,0.9)\" stroke-width=\"1\" stroke-dasharray=\"4 3\"/>`;
  }

  function renderGroup(id: string): string {
    const node = design.nodesById[id] as NormalizedNode | undefined;
    if (!node) return "";
    if (!node.visible) return "";
    if (node.opacity <= 0) return "";

    const self = node.kind === "text" ? renderTextNode(node) + renderGuidesForText(node) : "";
    const children = (design.childrenById[id] ?? []).map((cid) => renderGroup(cid)).join("");
    if (!self && !children) return "";

    const clipPath =
      node.kind === "container" && node.clipsContent
        ? ` clip-path=\"url(#${escapeAttr(ensureClipPath(node))})\"`
        : "";
    return `<g opacity=\"${node.opacity}\"${clipPath}>${self}${children}</g>`;
  }

  const body = design.rootIds.map((rid) => renderGroup(rid)).join("\n");

  return `<?xml version=\"1.0\" encoding=\"UTF-8\"?>
<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"${design.canvas.width}\" height=\"${design.canvas.height}\" viewBox=\"0 0 ${design.canvas.width} ${design.canvas.height}\">
${defs.length ? `<defs>\n${defs.join("\n")}\n</defs>` : ""}
${body}
</svg>`;
}

function isLikelyLocalSvgPath(pathData: string, frame: { x: number; y: number; width: number; height: number }) {
  // Heuristic: many Figma exports provide fillGeometry paths in node-local coordinates.
  // If numbers look mostly within [0..maxDim], treat as local and translate by frame.x/y.
  const nums = pathData.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
  if (!nums || nums.length === 0) return false;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const n of nums) {
    const v = Number(n);
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return false;

  const maxDim = Math.max(1, Math.max(frame.width, frame.height));
  const withinLocalBand = max <= maxDim * 1.25 && min >= -maxDim * 0.25;
  const looksAbsolute = max >= maxDim * 2 || min <= -maxDim * 2;
  if (looksAbsolute) return false;
  return withinLocalBand;
}

function areLikelyLocalSvgPaths(paths: string[], frame: { x: number; y: number; width: number; height: number }) {
  // Treat a vector as local only if all sub-paths appear local.
  return paths.every((p) => isLikelyLocalSvgPath(p, frame));
}

function buildCompoundVectorPath(paths: string[]): Path2D | null {
  const compound = new Path2D();
  let added = 0;
  for (const data of paths) {
    try {
      compound.addPath(new Path2D(data));
      added++;
    } catch {
      // ignore invalid sub-paths
    }
  }
  return added > 0 ? compound : null;
}

function escapeText(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(s: string) {
  return escapeText(s);
}
