import mongoose from "mongoose";

import { connectDb } from "@/backend/db/client";
import {
  DownloadEvent,
  Payment,
  User,
  type PaymentStatus,
} from "@/backend/db/models";

export type RevenueSummary = {
  successfulPayments: number;
  totalRevenueNgn: number;
  totalDownloads: number;
  uniquePayingUsers: number;
  pendingPayments: number;
  failedPayments: number;
  paymentStatusCounts: Record<PaymentStatus, number>;
  averageDownloadsPerPaidUser: number;
  // Snapshots over the last 30 days for the dashboard's headline numbers.
  last30Days: {
    revenueNgn: number;
    payments: number;
    downloads: number;
  };
};

export type RevenueDailyBucket = {
  date: string; // YYYY-MM-DD (UTC)
  revenueNgn: number;
  payments: number;
  downloads: number;
};

export type TopTemplateRow = {
  templateId: string;
  templateName: string;
  payments: number;
  revenueNgn: number;
  downloads: number;
};

export type RecentPaymentRow = {
  id: string;
  amountNgn: number;
  status: PaymentStatus;
  paystackStatus: string | null;
  paystackReference: string;
  templateName: string | null;
  userName: string | null;
  userEmail: string | null;
  isExcludedFromRevenue: boolean;
  createdAt: string;
  initializedAt: string | null;
  expiresAt: string | null;
  paidAt: string | null;
  lastVerifiedAt: string | null;
  failureReason: string | null;
  journey: Array<{
    status: PaymentStatus;
    source: string;
    message: string | null;
    paystackStatus: string | null;
    at: string;
  }>;
};

export const REVENUE_EXCLUDED_EMAILS = [
  "timothypererat2004@gmail.com",
  "dogknottingbaby002@gmail.com",
] as const;

const REVENUE_EXCLUDED_EMAIL_SET = new Set<string>(REVENUE_EXCLUDED_EMAILS);

const ALL_PAYMENT_STATUSES: PaymentStatus[] = [
  "pending",
  "success",
  "failed",
  "abandoned",
  "cancelled",
  "expired",
  "timeout",
  "ongoing",
  "processing",
  "queued",
  "reversed",
];

const ATTENTION_PAYMENT_STATUSES: PaymentStatus[] = [
  "failed",
  "abandoned",
  "cancelled",
  "expired",
  "timeout",
  "reversed",
];

type MongoMatch = Record<string, unknown>;
type UserExclusion = { userId?: { $nin: mongoose.Types.ObjectId[] } };

function isRevenueExcludedEmail(email: string | null | undefined): boolean {
  return Boolean(email && REVENUE_EXCLUDED_EMAIL_SET.has(email.toLowerCase()));
}

async function getRevenueExcludedUserIds(): Promise<mongoose.Types.ObjectId[]> {
  const users = await User.find({ email: { $in: REVENUE_EXCLUDED_EMAILS } })
    .select("_id")
    .lean<Array<{ _id: mongoose.Types.ObjectId }>>();
  return users.map((user) => user._id);
}

function withoutRevenueExcludedUsers<const T extends MongoMatch>(
  match: T,
  excludedUserIds: mongoose.Types.ObjectId[]
): T & UserExclusion {
  if (excludedUserIds.length === 0) return match;
  return {
    ...match,
    userId: { $nin: excludedUserIds },
  };
}

export async function getRevenueSummary(): Promise<RevenueSummary> {
  await connectDb();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const excludedUserIds = await getRevenueExcludedUserIds();

  const [
    successAgg,
    payingUsersAgg,
    pendingCount,
    failedCount,
    statusAgg,
    last30PaymentAgg,
    totalDownloadsCount,
    last30DownloadsCount,
  ] = await Promise.all([
    Payment.aggregate<{
      _id: null;
      totalKobo: number;
      count: number;
    }>([
      { $match: withoutRevenueExcludedUsers({ status: "success" }, excludedUserIds) },
      { $group: { _id: null, totalKobo: { $sum: "$amountKobo" }, count: { $sum: 1 } } },
    ]),
    Payment.distinct(
      "userId",
      withoutRevenueExcludedUsers({ status: "success" }, excludedUserIds)
    ),
    Payment.countDocuments(
      withoutRevenueExcludedUsers({ status: "pending" }, excludedUserIds)
    ),
    Payment.countDocuments(
      withoutRevenueExcludedUsers(
        {
          status: {
            $in: ATTENTION_PAYMENT_STATUSES,
          },
        },
        excludedUserIds
      )
    ),
    Payment.aggregate<{ _id: PaymentStatus; count: number }>([
      { $match: withoutRevenueExcludedUsers({}, excludedUserIds) },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    Payment.aggregate<{
      _id: null;
      totalKobo: number;
      count: number;
    }>([
      {
        $match: withoutRevenueExcludedUsers(
          { status: "success", paidAt: { $gte: since } },
          excludedUserIds
        ),
      },
      { $group: { _id: null, totalKobo: { $sum: "$amountKobo" }, count: { $sum: 1 } } },
    ]),
    DownloadEvent.countDocuments(withoutRevenueExcludedUsers({}, excludedUserIds)),
    DownloadEvent.countDocuments(
      withoutRevenueExcludedUsers({ occurredAt: { $gte: since } }, excludedUserIds)
    ),
  ]);

  const successful = successAgg[0]?.count ?? 0;
  const totalKobo = successAgg[0]?.totalKobo ?? 0;
  const last30Kobo = last30PaymentAgg[0]?.totalKobo ?? 0;
  const last30Count = last30PaymentAgg[0]?.count ?? 0;
  const uniquePayingUsers = Array.isArray(payingUsersAgg) ? payingUsersAgg.length : 0;
  const paymentStatusCounts = ALL_PAYMENT_STATUSES.reduce(
    (acc, status) => {
      acc[status] = 0;
      return acc;
    },
    {} as Record<PaymentStatus, number>
  );
  for (const row of statusAgg) {
    if (row._id in paymentStatusCounts) paymentStatusCounts[row._id] = row.count;
  }

  return {
    successfulPayments: successful,
    totalRevenueNgn: totalKobo / 100,
    totalDownloads: totalDownloadsCount,
    uniquePayingUsers,
    pendingPayments: pendingCount,
    failedPayments: failedCount,
    paymentStatusCounts,
    averageDownloadsPerPaidUser:
      uniquePayingUsers > 0
        ? Math.round((totalDownloadsCount / uniquePayingUsers) * 10) / 10
        : 0,
    last30Days: {
      revenueNgn: last30Kobo / 100,
      payments: last30Count,
      downloads: last30DownloadsCount,
    },
  };
}

/**
 * Integer kobo pool used by the revenue-share allocator. Same definition
 * as `totalRevenueNgn` on the dashboard: successful Paystack payments,
 * test accounts excluded. Returned in kobo so the split never floats.
 */
export async function getLifetimeRevenuePool(): Promise<{
  poolKobo: number;
  successfulPayments: number;
}> {
  await connectDb();
  const excludedUserIds = await getRevenueExcludedUserIds();
  const successAgg = await Payment.aggregate<{
    _id: null;
    totalKobo: number;
    count: number;
  }>([
    { $match: withoutRevenueExcludedUsers({ status: "success" }, excludedUserIds) },
    { $group: { _id: null, totalKobo: { $sum: "$amountKobo" }, count: { $sum: 1 } } },
  ]);

  return {
    poolKobo: successAgg[0]?.totalKobo ?? 0,
    successfulPayments: successAgg[0]?.count ?? 0,
  };
}

/**
 * Daily revenue + payment + download buckets for the last `days` days,
 * UTC-bucketed. Missing days are filled with zeros so the chart doesn't
 * skip dates.
 */
export async function getRevenueDailyBuckets(
  days = 30
): Promise<RevenueDailyBucket[]> {
  await connectDb();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  // Truncate to start-of-UTC-day so the chart x-axis aligns with calendar
  // days regardless of the moment we ran the query.
  since.setUTCHours(0, 0, 0, 0);
  const excludedUserIds = await getRevenueExcludedUserIds();

  const [paymentBuckets, downloadBuckets] = await Promise.all([
    Payment.aggregate<{
      _id: string;
      revenueKobo: number;
      payments: number;
    }>([
      {
        $match: withoutRevenueExcludedUsers(
          { status: "success", paidAt: { $gte: since } },
          excludedUserIds
        ),
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$paidAt", timezone: "UTC" } },
          revenueKobo: { $sum: "$amountKobo" },
          payments: { $sum: 1 },
        },
      },
    ]),
    DownloadEvent.aggregate<{ _id: string; downloads: number }>([
      {
        $match: withoutRevenueExcludedUsers(
          { occurredAt: { $gte: since } },
          excludedUserIds
        ),
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$occurredAt", timezone: "UTC" } },
          downloads: { $sum: 1 },
        },
      },
    ]),
  ]);

  const byDate = new Map<string, RevenueDailyBucket>();
  for (let i = 0; i < days; i++) {
    const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    byDate.set(key, { date: key, revenueNgn: 0, payments: 0, downloads: 0 });
  }
  for (const b of paymentBuckets) {
    const cur = byDate.get(b._id);
    if (!cur) continue;
    cur.revenueNgn = b.revenueKobo / 100;
    cur.payments = b.payments;
  }
  for (const b of downloadBuckets) {
    const cur = byDate.get(b._id);
    if (!cur) continue;
    cur.downloads = b.downloads;
  }

  return Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
}

export async function getTopTemplates(limit = 5): Promise<TopTemplateRow[]> {
  await connectDb();
  const excludedUserIds = await getRevenueExcludedUserIds();

  const paymentAgg = await Payment.aggregate<{
    _id: mongoose.Types.ObjectId;
    payments: number;
    revenueKobo: number;
  }>([
    { $match: withoutRevenueExcludedUsers({ status: "success" }, excludedUserIds) },
    {
      $group: {
        _id: "$templateId",
        payments: { $sum: 1 },
        revenueKobo: { $sum: "$amountKobo" },
      },
    },
    { $sort: { revenueKobo: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: "templates",
        localField: "_id",
        foreignField: "_id",
        as: "template",
      },
    },
    { $unwind: { path: "$template", preserveNullAndEmptyArrays: true } },
    {
      $project: {
        payments: 1,
        revenueKobo: 1,
        templateName: "$template.name",
      },
    },
  ]);

  if (paymentAgg.length === 0) return [];

  const templateIds = paymentAgg.map((p) => p._id);
  const downloadCounts = await DownloadEvent.aggregate<{
    _id: mongoose.Types.ObjectId;
    downloads: number;
  }>([
    {
      $match: withoutRevenueExcludedUsers(
        { templateId: { $in: templateIds } },
        excludedUserIds
      ),
    },
    { $group: { _id: "$templateId", downloads: { $sum: 1 } } },
  ]);
  const downloadByTemplate = new Map<string, number>();
  for (const d of downloadCounts) {
    downloadByTemplate.set(String(d._id), d.downloads);
  }

  return paymentAgg.map((p) => ({
    templateId: String(p._id),
    templateName:
      (p as unknown as { templateName?: string }).templateName ?? "(deleted template)",
    payments: p.payments,
    revenueNgn: p.revenueKobo / 100,
    downloads: downloadByTemplate.get(String(p._id)) ?? 0,
  }));
}

export async function getRecentPayments(limit = 20): Promise<RecentPaymentRow[]> {
  await connectDb();
  const rows = await Payment.find({})
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate<{
      templateId: { name?: string } | null;
      userId: { name?: string; email?: string } | null;
    }>([
      { path: "templateId", select: "name" },
      { path: "userId", select: "name email" },
    ])
    .lean();

  return rows.map((r) => {
    const template = r.templateId as unknown as { name?: string } | null;
    const user = r.userId as unknown as { name?: string; email?: string } | null;
    const userEmail = user?.email ?? null;
    return {
      id: String(r._id),
      amountNgn: r.amountKobo / 100,
      status: r.status as RecentPaymentRow["status"],
      paystackStatus: r.paystackStatus ?? null,
      paystackReference: r.paystackReference,
      templateName: template?.name ?? null,
      userName: user?.name ?? null,
      userEmail,
      isExcludedFromRevenue: isRevenueExcludedEmail(userEmail),
      createdAt: r.createdAt.toISOString(),
      initializedAt: r.initializedAt ? new Date(r.initializedAt).toISOString() : null,
      expiresAt: r.expiresAt ? new Date(r.expiresAt).toISOString() : null,
      paidAt: r.paidAt ? r.paidAt.toISOString() : null,
      lastVerifiedAt: r.lastVerifiedAt ? new Date(r.lastVerifiedAt).toISOString() : null,
      failureReason: r.failureReason ?? null,
      journey: (r.statusHistory ?? []).map((entry) => ({
        status: entry.status as PaymentStatus,
        source: entry.source,
        message: entry.message ?? null,
        paystackStatus: entry.paystackStatus ?? null,
        at: entry.at ? new Date(entry.at).toISOString() : r.createdAt.toISOString(),
      })),
    };
  });
}
