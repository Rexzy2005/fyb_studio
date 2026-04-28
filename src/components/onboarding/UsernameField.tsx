"use client";

import { useEffect, useRef, useState } from "react";

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
        return { color: "text-zinc-500 dark:text-zinc-400", text: "Checking…" };
      case "available":
        return {
          color: "text-emerald-600 dark:text-emerald-400",
          text: "Username available",
        };
      case "unavailable":
        return { color: "text-rose-600 dark:text-rose-400", text: status.reason };
      default:
        return {
          color: "text-zinc-500 dark:text-zinc-400",
          text: "3–24 chars · lowercase letters, numbers, underscore",
        };
    }
  })();

  return (
    <div>
      <label className="text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
        Username
      </label>
      <div className="mt-1 flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white px-3 dark:border-zinc-800 dark:bg-zinc-900 focus-within:border-zinc-400 dark:focus-within:border-zinc-600">
        <span className="text-sm font-semibold text-zinc-400 dark:text-zinc-500">@</span>
        <input
          type="text"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) =>
            onChange(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
          }
          placeholder="amina_okafor"
          className="h-11 flex-1 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100"
        />
        <StatusDot status={status} />
      </div>
      <p className={`mt-1.5 text-[11px] ${hint.color}`}>{hint.text}</p>
    </div>
  );
}

function StatusDot({ status }: { status: Status }) {
  if (status.kind === "checking") {
    return (
      <span className="h-2 w-2 animate-pulse rounded-full bg-zinc-300 dark:bg-zinc-600" />
    );
  }
  if (status.kind === "available") {
    return <span className="h-2 w-2 rounded-full bg-emerald-500" />;
  }
  if (status.kind === "unavailable") {
    return <span className="h-2 w-2 rounded-full bg-rose-500" />;
  }
  return <span className="h-2 w-2 rounded-full bg-zinc-200 dark:bg-zinc-700" />;
}
