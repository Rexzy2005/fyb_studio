"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { bodySm } from "@/lib/ui/typography";

export function GoogleSignInButton({ callbackUrl }: { callbackUrl?: string }) {
  const [pending, setPending] = useState(false);

  async function onClick() {
    if (pending) return;
    setPending(true);
    try {
      await signIn("google", { callbackUrl: callbackUrl ?? "/dashboard" });
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex w-full items-center justify-center gap-3 rounded-full transition disabled:cursor-not-allowed disabled:opacity-60"
      style={{
        ...bodySm,
        height: 48,
        padding: "0 22px",
        background: "var(--ink)",
        color: "#000",
        border: "1px solid var(--ink)",
      }}
    >
      <GoogleMark />
      <span>{pending ? "Redirecting…" : "Continue with Google"}</span>
    </button>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.5-5.9 7.8-11.3 7.8a12 12 0 1 1 0-24c3 0 5.7 1.1 7.8 2.9l5.7-5.7A19.9 19.9 0 0 0 24 4a20 20 0 1 0 19.6 16.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8A12 12 0 0 1 24 12c3 0 5.7 1.1 7.8 2.9l5.7-5.7A19.9 19.9 0 0 0 24 4 20 20 0 0 0 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44a19.9 19.9 0 0 0 13.4-5.2l-6.2-5.2A11.9 11.9 0 0 1 24 36a12 12 0 0 1-11.3-7.9l-6.6 5.1A20 20 0 0 0 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2c-.4.4 6.6-4.8 6.6-14.8 0-1.3-.1-2.3-.4-3.5z"
      />
    </svg>
  );
}
