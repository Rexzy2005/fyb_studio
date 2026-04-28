"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, PanelLeftClose, PanelLeftOpen } from "lucide-react";

export default function AdminLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const isWorkspace = pathname.startsWith("/admin/templates/") && pathname !== "/admin/templates" && pathname !== "/admin/templates/new";
  const [sidebarHidden, setSidebarHidden] = useState(isWorkspace);

  useEffect(() => {
    const v = window.localStorage.getItem("fyb:admin:sidebar") === "collapsed";
    setCollapsed(v);
  }, []);

  useEffect(() => {
    // Hide admin chrome by default inside the editor workspace to maximize canvas area.
    setSidebarHidden(isWorkspace);
  }, [isWorkspace]);

  // The template editor and import screen provide their own headers; hide the global
  // "Admin Dashboard" bar there to maximize workspace area.
  const hideHeader = pathname.startsWith("/admin/templates/") && pathname !== "/admin/templates";

  function toggle() {
    setCollapsed((v) => {
      const next = !v;
      window.localStorage.setItem("fyb:admin:sidebar", next ? "collapsed" : "expanded");
      return next;
    });
  }

  return (
    <div className="h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="flex h-full min-w-0">
        {!sidebarHidden ? (
          <aside
            className={
              "flex h-full flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 " +
              (collapsed ? "w-18" : "w-65")
            }
          >
            <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-3 py-3 dark:border-zinc-800">
              <div className={collapsed ? "sr-only" : ""}>
                <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">FYB Studio</div>
                <div className="text-xs text-zinc-600 dark:text-zinc-300">Admin</div>
              </div>
              <div className="flex items-center gap-2">
                {isWorkspace ? (
                  <button
                    type="button"
                    onClick={() => setSidebarHidden(true)}
                    className="inline-flex h-9 items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                    title="Hide menu"
                    aria-label="Hide menu"
                  >
                    Hide
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={toggle}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white text-sm font-medium text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                  title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                  aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                  {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <nav className="flex-1 space-y-1 p-3 text-sm">
              <Link href="/admin" className="block rounded-xl px-3 py-2 text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800/60">
                <span className={collapsed ? "sr-only" : ""}>Dashboard</span>
              </Link>
              <Link href="/admin/templates" className="block rounded-xl px-3 py-2 text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800/60">
                <span className={collapsed ? "sr-only" : ""}>Templates</span>
              </Link>
              <Link href="/admin/templates/new" className="block rounded-xl px-3 py-2 text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800/60">
                <span className={collapsed ? "sr-only" : ""}>Create Template</span>
              </Link>

              <div className="mt-3 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/40">
                <div className={"text-xs font-medium text-zinc-900 dark:text-zinc-100 " + (collapsed ? "sr-only" : "")}>Shortcuts</div>
                <div className={"mt-1 text-xs text-zinc-600 dark:text-zinc-300 " + (collapsed ? "sr-only" : "")}>Ctrl+0 resets view</div>
              </div>
            </nav>
          </aside>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {!hideHeader ? (
            <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">Admin Dashboard</div>
              <div className="flex items-center gap-3">
                <Link href="/templates" className="text-sm font-medium text-zinc-700 hover:text-zinc-900 dark:text-zinc-200 dark:hover:text-zinc-50">
                  View site
                </Link>
              </div>
            </header>
          ) : null}
          <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
        </div>
      </div>

      {isWorkspace ? (
        <button
          type="button"
          onClick={() => setSidebarHidden((v) => !v)}
          className="fixed bottom-6 left-6 z-50 inline-flex items-center gap-2 rounded-full bg-zinc-900 px-3 py-2 text-xs font-medium text-white shadow-lg hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          <Menu className="h-4 w-4" />
          {sidebarHidden ? "Show menu" : "Hide menu"}
        </button>
      ) : null}
    </div>
  );
}

