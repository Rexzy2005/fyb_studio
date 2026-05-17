"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BookmarkX, ShieldCheck } from "lucide-react";

import {
  deleteTemplateLock,
  fetchDepartmentLocks,
  type DepartmentLockListItemClient,
} from "@/lib/api/templateLocks";
import { Skeleton } from "@/components/ui/Skeleton";
import { SectionHeader } from "@/components/dashboard/SectionHeader";
import { bodyMd, bodySm, caption, micro } from "@/lib/ui/typography";

export function DepartmentLocks({ departmentName }: { departmentName: string }) {
  const [locks, setLocks] = useState<DepartmentLockListItemClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const next = await fetchDepartmentLocks();
      setLocks(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reservations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <section className="flex flex-col gap-7">
      <SectionHeader
        eyebrow="Reserved"
        title="Reserved designs"
        description={`Designs you have reserved exclusively for ${departmentName}. Members get automatic access - no passcode needed.`}
        count={loading ? null : locks.length}
      />

      {error ? (
        <div
          className="px-4 py-3"
          style={{
            background: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.28)",
            color: "var(--semantic-danger)",
            borderRadius: 10,
            ...bodySm,
          }}
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton height={140} radius={15} />
          <Skeleton height={140} radius={15} />
        </div>
      ) : locks.length === 0 ? (
        <div
          className="px-7 py-9"
          style={{
            background: "var(--surface-1)",
            border: "1px solid var(--hairline)",
            borderRadius: 20,
          }}
        >
          <span style={{ ...bodyMd, color: "var(--ink)", fontWeight: 500 }}>
            No reserved designs yet
          </span>
          <p
            className="mt-1.5 max-w-[480px]"
            style={{ ...bodySm, color: "var(--ink-muted)", fontWeight: 400 }}
          >
            Open a template, choose &ldquo;Preview &amp; reserve&rdquo;, and reserve it for{" "}
            {departmentName}. Members get automatic access - no passcode sharing required.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {locks.map((l) => (
            <ReserveCard key={l.id} lock={l} onChanged={refresh} />
          ))}
        </div>
      )}
    </section>
  );
}

function ReserveCard({
  lock,
  onChanged,
}: {
  lock: DepartmentLockListItemClient;
  onChanged: () => Promise<void> | void;
}) {
  const [working, setWorking] = useState<"free" | null>(null);
  const [confirmFree, setConfirmFree] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFree() {
    if (working) return;
    setError(null);
    setWorking("free");
    try {
      await deleteTemplateLock(lock.templateId);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not free the design");
      setWorking(null);
    }
  }

  return (
    <div
      className="overflow-hidden"
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--hairline)",
        borderRadius: 16,
      }}
    >
      {/* Reserve status bar */}
      <div
        className="flex items-center gap-2 px-4 py-2"
        style={{
          background: "rgba(34,197,94,0.06)",
          borderBottom: "1px solid rgba(34,197,94,0.15)",
        }}
      >
        <ShieldCheck size={13} className="shrink-0 text-[#22c55e]" />
        <span style={{ ...micro, color: "#22c55e", fontWeight: 600, letterSpacing: "0.04em" }}>
          RESERVED · {lock.departmentName} only
        </span>
      </div>

      <div className="flex items-start gap-3 p-4">
        <div
          className="grid h-14 w-14 flex-none place-items-center overflow-hidden rounded-[10px]"
          style={{ background: "var(--surface-2)", border: "1px solid var(--hairline)" }}
        >
          {lock.templateCoverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={lock.templateCoverUrl} alt="" className="h-full w-full object-contain p-1" />
          ) : (
            <span style={{ ...micro, color: "var(--ink-faint)" }}>No cover</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate" style={{ ...bodySm, color: "var(--ink)", fontWeight: 600 }}>
            {lock.templateName}
          </div>
          <div className="mt-0.5" style={{ ...micro, color: "var(--ink-muted)" }}>
            Reserved{" "}
            {new Date(lock.createdAt).toLocaleDateString("en-NG", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </div>
          <div className="mt-1" style={{ ...micro, color: "var(--ink-faint)" }}>
            Members access automatically - no code needed
          </div>
        </div>
      </div>

      {error ? (
        <div
          className="mx-4 mb-2 rounded-[8px] px-2 py-1.5"
          style={{
            background: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.28)",
            color: "var(--semantic-danger)",
            fontSize: 11,
          }}
        >
          {error}
        </div>
      ) : null}

      <div className="flex gap-2 px-4 pb-4">
        <Link
          href={`/templates/${lock.templateId}/preview`}
          className="inline-flex h-9 flex-1 items-center justify-center rounded-full transition"
          style={{
            ...caption,
            fontSize: 12,
            background: "var(--surface-2)",
            color: "var(--ink)",
            border: "1px solid var(--hairline)",
          }}
        >
          Open
        </Link>
        <button
          type="button"
          onClick={() => setConfirmFree(true)}
          disabled={working !== null}
          className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full transition disabled:opacity-60"
          style={{
            ...caption,
            fontSize: 12,
            background: "transparent",
            color: "var(--semantic-danger)",
            border: "1px solid rgba(239, 68, 68, 0.35)",
          }}
        >
          <BookmarkX size={13} />
          Free
        </button>
      </div>

      {confirmFree ? (
        <div
          className="mx-4 mb-4 rounded-[10px] p-3"
          style={{
            background: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.28)",
          }}
        >
          <p style={{ ...caption, color: "var(--semantic-danger)" }}>
            Free this design for all departments? Reservation will be removed.
          </p>
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmFree(false)}
              className="inline-flex h-8 items-center justify-center rounded-full"
              style={{
                ...caption,
                fontSize: 11,
                padding: "0 12px",
                background: "var(--surface-1)",
                color: "var(--ink)",
                border: "1px solid var(--hairline)",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onFree}
              disabled={working === "free"}
              className="inline-flex h-8 items-center justify-center rounded-full"
              style={{
                ...caption,
                fontSize: 11,
                padding: "0 12px",
                background: "var(--semantic-danger)",
                color: "#fff",
              }}
            >
              {working === "free" ? "Freeing…" : "Free it"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
