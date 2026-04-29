"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Search } from "lucide-react";

import type { AdminUserListItem } from "@/backend/services/user.service";

type ApiResponse =
  | { users: AdminUserListItem[] }
  | { error: { code: string; message: string } };

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
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

  const onboardedCount = useMemo(
    () => users.filter((u) => u.isOnboarded).length,
    [users]
  );

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-100">
              Users
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              All registered students across the platform.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-600 dark:text-zinc-300">
            <span>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {users.length}
              </span>{" "}
              total
            </span>
            <span>·</span>
            <span>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {onboardedCount}
              </span>{" "}
              onboarded
            </span>
          </div>
        </header>

        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, username, department"
            className="w-full rounded-xl border border-zinc-200 bg-white py-2 pl-9 pr-3 text-sm text-zinc-900 placeholder:text-zinc-500 focus:border-zinc-400 focus:outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
          />
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-400">
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
                      className="px-4 py-6 text-center text-zinc-600 dark:text-zinc-300"
                    >
                      Loading users…
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-6 text-center text-zinc-600 dark:text-zinc-300"
                    >
                      {users.length === 0
                        ? "No users yet."
                        : "No users match your search."}
                    </td>
                  </tr>
                ) : (
                  filtered.map((u) => (
                    <tr
                      key={u.id}
                      className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar src={u.avatar} name={u.name} />
                          <div className="min-w-0">
                            <div className="truncate font-medium text-zinc-950 dark:text-zinc-100">
                              {u.name}
                            </div>
                            {u.isDepartmentHead ? (
                              <div className="text-[11px] font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400">
                                Dept. Head
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-zinc-700 dark:text-zinc-200">
                        {u.username ? `@${u.username}` : <span className="text-zinc-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-zinc-700 dark:text-zinc-200">
                        {u.email}
                      </td>
                      <td className="px-4 py-3 text-zinc-700 dark:text-zinc-200">
                        {u.department?.name ?? <span className="text-zinc-400">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {u.isOnboarded ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                            Onboarded
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300">
                        {formatDate(u.lastLoginAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
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
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-200 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
      {initials(name) || "?"}
    </div>
  );
}
