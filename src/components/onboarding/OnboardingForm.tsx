"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import type { DepartmentListItem } from "@/backend/services/department.service";
import { UsernameField } from "@/components/onboarding/UsernameField";
import { DepartmentSelect } from "@/components/onboarding/DepartmentSelect";
import { safeReturnPath } from "@/lib/auth/safeRedirect";
import { Button } from "@/components/ui/Button";
import { bodySm, micro } from "@/lib/ui/typography";

type ApiError = {
  error?: { code?: string; message?: string };
};

export function OnboardingForm({ returnTo }: { returnTo?: string }) {
  const { update: updateSession } = useSession();
  const destination = safeReturnPath(returnTo, "/dashboard");

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

  const canSubmit = !submitting && usernameValid && Boolean(departmentId) && !loadingDepts;

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

      try {
        await updateSession({
          user: { isOnboarded: true },
        } as Parameters<typeof updateSession>[0]);
      } catch {
        /* ignore - server-side update is the source of truth */
      }
      window.location.assign(destination);
      return;
    } catch (err) {
      console.error(err);
      setServerError("Network error. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <UsernameField value={username} onChange={setUsername} onValidityChange={setUsernameValid} />

      <DepartmentSelect
        departments={departments}
        value={departmentId}
        onChange={setDepartmentId}
        loading={loadingDepts}
      />

      <label
        className="flex items-start gap-3 rounded-[12px] p-3 transition"
        style={{
          background: headDisabled ? "var(--surface-2)" : "var(--surface-1)",
          border: "1px solid var(--hairline)",
          opacity: headDisabled ? 0.6 : 1,
          cursor: headDisabled ? "not-allowed" : "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={isHead}
          disabled={headDisabled}
          onChange={(e) => setIsHead(e.target.checked)}
          className="mt-0.5 h-4 w-4"
          style={{ accentColor: "var(--accent-blue)" }}
        />
        <span className="flex flex-col gap-0.5">
          <span style={{ ...bodySm, color: "var(--ink)", fontWeight: 600 }}>I am the department head</span>
          <span style={{ ...micro, color: "var(--ink-faint)" }}>
            {selectedDept?.hasHead
              ? "This department already has a head."
              : "Only one head per department."}
          </span>
        </span>
      </label>

      {serverError ? (
        <div
          className="rounded-[12px] px-3 py-2.5"
          style={{
            background: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.28)",
            color: "var(--semantic-danger)",
            fontSize: 13,
          }}
        >
          {serverError}
        </div>
      ) : null}

      <Button type="submit" variant="primary" size="lg" fullWidth loading={submitting} disabled={!canSubmit}>
        {submitting ? "Setting up your account…" : "Continue to dashboard"}
      </Button>
    </form>
  );
}
