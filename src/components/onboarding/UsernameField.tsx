"use client";

import { useEffect, useRef, useState } from "react";
import { caption, bodyMd, micro } from "@/lib/ui/typography";

type Status =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "available" }
  | { kind: "unavailable"; reason: string };

export function UsernameField({
  value,
  onChange,
  onValidityChange,
}: {
  value: string;
  onChange: (next: string) => void;
  onValidityChange: (valid: boolean) => void;
}) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [focused, setFocused] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    onValidityChange(status.kind === "available");
  }, [status, onValidityChange]);

  useEffect(() => {
    abortRef.current?.abort();

    if (!value) {
      setStatus({ kind: "idle" });
      return;
    }

    setStatus({ kind: "checking" });
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ username: value });
        const res = await fetch(`/api/onboarding/check-username?${params}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          setStatus({ kind: "unavailable", reason: "Could not verify username" });
          return;
        }
        const data = (await res.json()) as { available: boolean; reason?: string };
        setStatus(
          data.available
            ? { kind: "available" }
            : { kind: "unavailable", reason: data.reason ?? "Username is taken" }
        );
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        setStatus({ kind: "unavailable", reason: "Could not verify username" });
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  const hint = (() => {
    switch (status.kind) {
      case "checking":
        return { color: "var(--ink-faint)", text: "Checking…" };
      case "available":
        return { color: "#FFD700", text: "Username available" };
      case "unavailable":
        return { color: "var(--semantic-danger)", text: status.reason };
      default:
        return {
          color: "var(--ink-faint)",
          text: "3-24 chars · lowercase letters, numbers, underscore",
        };
    }
  })();

  const errorTone = status.kind === "unavailable";

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="onboard-username" style={{ ...caption, color: "var(--ink-muted)" }}>
        Username
      </label>
      <div
        className="flex items-center gap-2 rounded-[10px] px-3"
        style={{
          background: focused ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.025)",
          border: "1px solid",
          borderColor: errorTone
            ? "var(--semantic-danger)"
            : focused
              ? "rgba(255,215,0,0.6)"
              : "rgba(255,215,0,0.18)",
          boxShadow: focused && !errorTone ? "0 0 0 3px rgba(255,215,0,0.15)" : "none",
          transition: "border-color 140ms ease, box-shadow 140ms ease, background 140ms ease",
        }}
      >
        <span style={{ ...bodyMd, color: "var(--ink-faint)", fontWeight: 600 }}>@</span>
        <input
          id="onboard-username"
          type="text"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="amina_okafor"
          style={{
            ...bodyMd,
            height: 42,
            flex: 1,
            background: "transparent",
            color: "var(--ink)",
            outline: "none",
            border: "none",
          }}
        />
        <StatusDot status={status} />
      </div>
      <p style={{ ...micro, color: hint.color }}>{hint.text}</p>
    </div>
  );
}

function StatusDot({ status }: { status: Status }) {
  const color = (() => {
    switch (status.kind) {
      case "checking":
        return "var(--ink-faint)";
      case "available":
        return "#FFD700";
      case "unavailable":
        return "var(--semantic-danger)";
      default:
        return "var(--hairline)";
    }
  })();
  return (
    <span
      className="h-2 w-2 rounded-full"
      style={{
        background: color,
        animation: status.kind === "checking" ? "fyb-dot 900ms ease-in-out infinite" : undefined,
      }}
    />
  );
}
