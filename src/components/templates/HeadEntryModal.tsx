"use client";

import Link from "next/link";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { bodySm, caption } from "@/lib/ui/typography";

export type HeadEntryModalProps = {
  open: boolean;
  templateId: string;
  templateName: string;
  onClose: () => void;
};

export function HeadEntryModal({
  open,
  templateId,
  templateName,
  onClose,
}: HeadEntryModalProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title="What would you like to do with this design?"
      description={templateName}
      footer={
        <Button variant="secondary" size="sm" onClick={onClose}>
          Cancel
        </Button>
      }
    >
      <div className="mt-2 mb-1">
        <Badge tone="accent">Department head</Badge>
      </div>

      <div className="mt-4 grid gap-3">
        <ActionRow
          href={`/templates/${templateId}/preview`}
          onClick={onClose}
          icon={<PreviewIcon />}
          title="Preview & reserve"
          body="See the cover and reserve this design for your department only."
        />
        <ActionRow
          href={`/templates/${templateId}/use`}
          onClick={onClose}
          icon={<UseIcon />}
          title="Use design"
          body="Personalize this template and export your version."
          accent
        />
      </div>
    </Modal>
  );
}

function ActionRow({
  href,
  onClick,
  icon,
  title,
  body,
  accent,
}: {
  href: string;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  body: string;
  accent?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="group flex items-start gap-3 transition"
      style={{
        background: "rgba(255,215,0,0.04)",
        border: "1px solid rgba(255,215,0,0.18)",
        borderRadius: 12,
        padding: 14,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "rgba(255,215,0,0.5)";
        e.currentTarget.style.background = "rgba(255,215,0,0.08)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "rgba(255,215,0,0.18)";
        e.currentTarget.style.background = "rgba(255,215,0,0.04)";
      }}
    >
      <div
        className="mt-0.5 grid h-9 w-9 flex-none place-items-center rounded-[10px]"
        style={{
          background: accent ? "rgba(255,215,0,0.15)" : "var(--surface-3)",
          color: accent ? "#FFD700" : "var(--ink)",
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ ...bodySm, color: "var(--ink)", fontWeight: 600 }}>{title}</div>
        <div className="mt-0.5" style={{ ...caption, color: "var(--ink-muted)" }}>
          {body}
        </div>
      </div>
    </Link>
  );
}

function PreviewIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function UseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
    </svg>
  );
}
