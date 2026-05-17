"use client";

import { useState } from "react";
import { BookmarkCheck, BookmarkX, ShieldCheck } from "lucide-react";

import {
  deleteTemplateLock,
  lockTemplate,
  type TemplateLockClient,
} from "@/lib/api/templateLocks";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { headline, bodyMd, caption } from "@/lib/ui/typography";

type Props = {
  templateId: string;
  templateName: string;
  initialLock: TemplateLockClient | null;
  lockedByOtherDept: boolean;
};

export function PreviewLockPanel({
  templateId,
  templateName,
  initialLock,
  lockedByOtherDept,
}: Props) {
  const [lock, setLock] = useState<TemplateLockClient | null>(initialLock);
  const [working, setWorking] = useState<"reserve" | "free" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmFree, setConfirmFree] = useState(false);

  async function onReserve() {
    if (working) return;
    setError(null);
    setWorking("reserve");
    try {
      const next = await lockTemplate(templateId);
      setLock(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reserve the design");
    } finally {
      setWorking(null);
    }
  }

  async function onFree() {
    if (working) return;
    setError(null);
    setWorking("free");
    try {
      await deleteTemplateLock(templateId);
      setLock(null);
      setConfirmFree(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not free the design");
    } finally {
      setWorking(null);
    }
  }

  if (lockedByOtherDept && lock) {
    return (
      <Card variant="surface-1" padding={24} radius={20}>
        <Badge tone="danger">Reserved by another department</Badge>
        <h2 className="mt-3" style={{ ...headline, fontSize: 18 }}>
          {lock.departmentName} has reserved this design.
        </h2>
        <p className="mt-2" style={{ ...bodyMd, color: "var(--ink-muted)" }}>
          Another department head has reserved this design for their members. You can preview the cover but
          cannot use or reserve it for your department.
        </p>
      </Card>
    );
  }

  if (!lock) {
    return (
      <Card variant="surface-1" padding={24} radius={20}>
        <Badge tone="success">Available to reserve</Badge>
        <h2 className="mt-3" style={{ ...headline, fontSize: 18 }}>
          Reserve {templateName} for your department
        </h2>
        <p className="mt-2" style={{ ...bodyMd, color: "var(--ink-muted)" }}>
          Reserving this design makes it exclusive to your department. Members from your department
          will be granted automatic access — no passcode needed. Other departments won&apos;t be able
          to use it.
        </p>

        <div
          className="mt-4 flex items-start gap-2.5 rounded-[12px] px-3 py-3"
          style={{
            background: "rgba(34,197,94,0.06)",
            border: "1px solid rgba(34,197,94,0.2)",
          }}
        >
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-[#22c55e]" />
          <p style={{ ...caption, color: "var(--ink-muted)" }}>
            Your department members get seamless, passcode-free access.
            Students from other departments will see a &ldquo;reserved&rdquo; message.
          </p>
        </div>

        {error ? <ErrorBanner>{error}</ErrorBanner> : null}

        <div className="mt-5">
          <Button
            variant="primary"
            size="lg"
            onClick={onReserve}
            loading={working === "reserve"}
          >
            <BookmarkCheck className="mr-2 h-4 w-4" />
            {working === "reserve" ? "Reserving…" : "Reserve for my department"}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card variant="surface-1" padding={24} radius={20}>
      <Badge tone="accent">Reserved for {lock.departmentName}</Badge>
      <h2 className="mt-3" style={{ ...headline, fontSize: 18 }}>
        {templateName} is reserved
      </h2>
      <p className="mt-1" style={{ ...caption, color: "var(--ink-muted)" }}>
        Your department members can access this design automatically — no passcode or code sharing required.
        Students from other departments will be redirected.
      </p>

      <div
        className="mt-4 flex items-start gap-2.5 rounded-[12px] px-3 py-3"
        style={{
          background: "rgba(34,197,94,0.06)",
          border: "1px solid rgba(34,197,94,0.2)",
        }}
      >
        <ShieldCheck size={15} className="mt-0.5 shrink-0 text-[#22c55e]" />
        <p style={{ ...caption, color: "var(--ink-muted)" }}>
          Reserved since {new Date(lock.createdAt).toLocaleDateString("en-NG", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}. Access is automatic for all {lock.departmentName} members.
        </p>
      </div>

      {error ? <ErrorBanner>{error}</ErrorBanner> : null}

      <div className="mt-5">
        <Button
          variant="danger"
          size="md"
          onClick={() => setConfirmFree(true)}
          disabled={working !== null}
        >
          <BookmarkX className="mr-2 h-4 w-4" />
          Free this design
        </Button>
      </div>

      {confirmFree ? (
        <div
          className="mt-4 rounded-[12px] p-4"
          style={{
            background: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.28)",
          }}
        >
          <p style={{ ...bodyMd, color: "var(--semantic-danger)" }}>
            Free this design? It will become available to all departments again and your
            reservation will be removed.
          </p>
          <div className="mt-3 flex items-center justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setConfirmFree(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={onFree}
              loading={working === "free"}
              style={{ background: "var(--semantic-danger)", color: "#fff", border: "1px solid var(--semantic-danger)" }}
            >
              {working === "free" ? "Freeing…" : "Yes, free it"}
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mt-3 rounded-[10px] px-3 py-2"
      style={{
        background: "rgba(239, 68, 68, 0.08)",
        border: "1px solid rgba(239, 68, 68, 0.28)",
        color: "var(--semantic-danger)",
        fontSize: 13,
      }}
    >
      {children}
    </div>
  );
}
