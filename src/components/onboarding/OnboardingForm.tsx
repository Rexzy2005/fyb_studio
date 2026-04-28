"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import type { DepartmentListItem } from "@/backend/services/department.service";
import { UsernameField } from "@/components/onboarding/UsernameField";
import { DepartmentSelect } from "@/components/onboarding/DepartmentSelect";

type ApiError = {
  error?: { code?: string; message?: string };
};

export function OnboardingForm() {
  const { update: updateSession } = useSession();

  const [departments, setDepartments] = useState<DepartmentListItem[]>([]);
  const [loadingDepts, setLoadingDepts] = useState(true);

  const [username, setUsername] = useState("");
  const [usernameValid, setUsernameValid] = useState(false);
  const [departmentId, setDepartmentId] = useState("");
  const [isHead, setIsHead] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/departments");
        if (!res.ok) throw new Error("Failed to load departments");
        const data = (await res.json()) as { departments: DepartmentListItem[] };
        if (!cancelled) setDepartments(data.departments);
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setServerError("Could not load departments. Refresh and try again.");
        }
      } finally {
        if (!cancelled) setLoadingDepts(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedDept = useMemo(
    () => departments.find((d) => d.id === departmentId),
    [departments, departmentId]
  );

  useEffect(() => {
    if (selectedDept?.hasHead && isHead) {
      setIsHead(false);
    }
  }, [selectedDept, isHead]);

  const headDisabled = !selectedDept || selectedDept.hasHead;

  const canSubmit =
    !submitting && usernameValid && Boolean(departmentId) && !loadingDepts;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setSubmitting(true);
    setServerError(null);
    try {
      const res = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          departmentId,
          isDepartmentHead: isHead,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as ApiError;
        const code = data.error?.code;
        if (code === "USERNAME_TAKEN") {
          setServerError("That username was just taken. Pick another.");
        } else if (code === "DEPARTMENT_HEAD_TAKEN") {
          setServerError(
            "Someone just claimed the head role for that department. Uncheck the box and continue."
          );
        } else {
          setServerError(data.error?.message ?? "Something went wrong.");
        }
        return;
      }

      await updateSession();
      window.location.assign("/dashboard");
      return;
    } catch (err) {
      console.error(err);
      setServerError("Network error. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <UsernameField
        value={username}
        onChange={setUsername}
        onValidityChange={setUsernameValid}
      />

      <DepartmentSelect
        departments={departments}
        value={departmentId}
        onChange={setDepartmentId}
        loading={loadingDepts}
      />

      <label
        className={
          "flex items-start gap-3 rounded-2xl border p-3 transition " +
          (headDisabled
            ? "border-zinc-200 bg-zinc-50 opacity-60 dark:border-zinc-800 dark:bg-zinc-900/50"
            : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900")
        }
      >
        <input
          type="checkbox"
          checked={isHead}
          disabled={headDisabled}
          onChange={(e) => setIsHead(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-400 dark:border-zinc-700"
        />
        <span className="text-sm leading-5 text-zinc-800 dark:text-zinc-200">
          <span className="font-medium">I am the department head</span>
          <span className="mt-0.5 block text-[11px] text-zinc-500 dark:text-zinc-400">
            {selectedDept?.hasHead
              ? "This department already has a head."
              : "Only one head per department."}
          </span>
        </span>
      </label>

      {serverError ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
          {serverError}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={!canSubmit}
        className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-zinc-900 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        {submitting ? "Setting up your account…" : "Continue to dashboard"}
      </button>
    </form>
  );
}
