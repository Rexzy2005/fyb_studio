import { afterEach, describe, expect, it, vi } from "vitest";

import { decodeImageBlobForCanvas } from "@/lib/render/features/canvasImageSource";

function stubObjectUrls() {
  const createObjectURL = vi.fn(() => "blob:mock-image");
  const revokeObjectURL = vi.fn();
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: createObjectURL,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: revokeObjectURL,
  });
  return { createObjectURL, revokeObjectURL };
}

function stubLoadableImage() {
  class MockImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    decoding = "";
    complete = false;
    naturalWidth = 640;
    naturalHeight = 480;
    width = 0;
    height = 0;
    private value = "";

    get src() {
      return this.value;
    }

    set src(next: string) {
      this.value = next;
      queueMicrotask(() => {
        this.complete = true;
        this.onload?.();
      });
    }

    decode() {
      return Promise.resolve();
    }
  }

  vi.stubGlobal("Image", MockImage);
  return MockImage;
}

describe("decodeImageBlobForCanvas", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses ImageBitmap when available", async () => {
    const close = vi.fn();
    const bitmap = { width: 10, height: 20, close } as unknown as ImageBitmap;
    const createImageBitmapMock = vi.fn().mockResolvedValue(bitmap);
    vi.stubGlobal("createImageBitmap", createImageBitmapMock);

    const decoded = await decodeImageBlobForCanvas(new Blob(["x"], { type: "image/png" }));

    expect(createImageBitmapMock).toHaveBeenCalledTimes(1);
    expect(decoded.source).toBe(bitmap);
    decoded.release();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("falls back to HTMLImageElement when ImageBitmap is unavailable", async () => {
    const { createObjectURL, revokeObjectURL } = stubObjectUrls();
    const MockImage = stubLoadableImage();
    vi.stubGlobal("createImageBitmap", undefined);

    const decoded = await decodeImageBlobForCanvas(new Blob(["x"], { type: "image/jpeg" }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(decoded.source).toBeInstanceOf(MockImage);
    decoded.release();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-image");
  });

  it("falls back to HTMLImageElement when ImageBitmap rejects", async () => {
    const { createObjectURL, revokeObjectURL } = stubObjectUrls();
    const MockImage = stubLoadableImage();
    const createImageBitmapMock = vi.fn().mockRejectedValue(new Error("unsupported blob"));
    vi.stubGlobal("createImageBitmap", createImageBitmapMock);

    const decoded = await decodeImageBlobForCanvas(new Blob(["x"], { type: "image/heic" }));

    expect(createImageBitmapMock).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(decoded.source).toBeInstanceOf(MockImage);
    decoded.release();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock-image");
  });
});
