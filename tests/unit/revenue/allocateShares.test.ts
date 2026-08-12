import { describe, expect, it } from "vitest";

import {
  allocateLargestRemainder,
  allocateRevenueShares,
} from "@/lib/revenue/allocateShares";
import { createDefaultRevenueFramework } from "@/lib/revenue/defaultFramework";
import type { RevenueFramework } from "@/lib/revenue/types";

function koboByName(allocation: ReturnType<typeof allocateRevenueShares>) {
  return Object.fromEntries(
    allocation.members.map((member) => [member.name, member.totalKobo])
  );
}

describe("allocateLargestRemainder", () => {
  it("returns zeros for an empty weight list", () => {
    expect(allocateLargestRemainder(100, [])).toEqual([]);
  });

  it("returns zeros when the pool is 0", () => {
    expect(allocateLargestRemainder(0, [1, 2, 3])).toEqual([0, 0, 0]);
  });

  it("splits equally and hands leftover units to the earliest indexes", () => {
    expect(allocateLargestRemainder(10, [1, 1, 1])).toEqual([4, 3, 3]);
  });

  it("always sums back to the pool", () => {
    const pools = [1, 7, 100, 1000, 99_999, 14_387_250];
    const weights = [5000, 2500, 1500, 1000];
    for (const pool of pools) {
      const parts = allocateLargestRemainder(pool, weights);
      expect(parts.reduce((sum, value) => sum + value, 0)).toBe(pool);
    }
  });

  it("falls back to an equal split when every weight is zero", () => {
    expect(allocateLargestRemainder(5, [0, 0, 0])).toEqual([2, 2, 1]);
  });
});

describe("allocateRevenueShares · PDF default framework", () => {
  const framework = createDefaultRevenueFramework();

  it("reproduces the document totals on a ₦1,000 pool", () => {
    const allocation = allocateRevenueShares(100_000, framework);
    expect(koboByName(allocation)).toEqual({
      Rex: 42_167,
      Spectre: 32_167,
      "Jay Zee": 19_666,
      "Jay Jay": 3_000,
      Destiny: 3_000,
    });
    expect(allocation.proof.balanced).toBe(true);
    expect(allocation.members.find((m) => m.name === "Rex")?.allocatedBps).toBe(
      4217
    );
    expect(allocation.members.find((m) => m.name === "Spectre")?.allocatedBps).toBe(
      3217
    );
    expect(allocation.members.find((m) => m.name === "Jay Zee")?.allocatedBps).toBe(
      1967
    );
  });

  it("matches the document's theoretical percents (42.17 / 32.17 / 19.67 / 3 / 3)", () => {
    const allocation = allocateRevenueShares(0, framework);
    const byName = Object.fromEntries(
      allocation.members.map((member) => [
        member.name,
        Math.round(member.frameworkBps),
      ])
    );
    expect(byName).toEqual({
      Rex: 4217,
      Spectre: 3217,
      "Jay Zee": 1967,
      "Jay Jay": 300,
      Destiny: 300,
    });
  });

  it("keeps every member+category sum equal to the pool for any amount", () => {
    const pools = [0, 1, 7, 100, 100_100, 1_000_000, 14_387_250];
    for (const pool of pools) {
      const allocation = allocateRevenueShares(pool, framework);
      expect(allocation.proof.memberSumKobo).toBe(pool);
      expect(allocation.proof.categorySumKobo).toBe(pool);
      expect(allocation.proof.balanced).toBe(true);
    }
  });

  it("gives a 1-kobo pool to Rex via Design's largest remainder", () => {
    const allocation = allocateRevenueShares(1, framework);
    expect(koboByName(allocation)).toEqual({
      Rex: 1,
      Spectre: 0,
      "Jay Zee": 0,
      "Jay Jay": 0,
      Destiny: 0,
    });
    expect(allocation.proof.balanced).toBe(true);
  });

  it("floors a fractional naira pool and still balances", () => {
    const allocation = allocateRevenueShares(100.9, framework);
    expect(allocation.poolKobo).toBe(100);
    expect(allocation.proof.balanced).toBe(true);
  });
});

describe("allocateRevenueShares · editable framework edge cases", () => {
  it("splits an orphaned category pot across every member", () => {
    const framework: RevenueFramework = {
      categories: [
        { id: "a", name: "A", weightBps: 10000, color: "#000" },
      ],
      members: [
        { id: "m1", name: "One", role: null, color: "#111" },
        { id: "m2", name: "Two", role: null, color: "#222" },
      ],
      assignments: [],
    };
    const allocation = allocateRevenueShares(101, framework);
    expect(allocation.proof.balanced).toBe(true);
    expect(allocation.members.map((m) => m.totalKobo).sort((a, b) => b - a)).toEqual([
      51, 50,
    ]);
    expect(
      allocation.members.every((member) =>
        member.byCategory.some((row) => row.categoryId === "_unassigned")
      )
    ).toBe(true);
  });

  it("returns an empty member list when the framework has no people", () => {
    const framework: RevenueFramework = {
      categories: [{ id: "a", name: "A", weightBps: 10000, color: "#000" }],
      members: [],
      assignments: [],
    };
    const allocation = allocateRevenueShares(500, framework);
    expect(allocation.members).toEqual([]);
    expect(allocation.proof.categorySumKobo).toBe(500);
    expect(allocation.proof.memberSumKobo).toBe(0);
  });
});
