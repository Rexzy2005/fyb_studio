export type DecodedCanvasImageSource = {
  source: CanvasImageSource;
  release: () => void;
};

/**
 * Decode an image Blob into something canvas.drawImage can paint.
 *
 * Prefer ImageBitmap when the browser supports it, but always fall back to an
 * HTMLImageElement. This is required on iOS Safari versions where
 * createImageBitmap is absent or rejects for camera/photo-library image blobs.
 */
export async function decodeImageBlobForCanvas(blob: Blob): Promise<DecodedCanvasImageSource> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob);
      return {
        source: bitmap,
        release: () => bitmap.close(),
      };
    } catch {
      // Fall through to HTMLImageElement; iOS WebKit commonly lands here for
      // user-picked images even though <img> can decode the same blob.
    }
  }

  return decodeViaHtmlImage(blob);
}

function decodeViaHtmlImage(blob: Blob): Promise<DecodedCanvasImageSource> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    let settled = false;

    const release = () => URL.revokeObjectURL(url);
    const rejectOnce = (error: Error) => {
      if (settled) return;
      settled = true;
      release();
      reject(error);
    };
    const resolveOnce = () => {
      if (settled) return;
      const width = img.naturalWidth || img.width;
      const height = img.naturalHeight || img.height;
      if (!width || !height) {
        rejectOnce(new Error("Decoded image has no dimensions"));
        return;
      }
      settled = true;
      resolve({ source: img, release });
    };

    img.onload = () => resolveOnce();
    img.onerror = () => rejectOnce(new Error("Image blob failed to decode"));
    img.decoding = "async";
    img.src = url;

    if (img.complete) queueMicrotask(resolveOnce);
    void img.decode?.().then(resolveOnce).catch(() => {
      // Keep the load/error handlers active. Safari can reject decode() while
      // still firing load for drawable images.
    });
  });
}
