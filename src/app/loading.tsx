"use client";

import { ProgressModal } from "@/components/ui/ProgressModal";

export default function Loading() {
  return (
    <div className="min-h-dvh bg-canvas">
      <ProgressModal
        open
        title="Loading"
        subtitle="Preparing page"
        hint="This runs locally in your browser."
      />
    </div>
  );
}
