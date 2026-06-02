"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BookmarkX,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";

import type { DepartmentListItem } from "@/backend/services/department.service";
import type { AdminUserListItem } from "@/backend/services/user.service";
import {
  deleteAdminTemplateLock,
  fetchAdminTemplateLocks,
  updateAdminTemplateLock,
  type AdminTemplateLockListItem,
} from "@/lib/api/adminTemplateLocks";

type ApiErrorResponse = { error?: { message?: string } };

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = (await res.json()) as ApiErrorResponse;
      message = data.error?.message ?? message;
    } catch {
      // Keep fallback message.
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

function formatDate(iso: string): string {
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
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default function AdminReservationsPage() {
  const [locks, setLocks] = useState<AdminTemplateLockListItem[]>([]);
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [departments, setDepartments] = useState<DepartmentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<AdminTemplateLockListItem | null>(null);
  const [editDepartmentId, setEditDepartmentId] = useState("");
  const [editUserId, setEditUserId] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminTemplateLockListItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadAll(options: { quiet?: boolean } = {}) {
    if (options.quiet) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [nextLocks, usersData, departmentsData] = await Promise.all([
        fetchAdminTemplateLocks(),
        fetchJson<{ users: AdminUserListItem[] }>("/api/admin/users"),
        fetchJson<{ departments: DepartmentListItem[] }>("/api/departments"),
      ]);
      setLocks(nextLocks);
      setUsers(usersData.users);
      setDepartments(departmentsData.departments);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reservations");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return locks;
    return locks.filter((lock) => {
      return (
        (lock.template?.name ?? "").toLowerCase().includes(q) ||
        (lock.department?.name ?? "").toLowerCase().includes(q) ||
        (lock.department?.abbreviation ?? "").toLowerCase().includes(q) ||
        (lock.lockedBy?.name ?? "").toLowerCase().includes(q) ||
        (lock.lockedBy?.email ?? "").toLowerCase().includes(q) ||
        (lock.lockedBy?.username ?? "").toLowerCase().includes(q)
      );
    });
  }, [locks, search]);

  const stats = useMemo(() => {
    const departmentCount = new Set(
      locks.map((lock) => lock.department?.id).filter((id): id is string => Boolean(id))
    ).size;
    const missingRecords = locks.filter((lock) => !lock.template || !lock.department || !lock.lockedBy).length;
    return {
      reservations: locks.length,
      departments: departmentCount,
      missingRecords,
    };
  }, [locks]);

  const eligibleUsers = useMemo(
    () => users.filter((user) => user.department?.id === editDepartmentId),
    [users, editDepartmentId]
  );

  function openEdit(lock: AdminTemplateLockListItem) {
    const deptId = lock.department?.id ?? "";
    setEditing(lock);
    setEditDepartmentId(deptId);
    setEditUserId(lock.lockedBy?.departmentId === deptId ? lock.lockedBy.id : "");
  }

  function onDepartmentChange(departmentId: string) {
    setEditDepartmentId(departmentId);
    setEditUserId((current) => {
      const currentUser = users.find((user) => user.id === current);
      if (currentUser?.department?.id === departmentId) return current;
      return users.find((user) => user.department?.id === departmentId)?.id ?? "";
    });
  }

  async function saveEdit() {
    if (!editing || !editDepartmentId || !editUserId) return;
    setSavingEdit(true);
    setError(null);
    try {
      const updated = await updateAdminTemplateLock(editing.id, {
        departmentId: editDepartmentId,
        lockedByUserId: editUserId,
      });
      setLocks((prev) => prev.map((lock) => (lock.id === updated.id ? updated : lock)));
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update reservation");
    } finally {
      setSavingEdit(false);
    }
  }

  async function freeReservation(lock: AdminTemplateLockListItem) {
    setDeletingId(lock.id);
    setError(null);
    try {
      await deleteAdminTemplateLock(lock.id);
      setLocks((prev) => prev.filter((row) => row.id !== lock.id));
      setDeleteTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to free reservation");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-canvas/40 p-4 sm:p-6 lg:p-8 dark:bg-canvas/40">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-faint">
              <ShieldCheck className="h-3.5 w-3.5" />
              Template reservations
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink dark:text-ink">
              Reservations
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-muted dark:text-ink-muted">
              Monitor taken templates, the department that reserved each one, and the user who made the reservation.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadAll({ quiet: true })}
            disabled={refreshing || loading}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-hairline bg-surface-1 px-4 text-sm font-medium text-ink-muted transition hover:bg-canvas hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 dark:border-hairline dark:bg-surface-1 dark:text-ink"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </header>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat label="Taken templates" value={stats.reservations} />
          <Stat label="Departments reserving" value={stats.departments} />
          <Stat label="Records needing review" value={stats.missingRecords} tone={stats.missingRecords ? "warning" : "normal"} />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by template, department, user, email"
              className="h-10 w-full rounded-xl border border-hairline bg-surface-1 pl-9 pr-3 text-sm text-ink outline-none transition placeholder:text-ink-faint focus:border-accent-blue dark:border-hairline dark:bg-surface-1 dark:text-ink"
            />
          </div>
          <div className="text-xs text-ink-muted dark:text-ink-muted">
            Showing <span className="font-semibold text-ink dark:text-ink">{filtered.length}</span> of{" "}
            <span className="font-semibold text-ink dark:text-ink">{locks.length}</span>
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.08)] p-4 text-sm text-danger dark:border-[rgba(239,68,68,0.28)] dark:bg-red-950/40 dark:text-danger">
            {error}
          </div>
        ) : null}

        <div className="overflow-hidden rounded-2xl border border-hairline bg-surface-1 dark:border-hairline dark:bg-surface-1">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="border-b border-hairline bg-canvas text-xs uppercase tracking-wider text-ink-faint dark:border-hairline dark:bg-surface-1/60">
                <tr>
                  <th className="px-4 py-3 font-medium">Template</th>
                  <th className="px-4 py-3 font-medium">Department</th>
                  <th className="px-4 py-3 font-medium">Reserved by</th>
                  <th className="px-4 py-3 font-medium">Reserved</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-ink-muted">
                      Loading reservations...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-ink-muted">
                      {locks.length === 0 ? "No templates are taken right now." : "No reservations match your search."}
                    </td>
                  </tr>
                ) : (
                  filtered.map((lock) => (
                    <tr key={lock.id} className="hover:bg-canvas dark:hover:bg-surface-2/40">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl border border-hairline bg-canvas dark:border-hairline dark:bg-surface-2">
                            {lock.template?.coverUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={lock.template.coverUrl} alt="" className="h-full w-full object-contain p-1" />
                            ) : (
                              <span className="text-[10px] text-ink-faint">No cover</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-medium text-ink dark:text-ink">
                              {lock.template?.name ?? "(deleted template)"}
                            </div>
                            <div className="mt-1 inline-flex items-center rounded-full border border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.08)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-danger">
                              Taken
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {lock.department ? (
                          <div>
                            <div className="font-medium text-ink dark:text-ink">{lock.department.name}</div>
                            <div className="mt-1 text-xs text-ink-muted">
                              {lock.department.abbreviation}
                            </div>
                          </div>
                        ) : (
                          <span className="text-ink-faint">Missing department</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {lock.lockedBy ? (
                          <div className="flex items-center gap-3">
                            <UserAvatar name={lock.lockedBy.name} avatar={lock.lockedBy.avatar} />
                            <div className="min-w-0">
                              <div className="truncate font-medium text-ink dark:text-ink">
                                {lock.lockedBy.name}
                              </div>
                              <div className="truncate text-xs text-ink-muted">
                                {lock.lockedBy.username ? `@${lock.lockedBy.username}` : lock.lockedBy.email}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-ink-faint">Missing user</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-ink-muted">
                        <div>{formatDate(lock.createdAt)}</div>
                        <div className="mt-1 text-xs">Updated {formatDate(lock.updatedAt)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          {lock.template ? (
                            <Link
                              href={`/templates/${lock.template.id}/preview`}
                              className="inline-flex h-9 items-center justify-center rounded-xl border border-hairline bg-surface-1 px-3 text-xs font-medium text-ink-muted transition hover:bg-canvas hover:text-ink dark:border-hairline dark:bg-surface-1 dark:text-ink"
                            >
                              Open
                            </Link>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => openEdit(lock)}
                            disabled={!lock.template}
                            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-hairline bg-surface-1 px-3 text-xs font-medium text-ink-muted transition hover:bg-canvas hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 dark:border-hairline dark:bg-surface-1 dark:text-ink"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Update
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(lock)}
                            disabled={deletingId === lock.id}
                            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.08)] px-3 text-xs font-medium text-danger transition hover:bg-[rgba(239,68,68,0.12)] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <BookmarkX className="h-3.5 w-3.5" />
                            Free
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/45 backdrop-blur-sm"
            aria-label="Close update reservation dialog"
            onClick={() => setEditing(null)}
          />
          <div className="relative w-full max-w-lg rounded-2xl border border-hairline bg-surface-1 p-5 shadow-2xl dark:border-hairline dark:bg-surface-1">
            <h2 className="text-lg font-semibold tracking-tight text-ink dark:text-ink">
              Update reservation
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Reassign who owns the reservation for {editing.template?.name ?? "this template"}.
            </p>

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wider text-ink-faint">
                  Department
                </span>
                <select
                  value={editDepartmentId}
                  onChange={(e) => onDepartmentChange(e.target.value)}
                  className="mt-1 h-11 w-full rounded-xl border border-hairline bg-canvas px-3 text-sm text-ink outline-none focus:border-accent-blue dark:border-hairline dark:bg-surface-2 dark:text-ink"
                >
                  <option value="">Select department</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id}>
                      {dept.name} ({dept.abbreviation})
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-medium uppercase tracking-wider text-ink-faint">
                  Reserving user
                </span>
                <select
                  value={editUserId}
                  onChange={(e) => setEditUserId(e.target.value)}
                  disabled={!editDepartmentId || eligibleUsers.length === 0}
                  className="mt-1 h-11 w-full rounded-xl border border-hairline bg-canvas px-3 text-sm text-ink outline-none focus:border-accent-blue disabled:cursor-not-allowed disabled:opacity-60 dark:border-hairline dark:bg-surface-2 dark:text-ink"
                >
                  <option value="">Select user</option>
                  {eligibleUsers.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} - {user.email}
                    </option>
                  ))}
                </select>
                {editDepartmentId && eligibleUsers.length === 0 ? (
                  <span className="mt-1 block text-xs text-warning">
                    This department has no users to assign as the reserving user.
                  </span>
                ) : null}
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-hairline bg-surface-1 px-4 text-sm font-medium text-ink-muted hover:bg-canvas hover:text-ink dark:border-hairline dark:bg-surface-1 dark:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={!editDepartmentId || !editUserId || savingEdit}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-surface-2 px-4 text-sm font-medium text-ink transition hover:bg-surface-1 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-surface-2 dark:text-ink"
              >
                {savingEdit ? "Saving..." : "Save update"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/45 backdrop-blur-sm"
            aria-label="Close free reservation dialog"
            onClick={() => setDeleteTarget(null)}
          />
          <div className="relative w-full max-w-md rounded-2xl border border-[rgba(239,68,68,0.28)] bg-surface-1 p-5 shadow-2xl dark:bg-surface-1">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[rgba(239,68,68,0.08)] text-danger">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-ink dark:text-ink">
                  Free this template?
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                  This deletes the reservation record for {deleteTarget.template?.name ?? "this template"} and makes the design free for other departments.
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-hairline bg-surface-1 px-4 text-sm font-medium text-ink-muted hover:bg-canvas hover:text-ink dark:border-hairline dark:bg-surface-1 dark:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void freeReservation(deleteTarget)}
                disabled={deletingId === deleteTarget.id}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-[var(--semantic-danger)] px-4 text-sm font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deletingId === deleteTarget.id ? "Freeing..." : "Free / delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "normal",
}: {
  label: string;
  value: number;
  tone?: "normal" | "warning";
}) {
  return (
    <div className="rounded-2xl border border-hairline bg-surface-1 p-4 dark:border-hairline dark:bg-surface-1">
      <div className="text-xs font-medium uppercase tracking-wider text-ink-faint">
        {label}
      </div>
      <div
        className={
          "mt-1 text-2xl font-semibold tabular-nums " +
          (tone === "warning" ? "text-warning" : "text-ink dark:text-ink")
        }
      >
        {value}
      </div>
    </div>
  );
}

function UserAvatar({ name, avatar }: { name: string; avatar: string | null }) {
  const [failedAvatar, setFailedAvatar] = useState<string | null>(null);
  const showAvatar = Boolean(avatar && failedAvatar !== avatar);

  if (avatar && showAvatar) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatar}
        alt=""
        className="h-9 w-9 rounded-full object-cover"
        referrerPolicy="no-referrer"
        onError={() => setFailedAvatar(avatar)}
      />
    );
  }
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-ink-muted dark:bg-surface-2 dark:text-ink">
      {initials(name) || "?"}
    </div>
  );
}
