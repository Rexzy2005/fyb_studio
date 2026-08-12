import type {
  AllocatedCategory,
  AllocatedMember,
  RevenueAllocation,
  RevenueFramework,
} from "./types";

const UNASSIGNED_CATEGORY_ID = "_unassigned";

/**
 * Hamilton / largest-remainder allocator.
 *
 * `total` is split in integer units (kobo) proportionally to `weights`.
 * Any leftover unit after floor-division is given to the largest fractional
 * remainders, then by original index so the result is deterministic.
 *
 * Zero / negative weights fall back to an equal split so leftover kobo
 * is never stranded.
 */
export function allocateLargestRemainder(
  total: number,
  weights: readonly number[]
): number[] {
  const n = weights.length;
  if (n === 0) return [];

  const safeTotal = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
  if (safeTotal === 0) return Array.from({ length: n }, () => 0);

  const safeWeights = weights.map((weight) =>
    Number.isFinite(weight) && weight > 0 ? weight : 0
  );
  const weightSum = safeWeights.reduce((sum, weight) => sum + weight, 0);
  if (weightSum <= 0) {
    return allocateLargestRemainder(
      safeTotal,
      Array.from({ length: n }, () => 1)
    );
  }

  const exact = safeWeights.map((weight) => (safeTotal * weight) / weightSum);
  const floors = exact.map((value) => Math.floor(value));
  const leftover = safeTotal - floors.reduce((sum, value) => sum + value, 0);

  const ranked = exact
    .map((value, index) => ({ index, frac: value - floors[index] }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);

  const out = floors.slice();
  for (let i = 0; i < leftover; i += 1) {
    out[ranked[i].index] += 1;
  }
  return out;
}

function contributorsByCategory(
  framework: RevenueFramework
): Map<string, string[]> {
  const memberIds = new Set(framework.members.map((member) => member.id));
  const map = new Map<string, string[]>();
  for (const category of framework.categories) {
    map.set(category.id, []);
  }
  for (const assignment of framework.assignments) {
    if (!memberIds.has(assignment.memberId)) continue;
    const list = map.get(assignment.categoryId);
    if (!list) continue;
    if (!list.includes(assignment.memberId)) list.push(assignment.memberId);
  }
  return map;
}

function theoreticalFrameworkBps(
  memberId: string,
  framework: RevenueFramework,
  contributors: Map<string, string[]>
): number {
  let bps = 0;
  for (const category of framework.categories) {
    const ids = contributors.get(category.id) ?? [];
    if (ids.includes(memberId) && ids.length > 0) {
      bps += category.weightBps / ids.length;
    }
  }
  return bps;
}

/**
 * Split a revenue pool using the document's category-first rule:
 *
 *   1. Allocate the pool across categories by weight.
 *   2. Split each category pot equally among its contributors.
 *   3. A category with weight but no contributors is leftover — that pot
 *      is split equally across every member so nothing is stranded.
 *
 * Member totals always sum back to `poolKobo` (when there is at least
 * one member). Works for any non-negative integer pool.
 */
export function allocateRevenueShares(
  poolKobo: number,
  framework: RevenueFramework
): RevenueAllocation {
  const safePool = Number.isFinite(poolKobo)
    ? Math.max(0, Math.floor(poolKobo))
    : 0;

  const contributors = contributorsByCategory(framework);
  const categoryPots = allocateLargestRemainder(
    safePool,
    framework.categories.map((category) => category.weightBps)
  );

  const memberKobo = new Map(
    framework.members.map((member) => [member.id, 0])
  );
  const memberByCategory = new Map(
    framework.members.map((member) => [
      member.id,
      [] as AllocatedMember["byCategory"],
    ])
  );

  let orphanedKobo = 0;
  const categories: AllocatedCategory[] = framework.categories.map(
    (category, index) => {
      const potKobo = categoryPots[index] ?? 0;
      const contributorIds = contributors.get(category.id) ?? [];

      if (contributorIds.length === 0) {
        orphanedKobo += potKobo;
        return {
          ...category,
          potKobo,
          contributorIds: [],
          leftoverKobo: potKobo,
        };
      }

      const shares = allocateLargestRemainder(
        potKobo,
        contributorIds.map(() => 1)
      );
      const floorEach = Math.floor(potKobo / contributorIds.length);
      const leftoverKobo = potKobo - floorEach * contributorIds.length;

      contributorIds.forEach((memberId, shareIndex) => {
        const kobo = shares[shareIndex] ?? 0;
        memberKobo.set(memberId, (memberKobo.get(memberId) ?? 0) + kobo);
        memberByCategory.get(memberId)?.push({
          categoryId: category.id,
          categoryName: category.name,
          kobo,
        });
      });

      return {
        ...category,
        potKobo,
        contributorIds,
        leftoverKobo,
      };
    }
  );

  if (orphanedKobo > 0 && framework.members.length > 0) {
    const extras = allocateLargestRemainder(
      orphanedKobo,
      framework.members.map(() => 1)
    );
    framework.members.forEach((member, index) => {
      const extra = extras[index] ?? 0;
      if (extra <= 0) return;
      memberKobo.set(member.id, (memberKobo.get(member.id) ?? 0) + extra);
      memberByCategory.get(member.id)?.push({
        categoryId: UNASSIGNED_CATEGORY_ID,
        categoryName: "Unassigned remainder",
        kobo: extra,
      });
    });
  }

  const members: AllocatedMember[] = framework.members.map((member) => {
    const totalKobo = memberKobo.get(member.id) ?? 0;
    const frameworkBps = theoreticalFrameworkBps(
      member.id,
      framework,
      contributors
    );
    return {
      ...member,
      totalKobo,
      frameworkBps,
      allocatedBps:
        safePool > 0
          ? Math.round((totalKobo / safePool) * 10_000)
          : Math.round(frameworkBps),
      byCategory: memberByCategory.get(member.id) ?? [],
    };
  });

  members.sort(
    (a, b) => b.totalKobo - a.totalKobo || a.name.localeCompare(b.name)
  );

  const memberSumKobo = members.reduce((sum, member) => sum + member.totalKobo, 0);
  const categorySumKobo = categories.reduce(
    (sum, category) => sum + category.potKobo,
    0
  );

  return {
    poolKobo: safePool,
    categories,
    members,
    proof: {
      memberSumKobo,
      categorySumKobo,
      balanced:
        (framework.members.length === 0 && safePool === 0) ||
        (memberSumKobo === safePool && categorySumKobo === safePool),
    },
  };
}

export function formatNgnFromKobo(kobo: number): string {
  const naira = kobo / 100;
  return `₦${naira.toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatSharePercent(bps: number): string {
  return `${(bps / 100).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}
