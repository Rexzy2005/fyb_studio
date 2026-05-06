import mongoose from "mongoose";

import { connectDb } from "@/backend/db/client";
import {
  DownloadEvent,
  Payment,
} from "@/backend/db/models";

export type RevenueSummary = {
  successfulPayments: number;
  totalRevenueNgn: number;
  totalDownloads: number;
  uniquePayingUsers: number;
  pendingPayments: number;
  failedPayments: number;
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
  status: "pending" | "success" | "failed" | "abandoned";
  paystackReference: string;
  templateName: string | null;
  userName: string | null;
  userEmail: string | null;
  createdAt: string;
  paidAt: string | null;
};

export async function getRevenueSummary(): Promise<RevenueSummary> {
  await connectDb();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    successAgg,
    payingUsersAgg,
    pendingCount,
    failedCount,
    last30PaymentAgg,
    totalDownloadsCount,
    last30DownloadsCount,
  ] = await Promise.all([
    Payment.aggregate<{
      _id: null;
      totalKobo: number;
      count: number;
    }>([
      { $match: { status: "success" } },
      { $group: { _id: null, totalKobo: { $sum: "$amountKobo" }, count: { $sum: 1 } } },
    ]),
    Payment.distinct("userId", { status: "success" }),
    Payment.countDocuments({ status: "pending" }),
    Payment.countDocuments({ status: { $in: ["failed", "abandoned"] } }),
    Payment.aggregate<{
      _id: null;
      totalKobo: number;
      count: number;
    }>([
      { $match: { status: "success", paidAt: { $gte: since } } },
      { $group: { _id: null, totalKobo: { $sum: "$amountKobo" }, count: { $sum: 1 } } },
    ]),
    DownloadEvent.countDocuments({}),
    DownloadEvent.countDocuments({ occurredAt: { $gte: since } }),
  ]);

  const successful = successAgg[0]?.count ?? 0;
  const totalKobo = successAgg[0]?.totalKobo ?? 0;
  const last30Kobo = last30PaymentAgg[0]?.totalKobo ?? 0;
  const last30Count = last30PaymentAgg[0]?.count ?? 0;
  const uniquePayingUsers = Array.isArray(payingUsersAgg) ? payingUsersAgg.length : 0;

  return {
    successfulPayments: successful,
    totalRevenueNgn: totalKobo / 100,
    totalDownloads: totalDownloadsCount,
    uniquePayingUsers,
    pendingPayments: pendingCount,
    failedPayments: failedCount,
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

  const [paymentBuckets, downloadBuckets] = await Promise.all([
    Payment.aggregate<{
      _id: string;
      revenueKobo: number;
      payments: number;
    }>([
      { $match: { status: "success", paidAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$paidAt", timezone: "UTC" } },
          revenueKobo: { $sum: "$amountKobo" },
          payments: { $sum: 1 },
        },
      },
    ]),
    DownloadEvent.aggregate<{ _id: string; downloads: number }>([
      { $match: { occurredAt: { $gte: since } } },
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

  const paymentAgg = await Payment.aggregate<{
    _id: mongoose.Types.ObjectId;
    payments: number;
    revenueKobo: number;
  }>([
    { $match: { status: "success" } },
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
    { $match: { templateId: { $in: templateIds } } },
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
    return {
      id: String(r._id),
      amountNgn: r.amountKobo / 100,
      status: r.status as RecentPaymentRow["status"],
      paystackReference: r.paystackReference,
      templateName: template?.name ?? null,
      userName: user?.name ?? null,
      userEmail: user?.email ?? null,
      createdAt: r.createdAt.toISOString(),
      paidAt: r.paidAt ? r.paidAt.toISOString() : null,
    };
  });
}
