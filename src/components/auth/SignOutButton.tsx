"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";

import { wipeAllClientStorage } from "@/lib/storage/wipeAll";

export function SignOutButton() {
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await wipeAllClientStorage();
        await signOut({ callbackUrl: "/" });
      }}
      className="inline-flex h-9 items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
