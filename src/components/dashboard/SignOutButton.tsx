"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

import { wipeAllClientStorage } from "@/lib/storage/wipeAll";

/**
 * Dashboard sign-out control. Clears any local browser state we own (recent
 * downloads, drafts, pending exports) before handing off to next-auth so
 * we don't strand stale data under the wrong identity.
 */
export function SignOutButton() {
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await wipeAllClientStorage();
      await signOut({ callbackUrl: "/" });
    } catch {
      setSigningOut(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={signingOut}
      className="inline-flex items-center gap-2 rounded-full transition active:scale-95 disabled:opacity-60"
      style={{
        fontFamily: "var(--font-geist-mono), monospace",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        height: 38,
        padding: "0 16px",
        background: "rgba(239, 68, 68, 0.08)",
        color: "#ef4444",
        border: "1px solid rgba(239, 68, 68, 0.28)",
      }}
    >
      <LogOut size={13} aria-hidden />
      {signingOut ? "Signing out…" : "Sign out"}
    </button>
  );
}
