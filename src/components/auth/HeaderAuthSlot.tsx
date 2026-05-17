"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useId, useRef, useState } from "react";
import { bodySm, caption, micro } from "@/lib/ui/typography";

import { wipeAllClientStorage } from "@/lib/storage/wipeAll";

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
        className="fyb-skeleton h-9 w-9 rounded-full"
        style={{ borderRadius: 999 }}
      />
    );
  }

  if (status !== "authenticated" || !session?.user) {
    return (
      <Link
        href="/signin"
        className="inline-flex items-center justify-center rounded-full transition hover:scale-[0.98]"
        style={{
          ...caption,
          height: 36,
          padding: "0 16px",
          background: "var(--surface-2)",
          color: "var(--ink)",
          border: "1px solid var(--hairline)",
        }}
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
      await wipeAllClientStorage();
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
        aria-label={`Account menu - ${name}`}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 w-9 items-center justify-center overflow-hidden rounded-full transition"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--hairline)",
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
          <span style={{ ...bodySm, color: "var(--ink)", fontWeight: 600 }}>{initial}</span>
        )}
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Account menu"
          className="absolute right-0 top-12 z-50 w-64 overflow-hidden"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--hairline)",
            borderRadius: 16,
            boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
          }}
        >
          <div
            className="flex items-center gap-3 px-4 py-3"
            style={{ borderBottom: "1px solid var(--hairline)" }}
          >
            <div
              className="grid h-10 w-10 place-items-center overflow-hidden rounded-full"
              style={{ background: "var(--surface-2)", border: "1px solid var(--hairline)" }}
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
                <span style={{ ...bodySm, color: "var(--ink)", fontWeight: 600 }}>{initial}</span>
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate" style={{ ...bodySm, color: "var(--ink)", fontWeight: 600 }}>
                {name}
              </div>
              {email ? (
                <div className="truncate" style={{ ...micro, color: "var(--ink-faint)" }}>
                  {email}
                </div>
              ) : null}
            </div>
          </div>

          <div className="py-1">
            <MenuLink href="/dashboard" onClick={() => setOpen(false)}>
              <DashboardIcon /> Dashboard
            </MenuLink>
            <MenuLink href="/dashboard#recent-downloads" onClick={() => setOpen(false)}>
              <DownloadsIcon /> Downloads
            </MenuLink>
            <button
              type="button"
              role="menuitem"
              disabled={signingOut}
              onClick={handleSignOut}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left transition disabled:opacity-60"
              style={{
                ...bodySm,
                color: "var(--semantic-danger)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(239, 68, 68, 0.08)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
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

function MenuLink({
  href,
  onClick,
  children,
}: {
  href: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2.5 transition"
      style={{ ...bodySm, color: "var(--ink)" }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-2)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {children}
    </Link>
  );
}

function DashboardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  );
}
function DownloadsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
function SignOutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
