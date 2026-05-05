import { describe, expect, it } from "vitest";

import { classifyCoordinateSpace } from "@/lib/figma/normalize/shared/coordinateSpace";

describe("classifyCoordinateSpace", () => {
  const node = { width: 100, height: 100 };
  const frame = { x: 200, y: 300, width: 100, height: 100 };

  it("trusts an explicit local hint", () => {
    expect(
      classifyCoordinateSpace("M0 0 L1 1", { ...node, coordinateSpace: "local" }, frame),
    ).toBe("local");
  });

  it("classifies a node-local path correctly", () => {
    expect(classifyCoordinateSpace("M10 10 L90 90", node, frame)).toBe("local");
  });

  it("classifies an absolute path correctly", () => {
    expect(
      classifyCoordinateSpace(
        "M210 310 L290 390",
        node,
        frame,
      ),
    ).toBe("absolute");
  });

  it("returns 'unknown' for empty input", () => {
    expect(classifyCoordinateSpace("", node, frame)).toBe("unknown");
  });
});
