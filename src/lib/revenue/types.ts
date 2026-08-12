export type RevenueCategory = {
  id: string;
  name: string;
  /** Integer basis points. 10_000 = 100%. */
  weightBps: number;
  color: string;
};

export type RevenueMember = {
  id: string;
  name: string;
  role: string | null;
  color: string;
};

export type RevenueAssignment = {
  memberId: string;
  categoryId: string;
};

export type RevenueFramework = {
  categories: RevenueCategory[];
  members: RevenueMember[];
  assignments: RevenueAssignment[];
};

export type AllocatedCategoryShare = {
  categoryId: string;
  categoryName: string;
  kobo: number;
};

export type AllocatedCategory = RevenueCategory & {
  potKobo: number;
  contributorIds: string[];
  /** Kobo left after equal floor-division, then handed out by largest remainder. */
  leftoverKobo: number;
};

export type AllocatedMember = RevenueMember & {
  totalKobo: number;
  /** Theoretical share from the framework (may be fractional bps). */
  frameworkBps: number;
  /** Allocated share of the live pool, rounded to integer bps for display. */
  allocatedBps: number;
  byCategory: AllocatedCategoryShare[];
};

export type RevenueAllocationProof = {
  memberSumKobo: number;
  categorySumKobo: number;
  balanced: boolean;
};

export type RevenueAllocation = {
  poolKobo: number;
  categories: AllocatedCategory[];
  members: AllocatedMember[];
  proof: RevenueAllocationProof;
};
