import { createLocalTemplateRepository } from "@/lib/storage/templateRepo";

function normalizeFontFamily(raw: string): string {
  const first = raw.split(",")[0]?.trim();
  if (!first) return "";
  return first.replace(/^['"]/, "").replace(/['"]$/, "").trim();
}

const loadedCustomFontFamilies = new Set<string>();

/**
 * Load any custom fonts (admin-uploaded) referenced by the design.
 * Caches loads in-memory so the same family isn't re-fetched per export.
 */
export async function ensureCustomFontsLoaded(fontFamilies: string[]): Promise<void> {
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
