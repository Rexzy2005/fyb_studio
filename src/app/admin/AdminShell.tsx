"use client";

import type { MouseEvent, ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  LayoutGrid,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  PlusSquare,
  Users,
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
// short and structurally stable — adding/removing items only requires editing
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

  return (
    <div className="h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="flex h-full min-w-0">
        <aside
          className={
            "flex h-full flex-col border-r border-zinc-200 bg-white transition-[width] duration-150 ease-out dark:border-zinc-800 dark:bg-zinc-900 " +
            (collapsed ? "w-16" : "w-55")
          }
        >
          {/* Brand + collapse toggle. The toggle stays visible in both modes. */}
          <div
            className={
              "flex items-center border-b border-zinc-200 px-3 py-3 dark:border-zinc-800 " +
              (collapsed ? "justify-center" : "justify-between gap-2")
            }
          >
            {!collapsed ? (
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-100">
                  FYB Studio
                </div>
                <div className="truncate text-xs text-zinc-600 dark:text-zinc-300">Admin</div>
              </div>
            ) : null}
            <button
              type="button"
              onClick={toggle}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
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

          {/* Navigation. Icons are always present; labels collapse to sr-only. */}
          <nav className="flex-1 space-y-1 p-2 text-sm">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = isActive(item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={handleNavClick(item.href)}
                  title={collapsed ? item.label : undefined}
                  aria-current={active ? "page" : undefined}
                  className={
                    "flex items-center gap-3 rounded-xl px-3 py-2 transition-colors " +
                    (collapsed ? "justify-center " : "") +
                    (active
                      ? "bg-zinc-100 text-zinc-950 dark:bg-zinc-800 dark:text-zinc-50"
                      : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800/60")
                  }
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className={collapsed ? "sr-only" : "truncate"}>{item.label}</span>
                </Link>
              );
            })}

            {!collapsed ? (
              <div className="mt-3 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/40">
                <div className="text-xs font-medium text-zinc-900 dark:text-zinc-100">Shortcuts</div>
                <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">Ctrl+0 resets view</div>
              </div>
            ) : null}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {!hideHeader ? (
            <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">Admin Dashboard</div>
              <div className="flex items-center gap-3">
                <Link
                  href="/templates"
                  className="text-sm font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-200 dark:hover:text-zinc-50"
                >
                  View site
                </Link>
              </div>
            </header>
          ) : null}
          <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
        </div>
      </div>

      {pendingNavHref ? (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => {
              if (savingFromPrompt) return;
              setPendingNavHref(null);
            }}
          />
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
            <div className="border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
              <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">
                Unsaved changes
              </div>
              <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                You have edits in progress. Save them as a draft before
                leaving the workspace?
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-zinc-200 bg-zinc-50 px-5 py-3 dark:border-zinc-800 dark:bg-zinc-800/40">
              <button
                type="button"
                onClick={() => setPendingNavHref(null)}
                disabled={savingFromPrompt}
                className="inline-flex h-9 items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={discardAndContinue}
                disabled={savingFromPrompt}
                className="inline-flex h-9 items-center justify-center rounded-xl border border-red-200 bg-white px-3 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/40 dark:bg-zinc-900 dark:text-red-300 dark:hover:bg-red-950/40"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={confirmSaveAndContinue}
                disabled={savingFromPrompt}
                className="inline-flex h-9 items-center justify-center rounded-xl bg-zinc-900 px-3 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
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
