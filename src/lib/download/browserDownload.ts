/**
 * Browser-only blob download helper. Mounting the anchor in the DOM and
 * delaying URL revocation keeps Safari/mobile browsers from racing the save.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  if (typeof window === "undefined") return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  try {
    a.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, view: window }),
    );
  } catch {
    a.click();
  }
  window.setTimeout(() => {
    if (a.parentNode) a.parentNode.removeChild(a);
    URL.revokeObjectURL(url);
  }, 4000);
}

export function safePngFilename(name: string): string {
  const base = name.replaceAll(/[^a-z0-9-_ ]/gi, "").trim() || "fyb-design";
  return `${base}.png`;
}
