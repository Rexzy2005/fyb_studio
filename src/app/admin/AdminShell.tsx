"use client";

import type { MouseEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  LayoutGrid,
  Menu,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  PlusSquare,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";

import { useEditorDirty } from "@/lib/stores/editorDirtyStore";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Match condition: true = active when pathname startsWith href; false = exact match. */
  prefix?: boolean;
};

// Icons appear in collapsed mode; labels appear when expanded. Keep this list
// short and structurally stable - adding/removing items only requires editing
// this array (the renderer below is data-driven).
const NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/templates", label: "Templates", icon: LayoutGrid, prefix: true },
  { href: "/admin/templates/new", label: "Create Template", icon: PlusSquare },
  { href: "/admin/users", label: "Users", icon: Users, prefix: true },
  { href: "/admin/feedback", label: "Feedback", icon: MessageSquareText, prefix: true },
];

export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  // Mobile-only drawer state. On md+ the sidebar is always visible inline,
  // so this flag is ignored there.
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Close the mobile drawer whenever the route changes - otherwise it would
  // stick open over the page the user just navigated to.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  // Lock body scroll while the mobile drawer is open so the page behind
  // doesn't scroll under the user's finger.
  useEffect(() => {
    if (!mobileNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [mobileNavOpen]);

  // ESC closes the drawer.
  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileNavOpen]);

  // Unsaved-changes guard. Reads the dirty bit + flushSave callback that the
  // template editor registers while it's mounted; intercepts nav clicks so
  // the admin can save, discard, or stay before navigating away.
  const dirty = useEditorDirty((s) => s.dirty);
  const flushSave = useEditorDirty((s) => s.flushSave);
  const [pendingNavHref, setPendingNavHref] = useState<string | null>(null);
  const [savingFromPrompt, setSavingFromPrompt] = useState(false);

  // Browser-tab close / refresh: native confirmation when dirty. The custom
  // returnValue text isn't shown by modern browsers, but setting any value
  // triggers the standard "Are you sure you want to leave?" dialog.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // Restore the user's last collapse preference. We only persist this single
  // bit so the sidebar feels stable across navigation.
  useEffect(() => {
    const v = window.localStorage.getItem("fyb:admin:sidebar") === "collapsed";
    setCollapsed(v);
  }, []);

  function handleNavClick(href: string) {
    return (e: MouseEvent<HTMLAnchorElement>) => {
      // Allow cmd/ctrl-click for new-tab behaviour to bypass the prompt.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
      if (!dirty) return;
      if (href === pathname) return;
      e.preventDefault();
      setPendingNavHref(href);
    };
  }

  async function confirmSaveAndContinue() {
    if (!pendingNavHref) return;
    const target = pendingNavHref;
    if (flushSave) {
      setSavingFromPrompt(true);
      try {
        await flushSave();
      } finally {
        setSavingFromPrompt(false);
      }
    }
    setPendingNavHref(null);
    router.push(target);
  }

  function discardAndContinue() {
    if (!pendingNavHref) return;
    const target = pendingNavHref;
    setPendingNavHref(null);
    router.push(target);
  }

  // Hide the generic "Admin Dashboard" header on workspace pages so the
  // template editor's own header is the only one visible.
  const hideHeader = pathname.startsWith("/admin/templates/") && pathname !== "/admin/templates";

  function toggle() {
    setCollapsed((v) => {
      const next = !v;
      window.localStorage.setItem("fyb:admin:sidebar", next ? "collapsed" : "expanded");
      return next;
    });
  }

  function isActive(item: NavItem): boolean {
    if (item.prefix) {
      // Special-case: /admin/templates/new should highlight "Create Template",
      // not "Templates", so the more specific item wins on exact match.
      if (item.href === "/admin/templates" && pathname === "/admin/templates/new") {
        return false;
      }
      return pathname === item.href || pathname.startsWith(item.href + "/");
    }
    return pathname === item.href;
  }

  // Nav contents are identical between desktop sidebar and mobile drawer,
  // so we render them once and reuse. The two contexts pass different
  // `forceExpanded` flags - collapse logic only applies on desktop.
  const renderNav = (forceExpanded: boolean) => {
    const showLabels = forceExpanded || !collapsed;
    return (
      <nav className="flex-1 space-y-1 p-2 text-sm">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={handleNavClick(item.href)}
              title={showLabels ? undefined : item.label}
              aria-current={active ? "page" : undefined}
              className={
                "flex items-center gap-3 rounded-xl px-3 py-2 transition-colors " +
                (showLabels ? "" : "justify-center ") +
                (active
                  ? "bg-surface-2 text-ink dark:bg-surface-2 dark:text-ink"
                  : "text-ink-muted hover:bg-canvas dark:text-ink dark:hover:bg-surface-2/60")
              }
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span className={showLabels ? "truncate" : "sr-only"}>{item.label}</span>
            </Link>
          );
        })}

        {showLabels ? (
          <div className="mt-3 rounded-xl bg-canvas p-3 dark:bg-surface-2/40">
            <div className="text-xs font-medium text-ink dark:text-ink">Shortcuts</div>
            <div className="mt-1 text-xs text-ink-muted dark:text-ink-muted">Ctrl+0 resets view</div>
          </div>
        ) : null}
      </nav>
    );
  };

  return (
    <div className="h-screen bg-canvas dark:bg-canvas">
      <div className="flex h-full min-w-0">
        {/* Desktop sidebar - hidden on mobile (where the drawer below takes
            over). Desktop layout is preserved exactly as before. */}
        <aside
          className={
            "hidden h-full md:flex flex-col border-r border-hairline bg-surface-1 transition-[width] duration-150 ease-out dark:border-hairline dark:bg-surface-1 " +
            (collapsed ? "w-16" : "w-55")
          }
        >
          {/* Brand + collapse toggle. The toggle stays visible in both modes. */}
          <div
            className={
              "flex items-center border-b border-hairline px-3 py-3 dark:border-hairline " +
              (collapsed ? "justify-center" : "justify-between gap-2")
            }
          >
            {!collapsed ? (
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-ink dark:text-ink">
                  FYB Studio
                </div>
                <div className="truncate text-xs text-ink-muted dark:text-ink-muted">Admin</div>
              </div>
            ) : null}
            <button
              type="button"
              onClick={toggle}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-hairline bg-surface-1 text-ink hover:bg-canvas dark:border-hairline dark:bg-surface-1 dark:text-ink dark:hover:bg-surface-2"
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </button>
          </div>

          {renderNav(false)}
        </aside>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Mobile-only top bar - hamburger + brand + view-site link.
              md+ keeps using the existing "Admin Dashboard" header below. */}
          <header className="flex items-center justify-between border-b border-hairline bg-surface-1 px-3 py-2.5 md:hidden dark:border-hairline dark:bg-surface-1">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                aria-label="Open navigation"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-hairline bg-surface-1 text-ink hover:bg-canvas active:scale-95 dark:border-hairline dark:bg-surface-1 dark:text-ink dark:hover:bg-surface-2"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold leading-tight text-ink dark:text-ink">
                  FYB Studio
                </div>
                <div className="truncate text-[10px] uppercase tracking-wider text-ink-muted dark:text-ink-muted">
                  Admin
                </div>
              </div>
            </div>
            <Link
              href="/templates"
              className="inline-flex h-9 items-center justify-center rounded-full border border-hairline bg-surface-1 px-3 text-xs font-medium text-ink-muted hover:text-ink dark:border-hairline dark:bg-surface-1 dark:text-ink"
            >
              View site
            </Link>
          </header>

          {!hideHeader ? (
            <header className="hidden md:flex items-center justify-between border-b border-hairline bg-surface-1 px-4 py-3 dark:border-hairline dark:bg-surface-1">
              <div className="text-sm font-semibold text-ink dark:text-ink">Admin Dashboard</div>
              <div className="flex items-center gap-3">
                <Link
                  href="/templates"
                  className="text-sm font-medium text-ink-muted hover:text-ink dark:text-ink dark:hover:text-ink"
                >
                  View site
                </Link>
              </div>
            </header>
          ) : null}
          <div className="min-h-0 flex-1 overflow-auto md:overflow-hidden">{children}</div>
        </div>
      </div>

      {/* Mobile drawer - slides in from the left on tap. Hidden on md+. */}
      {mobileNavOpen ? (
        <div
          className="fixed inset-0 z-50 flex md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/45 backdrop-blur-sm"
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside
            className="relative flex h-full w-[80vw] max-w-[280px] flex-col border-r border-hairline bg-surface-1 shadow-2xl dark:border-hairline dark:bg-surface-1"
            style={{ animation: "fyb-admin-drawer-in 220ms cubic-bezier(0.22, 0.61, 0.36, 1)" }}
          >
            <div className="flex items-center justify-between gap-2 border-b border-hairline px-4 py-3 dark:border-hairline">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-ink dark:text-ink">
                  FYB Studio
                </div>
                <div className="truncate text-xs text-ink-muted dark:text-ink-muted">Admin</div>
              </div>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close navigation"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-hairline bg-surface-1 text-ink hover:bg-canvas active:scale-95 dark:border-hairline dark:bg-surface-1 dark:text-ink dark:hover:bg-surface-2"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {renderNav(true)}
          </aside>
          <style>{`
            @keyframes fyb-admin-drawer-in {
              from { transform: translateX(-100%); }
              to { transform: translateX(0); }
            }
          `}</style>
        </div>
      ) : null}

      {pendingNavHref ? (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => {
              if (savingFromPrompt) return;
              setPendingNavHref(null);
            }}
          />
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-hairline bg-surface-1 shadow-2xl dark:border-hairline dark:bg-surface-1">
            <div className="border-b border-hairline px-5 py-4 dark:border-hairline">
              <div className="text-sm font-semibold text-ink dark:text-ink">
                Unsaved changes
              </div>
              <div className="mt-1 text-xs text-ink-muted dark:text-ink-muted">
                You have edits in progress. Save them as a draft before
                leaving the workspace?
              </div>
            </div>
            <div className="flex flex-col-reverse gap-2 border-t border-hairline bg-canvas px-5 py-3 sm:flex-row sm:items-center sm:justify-end dark:border-hairline dark:bg-surface-2/40">
              <button
                type="button"
                onClick={() => setPendingNavHref(null)}
                disabled={savingFromPrompt}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-hairline bg-surface-1 px-3 text-xs font-medium text-ink hover:bg-canvas disabled:opacity-50 sm:h-9 dark:border-hairline dark:bg-surface-1 dark:text-ink dark:hover:bg-surface-2"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={discardAndContinue}
                disabled={savingFromPrompt}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-[rgba(239,68,68,0.28)] bg-surface-1 px-3 text-xs font-medium text-danger hover:bg-[rgba(239,68,68,0.08)] disabled:opacity-50 sm:h-9 dark:border-[rgba(239,68,68,0.28)] dark:bg-surface-1 dark:text-red-300 dark:hover:bg-red-950/40"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={confirmSaveAndContinue}
                disabled={savingFromPrompt}
                className="inline-flex h-11 items-center justify-center rounded-xl bg-surface-1 px-3 text-xs font-medium text-white hover:bg-surface-2 disabled:opacity-50 sm:h-9 dark:bg-surface-2 dark:text-ink dark:hover:bg-surface-1"
              >
                {savingFromPrompt ? "Saving…" : "Save & continue"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
