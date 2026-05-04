import { isRecord, type AnyRecord } from "./coerce";

export function cleanFontFamily(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const v = raw.trim();
  if (!v) return undefined;
  // Strip wrapping quotes that sometimes appear in exports or CSS stacks.
  return v.replace(/^['"]/, "").replace(/['"]$/, "").trim() || undefined;
}

export function inferFontFamilyFromPostScriptName(raw: string | undefined): string | undefined {
  const v = cleanFontFamily(raw);
  if (!v) return undefined;
  // Common patterns: "Inter-Regular", "Poppins-SemiBoldItalic".
  // We only want the family portion for CSS/SVG usage.
  const head = v.split(/[-_]/)[0]?.trim();
  return head ? head : v;
}

export function pickMostCommonFontFamilyFromOverrides(input: AnyRecord): string | undefined {
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
          (styleFontName && typeof styleFontName.family === "string"
            ? (styleFontName.family as string)
            : undefined) ??
            (typeof style.fontFamily === "string" ? (style.fontFamily as string) : undefined),
        ) ??
        inferFontFamilyFromPostScriptName(
          typeof style.fontPostScriptName === "string"
            ? (style.fontPostScriptName as string)
            : undefined,
        );
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
        (styleFontName && typeof styleFontName.family === "string"
          ? (styleFontName.family as string)
          : undefined) ??
          (typeof style.fontFamily === "string" ? (style.fontFamily as string) : undefined),
      ) ??
      inferFontFamilyFromPostScriptName(
        typeof style.fontPostScriptName === "string"
          ? (style.fontPostScriptName as string)
          : undefined,
      );
    if (fam) return fam;
  }

  return undefined;
}
