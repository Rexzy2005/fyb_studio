"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useId, useRef, useState } from "react";

export function HeaderAuthSlot() {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: PointerEvent) {
      if (!containerRef.current) return;
      if (e.target instanceof Node && containerRef.current.contains(e.target)) return;
      setOpen(false);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (status === "loading") {
    return (
      <div
        aria-hidden
        className="h-10 w-10 animate-pulse rounded-full border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800/60"
      />
    );
  }

  if (status !== "authenticated" || !session?.user) {
    return (
      <Link
        href="/signin"
        className="inline-flex h-10 items-center justify-center rounded-xl bg-zinc-900 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        Sign in
      </Link>
    );
  }

  const name = session.user.name?.trim() || "Account";
  const email = session.user.email ?? null;
  const initial = name.charAt(0).toUpperCase();
  const image = session.user.image ?? null;

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut({ callbackUrl: "/" });
    } catch {
      setSigningOut(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Account menu — ${name}`}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-zinc-200 bg-white shadow-sm transition hover:ring-2 hover:ring-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:ring-zinc-700"
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
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {initial}
          </span>
        )}
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Account menu"
          className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-lg ring-1 ring-black/5 dark:border-zinc-800 dark:bg-zinc-900 dark:ring-white/5"
        >
          <div className="flex items-center gap-3 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
            <div className="grid h-10 w-10 place-items-center overflow-hidden rounded-full border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/60">
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={image}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {initial}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-100">
                {name}
              </div>
              {email ? (
                <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {email}
                </div>
              ) : null}
            </div>
          </div>

          <div className="py-1">
            <Link
              href="/dashboard"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm text-zinc-800 transition hover:bg-zinc-50 focus-visible:bg-zinc-50 focus-visible:outline-none dark:text-zinc-200 dark:hover:bg-zinc-800/60 dark:focus-visible:bg-zinc-800/60"
            >
              <DashboardIcon />
              Dashboard
            </Link>

            <Link
              href="/dashboard#recent-downloads"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-4 py-2.5 text-sm text-zinc-800 transition hover:bg-zinc-50 focus-visible:bg-zinc-50 focus-visible:outline-none dark:text-zinc-200 dark:hover:bg-zinc-800/60 dark:focus-visible:bg-zinc-800/60"
            >
              <DownloadsIcon />
              Downloads
            </Link>

            <button
              type="button"
              role="menuitem"
              disabled={signingOut}
              onClick={handleSignOut}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-rose-700 transition hover:bg-rose-50 focus-visible:bg-rose-50 focus-visible:outline-none disabled:opacity-60 dark:text-rose-300 dark:hover:bg-rose-900/20 dark:focus-visible:bg-rose-900/20"
            >
              <SignOutIcon />
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function DashboardIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  );
}

function DownloadsIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function SignOutIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
