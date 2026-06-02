"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Crown,
  Eye,
  LockKeyhole,
  WandSparkles,
  X,
  type LucideIcon,
} from "lucide-react";

export type HeadEntryModalProps = {
  open: boolean;
  templateId: string;
  templateName: string;
  onClose: () => void;
};

const mono = { fontFamily: "var(--font-geist-mono), monospace" };
const jkt = { fontFamily: "var(--font-plus-jakarta, var(--font-geist-sans)), sans-serif" };
const sans = { fontFamily: "var(--font-geist-sans), sans-serif" };

export function HeadEntryModal({
  open,
  templateId,
  templateName,
  onClose,
}: HeadEntryModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Department head design options"
      onMouseDown={(event) => {
        if (event.target === backdropRef.current) onClose();
      }}
      style={{
        background:
          "radial-gradient(ellipse 56% 45% at 50% 28%, rgba(255,215,0,0.13), rgba(0,0,0,0.72) 72%)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <div
        className="relative max-h-[calc(100dvh-8px)] w-full overflow-hidden sm:max-w-3xl"
        style={{
          background:
            "linear-gradient(180deg, rgba(34,27,4,0.98), rgba(8,8,8,0.99) 34%, rgba(4,4,4,0.99))",
          border: "1px solid rgba(255,215,0,0.22)",
          borderRadius: "24px 24px 0 0",
          boxShadow:
            "0 -16px 70px rgba(0,0,0,0.7), 0 0 80px rgba(255,180,0,0.1), inset 0 1px 0 rgba(255,255,255,0.08)",
        }}
      >
        <style>{`
          @media (min-width: 640px) {
            .fyb-head-entry-panel { border-radius: 22px !important; }
          }
        `}</style>
        <div className="fyb-head-entry-panel" style={{ display: "contents" }} />

        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent, #FFD700, #FF8C42, #FFD700, transparent)",
          }}
        />

        <div className="flex justify-center pb-1 pt-2.5 sm:hidden">
          <span className="h-1 w-11 rounded-full bg-[rgba(255,215,0,0.34)]" />
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full transition hover:scale-105 active:scale-95"
          style={{
            background: "rgba(0,0,0,0.35)",
            border: "1px solid rgba(255,215,0,0.22)",
            color: "#FFD700",
          }}
        >
          <X className="h-4 w-4" />
        </button>

        <div className="max-h-[calc(100dvh-8px)] overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+18px)] pt-4 sm:px-6 sm:pb-6 sm:pt-6">
          <header className="pr-10">
            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1"
              style={{
                ...mono,
                background: "rgba(255,215,0,0.08)",
                border: "1px solid rgba(255,215,0,0.22)",
                color: "rgba(255,215,0,0.88)",
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
              }}
            >
              <Crown className="h-3.5 w-3.5" />
              Department head
            </div>
            <h2
              className="mt-4 max-w-2xl"
              style={{
                ...jkt,
                color: "#fff",
                fontSize: "clamp(24px, 5.8vw, 40px)",
                fontWeight: 900,
                letterSpacing: "-0.035em",
                lineHeight: 0.98,
              }}
            >
              Choose how to open this design.
            </h2>
            <p
              className="mt-3 max-w-xl"
              style={{
                ...sans,
                color: "rgba(255,255,255,0.62)",
                fontSize: 14,
                lineHeight: 1.6,
              }}
            >
              {templateName}
            </p>
          </header>

          <div className="mt-5 grid gap-3 sm:mt-6 sm:grid-cols-2">
            <ActionCard
              href={`/templates/${templateId}/preview`}
              onClick={onClose}
              icon={LockKeyhole}
              title="Preview & reserve"
              body="Inspect the cover and reserve this design for your department."
              label="Reserve"
              primary
            />
            <ActionCard
              href={`/templates/${templateId}/use`}
              onClick={onClose}
              icon={WandSparkles}
              title="Use design"
              body="Personalize the design now and export your own version."
              label="Use"
            />
          </div>

          <div
            className="mt-4 flex items-center gap-2 rounded-2xl px-3 py-3 sm:mt-5"
            style={{
              background: "rgba(255,255,255,0.035)",
              border: "1px solid rgba(255,215,0,0.12)",
              color: "rgba(255,255,255,0.54)",
              ...sans,
              fontSize: 12.5,
              lineHeight: 1.45,
            }}
          >
            <Eye className="h-4 w-4 shrink-0 text-[#FFD700]" />
            Reserving makes the template exclusive to your department until it is freed.
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionCard({
  href,
  onClick,
  icon: Icon,
  title,
  body,
  label,
  primary = false,
}: {
  href: string;
  onClick: () => void;
  icon: LucideIcon;
  title: string;
  body: string;
  label: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="group relative overflow-hidden rounded-2xl p-4 transition duration-200 hover:-translate-y-1 sm:p-5"
      style={{
        background: primary
          ? "linear-gradient(180deg, rgba(255,215,0,0.14), rgba(255,255,255,0.04))"
          : "rgba(255,255,255,0.035)",
        border: primary
          ? "1px solid rgba(255,215,0,0.34)"
          : "1px solid rgba(255,255,255,0.1)",
        boxShadow: primary ? "0 16px 34px rgba(0,0,0,0.32)" : "none",
      }}
    >
      <div
        aria-hidden
        className="absolute inset-x-4 top-0 h-px opacity-70 transition-opacity group-hover:opacity-100"
        style={{
          background: primary
            ? "linear-gradient(90deg, transparent, #FFD700, transparent)"
            : "linear-gradient(90deg, transparent, rgba(255,255,255,0.28), transparent)",
        }}
      />
      <div
        className="grid h-11 w-11 place-items-center rounded-2xl"
        style={{
          background: primary ? "linear-gradient(180deg, #FFE878, #DFAF1F)" : "rgba(255,255,255,0.06)",
          color: primary ? "#080808" : "#FFD700",
          border: primary ? "1px solid rgba(255,255,255,0.22)" : "1px solid rgba(255,215,0,0.18)",
        }}
      >
        <Icon className="h-5 w-5" />
      </div>

      <div className="mt-4">
        <h3
          style={{
            ...jkt,
            color: "#fff",
            fontSize: 16,
            fontWeight: 800,
            letterSpacing: "-0.015em",
          }}
        >
          {title}
        </h3>
        <p
          className="mt-1.5"
          style={{
            ...sans,
            color: "rgba(255,255,255,0.58)",
            fontSize: 13,
            lineHeight: 1.55,
          }}
        >
          {body}
        </p>
      </div>

      <div
        className="mt-5 inline-flex items-center gap-2 rounded-full px-3 py-2 transition group-hover:translate-x-1"
        style={{
          ...mono,
          background: primary ? "#FFD700" : "rgba(255,215,0,0.08)",
          border: primary ? "1px solid #FFD700" : "1px solid rgba(255,215,0,0.22)",
          color: primary ? "#070707" : "#FFD700",
          fontSize: 10,
          fontWeight: 900,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
        }}
      >
        {label}
        <ArrowRight className="h-3.5 w-3.5" />
      </div>
    </Link>
  );
}
