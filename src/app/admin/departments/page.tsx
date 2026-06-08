"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Building2, CheckCircle2, Plus, Search, Trash2 } from "lucide-react";

import type { DepartmentListItem } from "@/backend/services/department.service";

type ApiDepartmentsResponse =
  | { departments: DepartmentListItem[] }
  | { error: { code: string; message: string } };

type CreateDepartmentResponse =
  | { department: DepartmentListItem }
  | { error: { code: string; message: string } };

async function readDepartments(): Promise<DepartmentListItem[]> {
  const res = await fetch("/api/admin/departments", { cache: "no-store" });
  const data = (await res.json()) as ApiDepartmentsResponse;
  if (!res.ok || "error" in data) {
    throw new Error("error" in data ? data.error.message : `Request failed (${res.status})`);
  }
  return data.departments;
}

export default function AdminDepartmentsPage() {
  const [departments, setDepartments] = useState<DepartmentListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [abbreviation, setAbbreviation] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setDepartments(await readDepartments());
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load departments");
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
    if (!q) return departments;
    return departments.filter(
      (dept) =>
        dept.name.toLowerCase().includes(q) ||
        dept.abbreviation.toLowerCase().includes(q) ||
        dept.slug.toLowerCase().includes(q)
    );
  }, [departments, search]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/admin/departments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, abbreviation }),
      });
      const data = (await res.json()) as CreateDepartmentResponse;
      if (!res.ok || "error" in data) {
        throw new Error("error" in data ? data.error.message : `Request failed (${res.status})`);
      }
      setDepartments((current) =>
        [...current, data.department].sort((a, b) => a.name.localeCompare(b.name))
      );
      setName("");
      setAbbreviation("");
      setSuccess(`${data.department.name} has been added.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add department");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(dept: DepartmentListItem) {
    const confirmed = window.confirm(`Delete ${dept.name}? This removes it from the database.`);
    if (!confirmed) return;

    setDeletingId(dept.id);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/admin/departments/${dept.id}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { ok?: boolean; error?: { message: string } };
      if (!res.ok || !data.ok) {
        throw new Error(data.error?.message ?? `Request failed (${res.status})`);
      }
      setDepartments((current) => current.filter((item) => item.id !== dept.id));
      setSuccess(`${dept.name} has been deleted.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete department");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-ink dark:text-ink">
              Departments
            </h1>
            <p className="mt-1 text-sm text-ink-muted dark:text-ink-muted">
              Add departments to MongoDB for onboarding, reservations, and admin filters.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-xl border border-hairline bg-surface-1 px-3 py-2 text-xs text-ink-muted dark:border-hairline dark:bg-surface-1 dark:text-ink-muted">
            <Building2 className="h-4 w-4" />
            <span>
              <span className="font-semibold text-ink dark:text-ink">{departments.length}</span>{" "}
              departments
            </span>
          </div>
        </header>

        {error ? (
          <div className="rounded-xl border border-[rgba(239,68,68,0.28)] bg-[rgba(239,68,68,0.08)] p-4 text-sm text-danger dark:border-[rgba(239,68,68,0.28)] dark:bg-red-950/40 dark:text-danger">
            {error}
          </div>
        ) : null}

        {success ? (
          <div className="flex items-center gap-2 rounded-xl border border-[rgba(34,197,94,0.28)] bg-[rgba(34,197,94,0.08)] p-4 text-sm text-[rgb(22,163,74)] dark:border-[rgba(34,197,94,0.28)] dark:bg-green-950/30 dark:text-[rgb(74,222,128)]">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {success}
          </div>
        ) : null}

        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-hairline bg-surface-1 p-4 dark:border-hairline dark:bg-surface-1"
        >
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_auto]">
            <div>
              <label htmlFor="department-name" className="mb-1.5 block text-xs font-medium text-ink-muted dark:text-ink-muted">
                Department name
              </label>
              <input
                id="department-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Software Engineering"
                className="h-10 w-full rounded-xl border border-hairline bg-canvas px-3 text-sm text-ink outline-none transition placeholder:text-ink-faint focus:border-accent-blue dark:border-hairline dark:bg-surface-2 dark:text-ink dark:placeholder:text-ink-faint"
                disabled={saving}
              />
            </div>
            <div>
              <label htmlFor="department-abbreviation" className="mb-1.5 block text-xs font-medium text-ink-muted dark:text-ink-muted">
                Abbreviation
              </label>
              <input
                id="department-abbreviation"
                value={abbreviation}
                onChange={(e) => setAbbreviation(e.target.value.toUpperCase())}
                placeholder="SWE"
                className="h-10 w-full rounded-xl border border-hairline bg-canvas px-3 text-sm font-semibold uppercase tracking-wide text-ink outline-none transition placeholder:font-normal placeholder:tracking-normal placeholder:text-ink-faint focus:border-accent-blue dark:border-hairline dark:bg-surface-2 dark:text-ink dark:placeholder:text-ink-faint"
                disabled={saving}
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={saving || !name.trim() || !abbreviation.trim()}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent-blue)] px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 lg:w-auto"
              >
                <Plus className="h-4 w-4" />
                {saving ? "Adding..." : "Add department"}
              </button>
            </div>
          </div>
        </form>

        <section className="overflow-hidden rounded-2xl border border-hairline bg-surface-1 dark:border-hairline dark:bg-surface-1">
          <div className="border-b border-hairline p-4 dark:border-hairline">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search departments"
                className="h-10 w-full rounded-xl border border-hairline bg-canvas pl-9 pr-3 text-sm text-ink outline-none transition placeholder:text-ink-faint focus:border-accent-blue dark:border-hairline dark:bg-surface-2 dark:text-ink dark:placeholder:text-ink-faint"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-hairline bg-canvas text-xs uppercase tracking-wider text-ink-faint dark:border-hairline dark:bg-surface-1/60 dark:text-ink-faint">
                <tr>
                  <th className="px-4 py-3 font-medium">Department</th>
                  <th className="px-4 py-3 font-medium">Abbreviation</th>
                  <th className="px-4 py-3 font-medium">Slug</th>
                  <th className="px-4 py-3 font-medium">Head status</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-ink-muted dark:text-ink-muted">
                      Loading departments...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-ink-muted dark:text-ink-muted">
                      {departments.length === 0 ? "No departments yet." : "No departments match your search."}
                    </td>
                  </tr>
                ) : (
                  filtered.map((dept) => (
                    <tr key={dept.id} className="hover:bg-canvas dark:hover:bg-surface-2/40">
                      <td className="px-4 py-3 font-medium text-ink dark:text-ink">{dept.name}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-ink dark:bg-surface-2 dark:text-ink">
                          {dept.abbreviation}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-ink-muted dark:text-ink-muted">
                        {dept.slug}
                      </td>
                      <td className="px-4 py-3">
                        {dept.hasHead ? (
                          <span className="inline-flex rounded-full bg-[rgba(245,158,11,0.10)] px-2 py-0.5 text-xs font-medium text-warning">
                            Head assigned
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-ink-muted dark:bg-surface-2 dark:text-ink-muted">
                            Head open
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => onDelete(dept)}
                          disabled={deletingId === dept.id}
                          className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-[rgba(239,68,68,0.28)] bg-surface-1 px-3 text-xs font-medium text-danger transition hover:bg-[rgba(239,68,68,0.08)] disabled:cursor-not-allowed disabled:opacity-50 dark:border-[rgba(239,68,68,0.28)] dark:bg-surface-1 dark:text-red-300 dark:hover:bg-red-950/40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {deletingId === dept.id ? "Deleting..." : "Delete"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
