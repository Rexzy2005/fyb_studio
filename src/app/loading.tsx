"use client";

import { ProgressModal } from "@/components/ui/ProgressModal";

export default function Loading() {
  return (
    <div className="min-h-dvh bg-zinc-50 dark:bg-zinc-950">
      <ProgressModal
        open
        title="Loading"
        subtitle="Preparing page"
        hint="This runs locally in your browser."
      />
    </div>
  );
}
