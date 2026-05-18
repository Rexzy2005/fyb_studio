import { describe, expect, it } from "vitest";

import type { NormalizedImageFill } from "@/lib/figma";
import { applyImageFill } from "@/lib/render/features/paints/imageFill";

type Op = { name: string; args: unknown[] };

function makeCtx() {
  const ops: Op[] = [];
  const ctx = {
    save: () => ops.push({ name: "save", args: [] }),
    restore: () => ops.push({ name: "restore", args: [] }),
    beginPath: () => ops.push({ name: "beginPath", args: [] }),
    rect: (...args: unknown[]) => ops.push({ name: "rect", args }),
    clip: (...args: unknown[]) => ops.push({ name: "clip", args }),
    transform: (...args: unknown[]) => ops.push({ name: "transform", args }),
    translate: (...args: unknown[]) => ops.push({ name: "translate", args }),
    rotate: (...args: unknown[]) => ops.push({ name: "rotate", args }),
    drawImage: (...args: unknown[]) => ops.push({ name: "drawImage", args }),
    createPattern: () => null,
    fillRect: (...args: unknown[]) => ops.push({ name: "fillRect", args }),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, ops };
}

function imageFill(overrides: Partial<NormalizedImageFill> = {}): NormalizedImageFill {
  return {
    kind: "image",
    visible: true,
    opacity: 1,
    blendMode: "NORMAL",
    imageHash: "hash",
    scaleMode: "FILL",
    cssFallback: "#ddd",
    ...overrides,
  };
}

describe("applyImageFill", () => {
  it("uses the full affine imageTransform for crop fills", () => {
    const { ctx, ops } = makeCtx();
    const source = { width: 100, height: 80 } as unknown as CanvasImageSource;

    applyImageFill(
      ctx,
      source,
      imageFill({
        imageTransform: {
          a: 0.5,
          b: 0.2,
          c: -0.1,
          d: 0.5,
          tx: 0.2,
          ty: 0.1,
        },
      }),
      { x: 10, y: 20, width: 200, height: 120 },
    );

    const transform = ops.find((op) => op.name === "transform");
    const drawImage = ops.find((op) => op.name === "drawImage");

    expect(transform).toBeTruthy();
    expect(transform?.args[1]).not.toBe(0);
    expect(transform?.args[2]).not.toBe(0);
    expect(drawImage?.args).toHaveLength(5);
  });
});
