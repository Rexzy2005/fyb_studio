"use client";

import { signOut } from "next-auth/react";

import { wipeAllClientStorage } from "@/lib/storage/wipeAll";

export async function hardSignOut(callbackUrl = "/"): Promise<void> {
  try {
    await signOut({ redirect: false, callbackUrl });
  } catch (err) {
    console.warn("[auth] next-auth signOut failed", err);
  }

  try {
    await fetch("/api/auth/hard-signout", {
      method: "POST",
      cache: "no-store",
      keepalive: true,
    });
  } catch (err) {
    console.warn("[auth] hard sign-out cleanup failed", err);
  }

  await wipeAllClientStorage();
  window.location.replace(callbackUrl);
}
