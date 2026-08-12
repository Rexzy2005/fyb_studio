import { connectDb } from "@/backend/db/client";
import { RevenueFrameworkModel } from "@/backend/db/models";
import { AppError } from "@/backend/errors/app-error";
import { allocateRevenueShares } from "@/lib/revenue/allocateShares";
import {
  createDefaultRevenueFramework,
  DEFAULT_REVENUE_FRAMEWORK_KEY,
} from "@/lib/revenue/defaultFramework";
import type { RevenueAllocation, RevenueFramework } from "@/lib/revenue/types";
import {
  revenueFrameworkSchema,
  type RevenueFrameworkInput,
} from "@/backend/validation/revenueShare.schema";
import { getLifetimeRevenuePool } from "./revenue.service";

export type RevenueShareSnapshot = {
  poolKobo: number;
  poolNgn: number;
  successfulPayments: number;
  framework: RevenueFramework;
  allocation: RevenueAllocation;
  updatedAt: string;
};

function toFramework(doc: {
  categories: Iterable<{ id: string; name: string; weightBps: number; color: string }>;
  members: Iterable<{
    id: string;
    name: string;
    color: string;
    role?: string | null;
  }>;
  assignments: Iterable<{ memberId: string; categoryId: string }>;
}): RevenueFramework {
  return {
    categories: Array.from(doc.categories, (category) => ({
      id: category.id,
      name: category.name,
      weightBps: category.weightBps,
      color: category.color,
    })),
    members: Array.from(doc.members, (member) => ({
      id: member.id,
      name: member.name,
      role: member.role ?? null,
      color: member.color,
    })),
    assignments: Array.from(doc.assignments, (assignment) => ({
      memberId: assignment.memberId,
      categoryId: assignment.categoryId,
    })),
  };
}

async function persistFramework(
  framework: RevenueFramework,
  updatedByUserId: string | null
) {
  await connectDb();
  return RevenueFrameworkModel.findOneAndUpdate(
    { key: DEFAULT_REVENUE_FRAMEWORK_KEY },
    {
      $set: {
        key: DEFAULT_REVENUE_FRAMEWORK_KEY,
        categories: framework.categories,
        members: framework.members,
        assignments: framework.assignments,
        updatedByUserId,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function loadOrSeedFramework() {
  await connectDb();
  const existing = await RevenueFrameworkModel.findOne({
    key: DEFAULT_REVENUE_FRAMEWORK_KEY,
  });
  if (existing) return existing;
  return persistFramework(createDefaultRevenueFramework(), null);
}

async function buildSnapshot(
  framework: RevenueFramework,
  updatedAt: Date
): Promise<RevenueShareSnapshot> {
  const { poolKobo, successfulPayments } = await getLifetimeRevenuePool();
  return {
    poolKobo,
    poolNgn: poolKobo / 100,
    successfulPayments,
    framework,
    allocation: allocateRevenueShares(poolKobo, framework),
    updatedAt: updatedAt.toISOString(),
  };
}

export async function getRevenueShareSnapshot(): Promise<RevenueShareSnapshot> {
  const doc = await loadOrSeedFramework();
  return buildSnapshot(toFramework(doc), doc.updatedAt);
}

export async function saveRevenueFramework(
  input: RevenueFrameworkInput,
  updatedByUserId: string
): Promise<RevenueShareSnapshot> {
  const parsed = revenueFrameworkSchema.parse(input);
  const doc = await persistFramework(parsed, updatedByUserId);
  if (!doc) {
    throw new AppError("INTERNAL_ERROR", "Could not save the revenue framework", 500);
  }
  return buildSnapshot(toFramework(doc), doc.updatedAt);
}

export async function resetRevenueFramework(
  updatedByUserId: string
): Promise<RevenueShareSnapshot> {
  const doc = await persistFramework(
    createDefaultRevenueFramework(),
    updatedByUserId
  );
  if (!doc) {
    throw new AppError("INTERNAL_ERROR", "Could not reset the revenue framework", 500);
  }
  return buildSnapshot(toFramework(doc), doc.updatedAt);
}
