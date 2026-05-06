import { buildGoogleFontsHref, normalizeGoogleFontFamilies } from "@/lib/fonts/googleFonts";
import { createLocalTemplateRepository } from "@/lib/storage/templateRepo";

/**
 * Build a `<style>` block of `@font-face` rules with the actual font data
 * inlined as base64 data URLs.
 *
 * Why this is needed: PNG export rasterizes the SVG text layer through
 * `<img src="blob:..."`. The `<img>` SVG document is a separate context
 * that has no access to `document.fonts`, so any text that doesn't have
 * its font baked into the SVG itself renders with the OS fallback face.
 *
 * We embed by:
 *   1. Fetching the same Google Fonts stylesheet the page uses, then
 *      pulling each `src: url(...) format('woff2')` declaration out of it.
 *   2. Reading any custom (admin-uploaded) font blobs from IndexedDB.
 *   3. Encoding everything as base64 data URLs and stitching it into one
 *      `<style>` element to drop into the SVG defs.
 *
 * Returns the empty string when nothing could be resolved — the caller
 * falls back to whatever face the rasterizer can find (usually wrong, but
 * better than aborting).
 */
export async function buildEmbeddedFontFacesStyle(
  fontFamilies: string[],
): Promise<string> {
  if (typeof window === "undefined") return "";
  const families = normalizeGoogleFontFamilies(fontFamilies);
  if (families.length === 0) return "";

  // Both lookups run in parallel — Google Fonts CSS via the network, custom
  // fonts via IndexedDB. Failures on either side are non-fatal.
  const [googleRules, customRules] = await Promise.all([
    fetchGoogleFontFaceRules(families).catch(() => ""),
    fetchCustomFontFaceRules(families).catch(() => ""),
  ]);

  const combined = [googleRules, customRules].filter(Boolean).join("\n");
  if (!combined) return "";
  return `<style type="text/css"><![CDATA[\n${combined}\n]]></style>`;
}

/**
 * Fetch the same Google Fonts stylesheet the runtime hook injects, then
 * inline every woff2 file it points to as a base64 data URL. A custom
 * `User-Agent` would be ideal here but isn't settable from the browser; the
 * default UA already returns woff2 URLs in modern browsers, so this works.
 */
async function fetchGoogleFontFaceRules(families: string[]): Promise<string> {
  const href = buildGoogleFontsHref(families);
  if (!href) return "";

  const cssRes = await fetch(href, { mode: "cors" });
  if (!cssRes.ok) return "";
  const css = await cssRes.text();

  // The CSS contains a series of @font-face blocks. We walk each block,
  // pull out the woff2 URL, fetch and base64-encode it, then rewrite the
  // block to point at the data URL. Other blocks (woff/ttf/etc.) are kept
  // as-is in case the rasterizer prefers them.
  const blocks = css.split(/(?=@font-face)/g);
  const rewritten: string[] = [];
  // Cache woff2 fetches by URL — Google ships the same URL for every weight
  // sometimes; skip refetching.
  const fetched = new Map<string, string | null>();

  for (const block of blocks) {
    if (!/@font-face/.test(block)) continue;
    const urlMatch = block.match(/url\((https:\/\/[^)]+\.woff2)\)\s+format\(['"]?woff2['"]?\)/);
    if (!urlMatch) {
      rewritten.push(block.trim());
      continue;
    }
    const woffUrl = urlMatch[1];
    let dataUrl = fetched.get(woffUrl);
    if (dataUrl === undefined) {
      try {
        const fontRes = await fetch(woffUrl, { mode: "cors" });
        if (!fontRes.ok) {
          fetched.set(woffUrl, null);
          dataUrl = null;
        } else {
          const buf = await fontRes.arrayBuffer();
          dataUrl = `data:font/woff2;base64,${arrayBufferToBase64(buf)}`;
          fetched.set(woffUrl, dataUrl);
        }
      } catch {
        fetched.set(woffUrl, null);
        dataUrl = null;
      }
    }
    if (!dataUrl) {
      // Drop the block — better to omit it than to leave a network reference
      // that the SVG's `<img>` document can't resolve.
      continue;
    }
    rewritten.push(
      block.replace(
        /url\(https:\/\/[^)]+\.woff2\)\s+format\(['"]?woff2['"]?\)/,
        `url(${dataUrl}) format('woff2')`,
      ).trim(),
    );
  }

  return rewritten.join("\n");
}

/**
 * Custom (admin-uploaded) fonts live in IndexedDB. Pull each by family name
 * and emit a single regular-weight `@font-face` rule per family. The custom
 * font workflow already only stores one face per family, so weight/style
 * variants aren't a concern here.
 */
async function fetchCustomFontFaceRules(families: string[]): Promise<string> {
  const repo = createLocalTemplateRepository();
  const rules: string[] = [];
  for (const family of families) {
    try {
      const record = await repo.getFont(family);
      if (!record) continue;
      const buf = await record.blob.arrayBuffer();
      const dataUrl = `data:${record.blob.type || "font/woff2"};base64,${arrayBufferToBase64(buf)}`;
      rules.push(
        `@font-face { font-family: '${escapeFontFamily(family)}'; src: url(${dataUrl}); font-display: block; }`,
      );
    } catch {
      // skip
    }
  }
  return rules.join("\n");
}

function escapeFontFamily(family: string): string {
  return family.replace(/['\\]/g, "\\$&");
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  // Chunked encode to avoid `Maximum call stack` on large fonts (some woff2
  // files are 200KB+). 0x8000 is small enough to be safe across browsers.
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
