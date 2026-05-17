"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import type { DepartmentListItem } from "@/backend/services/department.service";
import { UsernameField } from "@/components/onboarding/UsernameField";
import { DepartmentSelect } from "@/components/onboarding/DepartmentSelect";
import { safeReturnPath } from "@/lib/auth/safeRedirect";
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
        className="flex items-start gap-3 rounded-xl p-3.5 transition"
        style={{
          background: isHead && !headDisabled
            ? "linear-gradient(140deg, rgba(255,215,0,0.10), rgba(255,140,66,0.04))"
            : "rgba(255,255,255,0.025)",
          border: `1px solid ${
            isHead && !headDisabled ? "rgba(255,215,0,0.4)" : "rgba(255,215,0,0.15)"
          }`,
          opacity: headDisabled ? 0.5 : 1,
          cursor: headDisabled ? "not-allowed" : "pointer",
          boxShadow: isHead && !headDisabled ? "0 0 0 3px rgba(255,215,0,0.08)" : "none",
        }}
      >
        <input
          type="checkbox"
          checked={isHead}
          disabled={headDisabled}
          onChange={(e) => setIsHead(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0"
          style={{ accentColor: "#FFD700" }}
        />
        <span className="flex flex-col gap-0.5">
          <span style={{ ...bodySm, color: "#fff", fontWeight: 600 }}>I am the department head</span>
          <span style={{ ...micro, color: "rgba(255,255,255,0.45)" }}>
            {selectedDept?.hasHead
              ? "This department already has a head."
              : "Only one head per department. Heads can reserve designs for their dept."}
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

      <button
        type="submit"
        disabled={!canSubmit}
        className="group relative inline-flex w-full items-center justify-center gap-2.5 rounded-xl transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
        style={{
          height: 54,
          padding: "0 24px",
          background: "#FFD700",
          color: "#000",
          border: "1px solid #FFD700",
          fontWeight: 800,
          fontSize: 14,
          letterSpacing: "0.02em",
          boxShadow: canSubmit
            ? "0 10px 28px rgba(255,180,0,0.35), inset 0 1px 0 rgba(255,255,255,0.25)"
            : "none",
        }}
      >
        {submitting ? (
          <>
            <span className="fyb-dots" aria-hidden>
              <span /> <span /> <span />
            </span>
            <span>Setting things up</span>
          </>
        ) : (
          <>
            <span>Continue to dashboard</span>
            <span aria-hidden className="transition group-hover:translate-x-1">→</span>
          </>
        )}
      </button>
    </form>
  );
}
