"use client";

import Link from "next/link";
import { ShieldX } from "lucide-react";

import { Button, ButtonLink } from "@/components/ui/Button";
import { bodyMd, bodySm } from "@/lib/ui/typography";

export type LockedAccessModalProps = {
  open: boolean;
  templateId: string;
  departmentName: string;
  onClose: () => void;
};

/**
 * Shown when a user from a different department tries to access a reserved template.
 * No passcode required — access is granted automatically based on department membership.
 */
export function LockedAccessModal({
  open,
  departmentName,
  onClose,
}: LockedAccessModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Access restricted"
      style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="relative w-full max-w-[420px] overflow-hidden"
        style={{
          background: "var(--canvas)",
          border: "1px solid var(--hairline)",
          borderRadius: 24,
          boxShadow: "0 32px 80px rgba(0,0,0,0.55)",
        }}
      >
        {/* Top accent */}
        <div
          className="absolute inset-x-0 top-0 h-[2px]"
          style={{ background: "linear-gradient(90deg,#EF4444,#DC2626)", opacity: 0.8 }}
        />

        <div className="px-6 pt-8 pb-6">
          {/* Icon */}
          <div
            className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl"
            style={{ background: "rgba(239,68,68,0.1)", color: "#EF4444" }}
          >
            <ShieldX size={26} strokeWidth={1.8} />
          </div>

          {/* Heading */}
          <h2
            className="text-center text-lg font-semibold"
            style={{ color: "var(--ink)", letterSpacing: "-0.02em" }}
          >
            Design reserved for {departmentName}
          </h2>

          <p
            className="mt-3 text-center"
            style={{ ...bodyMd, color: "var(--ink-muted)" }}
          >
            This design has been reserved for{" "}
            <span style={{ color: "var(--ink)", fontWeight: 600 }}>{departmentName}</span>{" "}
            by the department head. Only members of that department can access it.
          </p>

          <p
            className="mt-2 text-center text-xs"
            style={{ color: "var(--ink-faint)", ...bodySm }}
          >
            Browse other templates or contact your department head.
          </p>

          {/* Actions */}
          <div className="mt-6 flex flex-col gap-2">
            <ButtonLink
              href="/templates"
              variant="primary"
              size="lg"
              onClick={onClose}
            >
              Browse other templates
            </ButtonLink>
            <Button
              variant="secondary"
              size="md"
              onClick={onClose}
            >
              Go back
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
