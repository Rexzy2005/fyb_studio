import type { RevenueFramework } from "./types";

/**
 * FYB Studio revenue-sharing framework, transcribed from
 * `fyb-revenue-framework.pdf`.
 *
 * Categories are the source of truth. A member's printed total
 * (Rex 42.17%, …) is the sum of equal splits inside each category
 * they contribute to — not a hardcoded person percent.
 *
 *   Flyer Designs        50%  → Rex, Spectre, Jay Zee
 *   Development          25%  → Rex, Spectre
 *   Planning & Strategy  15%  → all five
 *   Infrastructure       10%  → Rex
 */
export const DEFAULT_REVENUE_FRAMEWORK_KEY = "default";

const DEFAULT_CATEGORIES = [
  { id: "cat_design", name: "Flyer Designs", weightBps: 5000, color: "#22c55e" },
  { id: "cat_dev", name: "Development", weightBps: 2500, color: "#8b5cf6" },
  { id: "cat_planning", name: "Planning & Strategy", weightBps: 1500, color: "#3b82f6" },
  { id: "cat_infra", name: "Infrastructure", weightBps: 1000, color: "#06b6d4" },
] as const;

const DEFAULT_MEMBERS = [
  { id: "mem_rex", name: "Rex", role: "Lead", color: "#22c55e" },
  { id: "mem_spectre", name: "Spectre", role: null, color: "#8b5cf6" },
  { id: "mem_jayzee", name: "Jay Zee", role: null, color: "#3b82f6" },
  { id: "mem_jayjay", name: "Jay Jay", role: null, color: "#6366f1" },
  { id: "mem_destiny", name: "Destiny", role: null, color: "#ec4899" },
] as const;

const DEFAULT_ASSIGNMENTS: Array<{ memberId: string; categoryId: string }> = [
  // Design
  { memberId: "mem_rex", categoryId: "cat_design" },
  { memberId: "mem_spectre", categoryId: "cat_design" },
  { memberId: "mem_jayzee", categoryId: "cat_design" },
  // Dev
  { memberId: "mem_rex", categoryId: "cat_dev" },
  { memberId: "mem_spectre", categoryId: "cat_dev" },
  // Planning — everyone
  { memberId: "mem_rex", categoryId: "cat_planning" },
  { memberId: "mem_spectre", categoryId: "cat_planning" },
  { memberId: "mem_jayzee", categoryId: "cat_planning" },
  { memberId: "mem_jayjay", categoryId: "cat_planning" },
  { memberId: "mem_destiny", categoryId: "cat_planning" },
  // Infra
  { memberId: "mem_rex", categoryId: "cat_infra" },
];

export function createDefaultRevenueFramework(): RevenueFramework {
  return {
    categories: DEFAULT_CATEGORIES.map((category) => ({ ...category })),
    members: DEFAULT_MEMBERS.map((member) => ({ ...member })),
    assignments: DEFAULT_ASSIGNMENTS.map((assignment) => ({ ...assignment })),
  };
}
