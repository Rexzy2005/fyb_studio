"use client";

import { useEffect, useMemo } from "react";

import { createLocalTemplateRepository } from "@/lib/storage/templateRepo";
import { ensureGoogleFontsLoaded, normalizeGoogleFontFamilies } from "@/lib/fonts/googleFonts";

// Runtime Google Fonts loader for when the Figma export provides font family names.
// Safe no-op when fonts array is empty.
export function useGoogleFonts(fontFamilies: string[]) {
  const families = useMemo(() => {
    return normalizeGoogleFontFamilies(fontFamilies);
  }, [fontFamilies]);

  useEffect(() => {
    if (families.length === 0) return;

    // Best-effort: inject link + start the load so renders/export can use correct metrics.
    void ensureGoogleFontsLoaded(families);

    return () => {
      // Do not remove: other routes may rely on loaded fonts.
    };
  }, [families]);

  // 2) If a font is not available (not installed, not on Google Fonts), load it from
  // IndexedDB as an uploaded custom font.
  const familiesKey = useMemo(() => families.join("|"), [families]);

  useEffect(() => {
    if (!familiesKey) return;
    let cancelled = false;

    async function loadCustomFonts() {
      const repo = createLocalTemplateRepository();

      for (const family of families) {
        if (cancelled) return;
        if (loadedFontFamilies.has(family)) continue;

        // Skip if already present (system-installed or already loaded).
        try {
          if (document.fonts?.check(`12px "${family}"`)) {
            loadedFontFamilies.add(family);
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
          loadedFontFamilies.add(family);
        } catch {
          // ignore; fall back to system fonts
        } finally {
          if (url) URL.revokeObjectURL(url);
        }
      }
    }

    void loadCustomFonts();

    function onFontsChanged() {
      void loadCustomFonts();
    }

    window.addEventListener("fyb:fonts:changed", onFontsChanged);
    return () => {
      cancelled = true;
      window.removeEventListener("fyb:fonts:changed", onFontsChanged);
    };
    // familiesKey changes when the set of families changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [familiesKey]);
}
const loadedFontFamilies = new Set<string>();
