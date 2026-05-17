"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { X, Menu } from "lucide-react";
import { caption, headline } from "@/lib/ui/typography";
import { HeaderAuthSlot } from "@/components/auth/HeaderAuthSlot";

export interface TopNavLink {
  href: string;
  label: string;
}

interface TopNavProps {
  links?: TopNavLink[];
  cta?: { label: string; href: string };
  showAuth?: boolean;
  rightSlot?: ReactNode;
  brandHref?: string;
}

const DEFAULT_LINKS: TopNavLink[] = [
  { href: "/templates", label: "Templates" },
  { href: "/#departments", label: "Departments" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
];

export function TopNav({
  links = DEFAULT_LINKS,
  cta = { label: "Get started", href: "/templates" },
  showAuth = true,
  rightSlot,
  brandHref = "/",
}: TopNavProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <header
        className="sticky top-0 z-30 h-14 border-b backdrop-blur-md"
        style={{
          background: "rgba(9,9,9,0.85)",
          borderColor: "var(--hairline-soft)",
        }}
      >
        <div className="mx-auto flex h-full max-w-[1200px] items-center justify-between gap-4 px-5 sm:px-8">
          <Link href={brandHref} className="flex items-center gap-2.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ background: "#FFD700" }}
              aria-hidden
            />
            <span style={{ ...headline, fontSize: 18 }}>FYB Studio</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-7 sm:flex" style={caption}>
            {links.map((l) => (
              <NavLink key={l.href} href={l.href}>
                {l.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {rightSlot}
            {showAuth && (
              <div className="hidden sm:block">
                <HeaderAuthSlot />
              </div>
            )}
            {cta && (
              <Link
                href={cta.href}
                className="inline-flex h-9 items-center justify-center rounded-full px-4 transition active:scale-95"
                style={{
                  ...caption,
                  background: "#FFD700",
                  color: "#000000",
                  fontWeight: 600,
                }}
              >
                {cta.label}
              </Link>
            )}
            {/* Mobile hamburger */}
            {links.length > 0 && (
              <button
                type="button"
                aria-label={menuOpen ? "Close menu" : "Open menu"}
                className="sm:hidden grid h-9 w-9 place-items-center rounded-xl"
                style={{ color: "var(--ink-muted)", background: "var(--surface-1)" }}
                onClick={() => setMenuOpen((v) => !v)}
              >
                {menuOpen ? <X size={18} /> : <Menu size={18} />}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-40 flex flex-col sm:hidden"
          style={{ background: "rgba(9,9,9,0.97)", paddingTop: 56 }}
          onClick={() => setMenuOpen(false)}
        >
          <nav className="flex flex-col gap-1 px-5 py-6">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="flex items-center py-3 text-xl font-semibold"
                style={{ color: "var(--ink)", letterSpacing: "-0.02em" }}
                onClick={() => setMenuOpen(false)}
              >
                {l.label}
              </Link>
            ))}
            {showAuth && (
              <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--hairline)" }}>
                <HeaderAuthSlot />
              </div>
            )}
            {cta && (
              <div className="mt-4">
                <Link
                  href={cta.href}
                  className="inline-flex h-11 w-full items-center justify-center rounded-2xl text-base font-semibold transition active:scale-95"
                  style={{ background: "#FFD700", color: "#000" }}
                  onClick={() => setMenuOpen(false)}
                >
                  {cta.label}
                </Link>
              </div>
            )}
          </nav>
        </div>
      )}
    </>
  );
}

function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="transition-colors"
      style={{ color: "var(--ink-muted)" }}
      onMouseEnter={(e) => (e.currentTarget.style.color = "var(--ink)")}
      onMouseLeave={(e) => (e.currentTarget.style.color = "var(--ink-muted)")}
    >
      {children}
    </Link>
  );
}
