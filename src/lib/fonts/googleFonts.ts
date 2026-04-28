"use client";

// Shared Google Fonts utilities.
// - Used by the React hook and by PNG export to ensure fonts are present before measuring text.

export function normalizeFontFamily(raw: string) {
  const first = raw.split(",")[0]?.trim();
  if (!first) return "";
  return first.replace(/^['\"]/, "").replace(/['\"]$/, "").trim();
}

export function isGenericFontFamily(fontFamily: string) {
  const f = fontFamily.trim().toLowerCase();
  if (!f) return true;

  if (f === "serif" || f === "sans-serif" || f === "monospace") return true;
  if (f === "system-ui" || f === "ui-sans-serif" || f === "ui-serif" || f === "ui-monospace") return true;
  if (f === "emoji" || f === "math" || f === "fangsong") return true;
  if (f.startsWith("-apple-")) return true;

  return false;
}

export function normalizeGoogleFontFamilies(fontFamilies: string[]) {
  const normalized = fontFamilies
    .map(normalizeFontFamily)
    .filter((f) => Boolean(f) && !isGenericFontFamily(f));
  return [...new Set(normalized)].sort((a, b) => a.localeCompare(b));
}

export function buildGoogleFontsHref(fontFamilies: string[]) {
  const families = normalizeGoogleFontFamilies(fontFamilies);
  if (families.length === 0) return null;

  // Request a broad set of weights. Include italics as well so exports that set fontStyle=italic
  // don’t silently fall back.
  const weights = [100, 200, 300, 400, 500, 600, 700, 800, 900];
  const pairs = [
    ...weights.map((w) => `0,${w}`),
    ...weights.map((w) => `1,${w}`),
  ].join(";");

  const params = families
    .map((f) => {
      const fam = encodeURIComponent(f).replaceAll("%20", "+");
      return `family=${fam}:ital,wght@${pairs}`;
    })
    .join("&");

  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}

export function ensureGoogleFontsLink(fontFamilies: string[]) {
  if (typeof document === "undefined") return null;
  const href = buildGoogleFontsHref(fontFamilies);
  if (!href) return null;

  const existing = document.querySelector(`link[data-fyb-fonts="1"][href="${href}"]`);
  if (existing) return href;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.setAttribute("data-fyb-fonts", "1");
  document.head.appendChild(link);

  return href;
}

export async function ensureGoogleFontsLoaded(fontFamilies: string[], opts?: { timeoutMs?: number }) {
  if (typeof window === "undefined") return;

  const families = normalizeGoogleFontFamilies(fontFamilies);
  if (families.length === 0) return;

  ensureGoogleFontsLink(families);

  // Best-effort: ensure the fonts are actually loaded before measuring text.
  // If `document.fonts` is not available, we can’t block on it.
  if (!document.fonts?.load) return;

  const timeoutMs = opts?.timeoutMs ?? 3500;

  const loads: Promise<unknown>[] = [];
  for (const family of families) {
    loads.push(document.fonts.load(`16px "${family}"`));
    loads.push(document.fonts.load(`italic 16px "${family}"`));
  }

  let timeoutHandle: number | null = null;
  const timeout = new Promise<void>((resolve) => {
    timeoutHandle = window.setTimeout(resolve, timeoutMs);
  });

  try {
    await Promise.race([Promise.allSettled(loads).then(() => undefined), timeout]);
  } finally {
    if (timeoutHandle) window.clearTimeout(timeoutHandle);
  }
}
