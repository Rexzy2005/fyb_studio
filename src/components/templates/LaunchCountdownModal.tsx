"use client";

import { CalendarClock } from "lucide-react";

import { Button, ButtonLink } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { bodyMd, bodySm, caption } from "@/lib/ui/typography";

export type CountdownParts = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
};

export type LaunchCountdownModalProps = {
  open: boolean;
  countdown: CountdownParts | null;
  isHead: boolean;
  reserveStatus: "idle" | "loading" | "reserved";
  reserveError: string | null;
  onReserve: () => void;
  onBack: () => void;
};

export function LaunchCountdownModal({
  open,
  countdown,
  isHead,
  reserveStatus,
  reserveError,
  onReserve,
  onBack,
}: LaunchCountdownModalProps) {
  if (!open) return null;

  const parts = [
    { label: "Days", value: countdown?.days },
    { label: "Hours", value: countdown?.hours },
    { label: "Minutes", value: countdown?.minutes },
    { label: "Seconds", value: countdown?.seconds },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Launch countdown"
      style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(12px)" }}
    >
      <div
        className="relative w-full max-w-115 overflow-hidden"
        style={{
          background:
            "radial-gradient(120% 120% at 50% 0%, rgba(255,215,0,0.12), transparent 60%), var(--canvas)",
          border: "1px solid rgba(255,215,0,0.22)",
          borderRadius: 24,
          boxShadow: "0 32px 90px rgba(0,0,0,0.6)",
        }}
      >
        <div
          className="absolute inset-x-0 top-0 h-0.5"
          style={{ background: "linear-gradient(90deg,#F59E0B,#FDE047)", opacity: 0.8 }}
        />

        <div className="px-6 pt-7 pb-6">
          <div className="flex items-center justify-between">
            <Badge tone="accent">Launch countdown</Badge>
            <div
              className="grid h-9 w-9 place-items-center rounded-full"
              style={{
                background: "rgba(255,215,0,0.12)",
                border: "1px solid rgba(255,215,0,0.35)",
                color: "#FFD700",
              }}
            >
              <CalendarClock size={16} strokeWidth={2} />
            </div>
          </div>

          <h2 className="mt-3 text-lg font-semibold" style={{ color: "var(--ink)" }}>
            This template unlocks Wednesday
          </h2>

          <p className="mt-2" style={{ ...bodyMd, color: "var(--ink-muted)" }}>
            You can reserve the design now, but editing and export open at launch.
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {parts.map((part) => (
              <div
                key={part.label}
                className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-center"
                style={{
                  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.03)",
                }}
              >
                <div style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {part.value === undefined ? "--" : String(part.value).padStart(2, "0")}
                </div>
                <div
                  style={{
                    ...caption,
                    textTransform: "uppercase",
                    letterSpacing: "0.2em",
                    color: "rgba(255,255,255,0.55)",
                    marginTop: 4,
                  }}
                >
                  {part.label}
                </div>
              </div>
            ))}
          </div>

          {isHead && (
            <div className="mt-5">
              {reserveStatus === "reserved" ? (
                <div
                  className="rounded-[12px] px-3 py-3"
                  style={{
                    background: "rgba(34,197,94,0.08)",
                    border: "1px solid rgba(34,197,94,0.24)",
                  }}
                >
                  <div style={{ ...bodySm, color: "var(--ink)" }}>
                    Reserved for your department.
                  </div>
                </div>
              ) : (
                <Button
                  variant="primary"
                  size="lg"
                  fullWidth
                  onClick={onReserve}
                  loading={reserveStatus === "loading"}
                >
                    {reserveStatus === "loading" ? "Reserving..." : "Reserve for my department"}
                </Button>
              )}
              {reserveError ? (
                <div
                  className="mt-3 rounded-[10px] px-3 py-2"
                  style={{
                    background: "rgba(239, 68, 68, 0.08)",
                    border: "1px solid rgba(239, 68, 68, 0.28)",
                    color: "var(--semantic-danger)",
                    fontSize: 13,
                  }}
                >
                  {reserveError}
                </div>
              ) : null}
            </div>
          )}

          <div className="mt-6 flex flex-col gap-2">
            <ButtonLink href="/templates" variant="secondary" size="lg" fullWidth onClick={onBack}>
              Back to templates
            </ButtonLink>
          </div>
        </div>
      </div>
    </div>
  );
}
