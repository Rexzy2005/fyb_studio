"use client";

import { PieChart } from "lucide-react";

import { RevenueSharePanel } from "@/components/admin/RevenueSharePanel";

export default function AdminRevenueSharePage() {
  return (
    <div className="h-full overflow-y-auto bg-canvas/40 p-4 sm:p-6 lg:p-8 dark:bg-canvas/40">
      <div className="mx-auto max-w-7xl space-y-6">
        <header>
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
            <PieChart className="h-3.5 w-3.5" />
            Lifetime product revenue
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink dark:text-ink">
            Revenue share
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-muted dark:text-ink-muted">
            How every naira of confirmed product revenue is split among the
            team. The same Total revenue figure as the dashboard — test
            accounts excluded. Edit people and weights when the deal changes.
          </p>
        </header>

        <RevenueSharePanel heading="none" />
      </div>
    </div>
  );
}
