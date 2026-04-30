"use client";

import { getDb } from "./idb";

/**
 * Nukes every client-side surface that could leak the previous user's state.
 * Used on sign-out so the next visitor on this browser starts from a clean slate.
 *
 * Wipes:
 *  - IndexedDB stores (userDesigns, templates, previews, fonts, designAssets)
 *  - localStorage
 *  - sessionStorage
 *  - Cache API entries (service-worker caches, if any)
 *
 * Does not touch httpOnly cookies (server-set, JS can't reach them) — NextAuth
 * signOut clears auth cookies; transient lock cookies (`fyb-lock-*`) expire on
 * their own within 60 minutes and are scoped per-template, so they pose no
 * cross-user risk.
 */
export async function wipeAllClientStorage(): Promise<void> {
  if (typeof window === "undefined") return;

  // 1. Wipe IndexedDB stores in parallel.
  try {
    const db = await getDb();
    await Promise.all([
      db.clear("userDesigns").catch((e) => console.warn("[wipe] userDesigns", e)),
      db.clear("templates").catch((e) => console.warn("[wipe] templates", e)),
      db.clear("previews").catch((e) => console.warn("[wipe] previews", e)),
      db.clear("fonts").catch((e) => console.warn("[wipe] fonts", e)),
      db.clear("designAssets").catch((e) => console.warn("[wipe] designAssets", e)),
    ]);
  } catch (err) {
    console.warn("[wipe] IDB unavailable", err);
  }

  // 2. localStorage (UI prefs, sidebar collapse state, theme, etc.)
  try {
    window.localStorage.clear();
  } catch (err) {
    console.warn("[wipe] localStorage", err);
  }

  // 3. sessionStorage
  try {
    window.sessionStorage.clear();
  } catch (err) {
    console.warn("[wipe] sessionStorage", err);
  }

  // 4. Cache API (service worker caches if any).
  try {
    if (typeof window.caches !== "undefined") {
      const keys = await window.caches.keys();
      await Promise.all(keys.map((k) => window.caches.delete(k)));
    }
  } catch (err) {
    console.warn("[wipe] caches", err);
  }
}
