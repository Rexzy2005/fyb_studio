"use client";

import { useEffect } from "react";

import { sweepExpiredDesigns } from "@/lib/storage/userDesignRepo";

/**
 * Mounted at the root layout so any visit to the app prunes user designs
 * that have crossed their 24-hour expiry. No UI; runs once on mount and once
 * per hour while a tab is open.
 */
export function ExpirySweeper() {
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        await sweepExpiredDesigns();
      } catch (err) {
        console.warn("[ExpirySweeper] sweep failed", err);
      }
    };

    void run();
    const interval = window.setInterval(() => {
      if (cancelled) return;
      void run();
    }, 60 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  return null;
}
