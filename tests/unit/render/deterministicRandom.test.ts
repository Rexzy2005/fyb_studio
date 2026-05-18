import { describe, expect, it } from "vitest";

import { createDeterministicRandom } from "@/lib/render/features/deterministicRandom";

describe("createDeterministicRandom", () => {
  it("returns the same sequence for the same seed", () => {
    const a = createDeterministicRandom("noise|mono|12");
    const b = createDeterministicRandom("noise|mono|12");

    expect([a(), a(), a(), a(), a()]).toEqual([b(), b(), b(), b(), b()]);
  });

  it("returns different sequences for different seeds", () => {
    const a = createDeterministicRandom("texture|24");
    const b = createDeterministicRandom("texture|48");

    expect([a(), a(), a()]).not.toEqual([b(), b(), b()]);
  });
});
