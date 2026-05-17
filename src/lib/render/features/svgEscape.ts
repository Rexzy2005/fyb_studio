/**
 * Escape characters that are unsafe in SVG text content / attribute values.
 * Order matters - `&` must run first so we don't double-escape entities.
 */
export function escapeText(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function escapeAttr(s: string): string {
  return escapeText(s);
}
