"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

import type { AdminUserListItem } from "@/backend/services/user.service";

const PAGE_SIZE = 20;

type ApiResponse =
  | { users: AdminUserListItem[] }
  | { error: { code: string; message: string } };

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export default function AdminUsersPage() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/admin/users", { cache: "no-store" });
        const data = (await res.json()) as ApiResponse;
        if (cancelled) return;
        if (!res.ok || "error" in data) {
          const message =
            "error" in data ? data.error.message : `Request failed (${res.status})`;
          setError(message);
          return;
        }
        setUsers(data.users);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Unknown error");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      return (
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.username ?? "").toLowerCase().includes(q) ||
        (u.department?.name ?? "").toLowerCase().includes(q)
      );
    });
  }, [users, search]);

  // Reset to page 1 whenever the filter set shrinks (new search) so the
  // table doesn't show an empty page that's beyond the new last page.
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  useEffect(() => {
    if (safePage !== page) setPage(safePage);
  }, [safePage, page]);

  // Snap back to page 1 when the search term changes so users land on
  // matching results instead of an empty trailing page.
  useEffect(() => {
    setPage(1);
  }, [search]);

  const pageStart = (safePage - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(pageStart, pageStart + PAGE_SIZE);
  const visibleFrom = filtered.length === 0 ? 0 : pageStart + 1;
  const visibleTo = Math.min(filtered.length, pageStart + PAGE_SIZE);

  const onboardedCount = useMemo(
    () => users.filter((u) => u.isOnboarded).length,
    [users]
  );

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-ink dark:text-ink">
              Users
            </h1>
            <p className="mt-1 text-sm text-ink-muted dark:text-ink-muted">
              All registered students across the platform.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-ink-muted dark:text-ink-muted">
            <span>
              <span className="font-semibold text-ink dark:text-ink">
                {users.length}
              </span>{" "}
              total
            </span>
            <span>·</span>
            <span>
              <span className="font-semibold text-ink dark:text-ink">
                {onboardedCount}
              </span>{" "}
              onboarded
            </span>
          </div>
        </header>

        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, username, department"
            className="w-full rounded-xl border border-hairline bg-surface-1 py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-accent-blue focus:outline-none dark:border-hairline dark:bg-surface-1 dark:text-ink dark:placeholder:text-ink-faint"
          />
        </div>

        {error ? (
          <div className="rounded-xl border border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.08)] p-4 text-sm text-danger dark:border-[rgba(239,68,68,0.28)] dark:bg-red-950/40 dark:text-danger">
            {error}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-2xl border border-hairline bg-surface-1 dark:border-hairline dark:bg-surface-1">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-hairline bg-canvas text-xs uppercase tracking-wider text-ink-faint dark:border-hairline dark:bg-surface-1/60 dark:text-ink-faint">
                <tr>
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Username</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Department</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Last login</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {loading ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-6 text-center text-ink-muted dark:text-ink-muted"
                    >
                      Loading users…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-6 text-center text-ink-muted dark:text-ink-muted"
                    >
                      {users.length === 0
                        ? "No users yet."
                        : "No users match your search."}
                    </td>
                  </tr>
                ) : (
                  pageRows.map((u) => (
                    <tr
                      key={u.id}
                      className="hover:bg-canvas dark:hover:bg-surface-2/40"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar src={u.avatar} name={u.name} />
                          <div className="min-w-0">
                            <div className="truncate font-medium text-ink dark:text-ink">
                              {u.name}
                            </div>
                            {u.isDepartmentHead ? (
                              <div className="text-[11px] font-medium uppercase tracking-wider text-warning dark:text-warning">
                                Dept. Head
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-ink-muted dark:text-ink">
                        {u.username ? `@${u.username}` : <span className="text-ink-faint">-</span>}
                      </td>
                      <td className="px-4 py-3 text-ink-muted dark:text-ink">
                        {u.email}
                      </td>
                      <td className="px-4 py-3 text-ink-muted dark:text-ink">
                        {u.department?.name ?? <span className="text-ink-faint">-</span>}
                      </td>
                      <td className="px-4 py-3">
                        {u.isOnboarded ? (
                          <span className="inline-flex items-center rounded-full bg-[var(--accent-blue-soft)] px-2 py-0.5 text-xs font-medium text-[var(--accent-blue)] dark:bg-[var(--accent-blue-soft)] dark:text-[var(--accent-blue)]">
                            Onboarded
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-ink-muted dark:bg-surface-2 dark:text-ink-muted">
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-ink-muted dark:text-ink-muted">
                        {formatDate(u.lastLoginAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pager - only when there's something to page through. Page-N-of-M
              label sits opposite the prev/next controls; both stack on
              narrow screens via flex-wrap. */}
          {!loading && filtered.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-4 py-3 dark:border-hairline">
              <div className="text-xs text-ink-muted dark:text-ink-muted">
                Showing{" "}
                <span className="font-semibold text-ink dark:text-ink tabular-nums">
                  {visibleFrom}–{visibleTo}
                </span>{" "}
                of{" "}
                <span className="font-semibold text-ink dark:text-ink tabular-nums">
                  {filtered.length}
                </span>
                {search.trim() ? " filtered" : ""}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  aria-label="Previous page"
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-hairline bg-surface-1 px-3 text-xs font-medium text-ink-muted transition hover:bg-canvas hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 dark:border-hairline dark:bg-surface-1 dark:text-ink-muted dark:hover:bg-surface-2 dark:hover:text-ink"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Prev</span>
                </button>
                <div className="inline-flex h-9 min-w-[5rem] items-center justify-center rounded-xl border border-hairline bg-canvas px-3 text-xs font-semibold tabular-nums text-ink dark:border-hairline dark:bg-surface-2 dark:text-ink">
                  Page {safePage} / {totalPages}
                </div>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  aria-label="Next page"
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-hairline bg-surface-1 px-3 text-xs font-medium text-ink-muted transition hover:bg-canvas hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 dark:border-hairline dark:bg-surface-1 dark:text-ink-muted dark:hover:bg-surface-2 dark:hover:text-ink"
                >
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Avatar({ src, name }: { src: string | null; name: string }) {
  if (src) {
    return (
      <Image
        src={src}
        alt={name}
        width={36}
        height={36}
        className="h-9 w-9 rounded-full object-cover"
        unoptimized
      />
    );
  }
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-ink-muted dark:bg-surface-2 dark:text-ink">
      {initials(name) || "?"}
    </div>
  );
}
