"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { bodySm, caption } from "@/lib/ui/typography";

/**
 * Right-rail auth slot for the global navbar.
 *
 * - Loading: shimmer placeholder.
 * - Unauthenticated: hidden (the rest of the navbar handles the CTA).
 * - Authenticated: a single avatar pill that links straight to /dashboard.
 *   No dropdown — direct click-through, per product decision.
 */
export function HeaderAuthSlot() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div
        aria-hidden
        className="fyb-skeleton h-9 w-9 rounded-full"
        style={{ borderRadius: 999 }}
      />
    );
  }

  if (status !== "authenticated" || !session?.user) {
    return null;
  }

  const name = session.user.name?.trim() || "Account";
  const initial = name.charAt(0).toUpperCase();
  const image = session.user.image ?? null;

  return (
    <Link
      href="/dashboard"
      aria-label={`Open dashboard - ${name}`}
      title={name}
      className="inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-full transition active:scale-95 hover:scale-105"
      style={{
        background: "rgba(255,215,0,0.06)",
        border: "1px solid rgba(255,215,0,0.28)",
        boxShadow: "0 4px 10px rgba(255,180,0,0.15)",
        ...caption,
      }}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
        />
      ) : (
        <span style={{ ...bodySm, color: "#FFD700", fontWeight: 700 }}>{initial}</span>
      )}
    </Link>
  );
}
