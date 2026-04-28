"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type ThemeMode = "system" | "light" | "dark";

const STORAGE_KEY = "fyb:theme";

function getSystemPrefersDark() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function applyTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const prefersDark = getSystemPrefersDark();
  const isDark = mode === "dark" || (mode === "system" && prefersDark);
  document.documentElement.classList.toggle("dark", isDark);
}

function withThemeTransition(fn: () => void) {
  if (typeof document === "undefined") {
    fn();
    return;
  }

  const root = document.documentElement;
  root.classList.add("theme-transition");
  // Run on next frame so the class is applied before switching colors.
  requestAnimationFrame(() => {
    fn();
    window.setTimeout(() => {
      root.classList.remove("theme-transition");
    }, 220);
  });
}

function readStoredMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v === "light" || v === "dark" || v === "system") return v;
  return "system";
}

function ModeIcon({ mode }: { mode: ThemeMode }) {
  if (mode === "dark") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
        <path
          fill="currentColor"
          d="M21 14.5A8.5 8.5 0 0 1 9.5 3a7 7 0 1 0 11.5 11.5Z"
        />
      </svg>
    );
  }

  if (mode === "light") {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Zm0-16h1v3h-1V2Zm0 17h1v3h-1v-3ZM4.22 5.64l.7-.7 2.12 2.12-.7.7L4.22 5.64Zm12.95 12.95.7-.7 2.12 2.12-.7.7-2.12-2.12ZM2 11h3v1H2v-1Zm17 0h3v1h-3v-1ZM4.22 18.36l2.12-2.12.7.7-2.12 2.12-.7-.7ZM17.17 7.11l2.12-2.12.7.7-2.12 2.12-.7-.7Z"
        />
      </svg>
    );
  }

  // system
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-5v2h2v2H7v-2h2v-2H6a2 2 0 0 1-2-2V5Zm2 0v9h12V5H6Z"
      />
    </svg>
  );
}

function modeLabel(mode: ThemeMode) {
  return mode === "system" ? "System" : mode === "light" ? "Light" : "Dark";
}

export function ThemeToggle({
  className,
  compact,
}: {
  className?: string;
  compact?: boolean;
}) {
  const [mode, setMode] = useState<ThemeMode>(() => readStoredMode());
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Keep one MediaQueryList for system mode updates.
  const media = useMemo(() => {
    if (typeof window === "undefined") return null;
    return window.matchMedia?.("(prefers-color-scheme: dark)") ?? null;
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, mode);
    }
    applyTheme(mode);
  }, [mode]);

  useEffect(() => {
    if (!media) return;
    if (mode !== "system") return;

    const onChange = () => applyTheme("system");
    media.addEventListener?.("change", onChange);
    return () => media.removeEventListener?.("change", onChange);
  }, [media, mode]);

  useEffect(() => {
    if (!open) return;

    const onDown = (e: PointerEvent) => {
      const el = rootRef.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      setOpen(false);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
    };

    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function setTheme(next: ThemeMode) {
    // Apply instantly so user sees the change immediately.
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
    withThemeTransition(() => applyTheme(next));
    setMode(next);
    setOpen(false);
  }

  const label = modeLabel(mode);
  const showText = !compact;

  return (
    <div ref={rootRef} className={("relative " + (className ?? "")).trim()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          (
            "inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-900 hover:bg-zinc-50 " +
            "dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800 " +
            (compact ? "h-9 w-9 px-0" : "h-9")
          ).trim()
        }
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Theme: ${label}. Open theme menu.`}
        title={`Theme: ${label}`}
      >
        <ModeIcon mode={mode} />
        {showText ? <span>Theme</span> : null}
      </button>

      <div
        role="menu"
        aria-label="Theme"
        className={
          "absolute bottom-12 right-0 w-44 origin-bottom-right rounded-2xl border border-zinc-200 bg-white p-1 shadow-lg " +
          "transition-all duration-150 ease-out dark:border-zinc-800 dark:bg-zinc-900 " +
          (open ? "pointer-events-auto scale-100 opacity-100" : "pointer-events-none scale-95 opacity-0")
        }
      >
        <ThemeMenuItem label="System" active={mode === "system"} onClick={() => setTheme("system")}>
          <ModeIcon mode="system" />
        </ThemeMenuItem>
        <ThemeMenuItem label="Light" active={mode === "light"} onClick={() => setTheme("light")}>
          <ModeIcon mode="light" />
        </ThemeMenuItem>
        <ThemeMenuItem label="Dark" active={mode === "dark"} onClick={() => setTheme("dark")}>
          <ModeIcon mode="dark" />
        </ThemeMenuItem>

        <div className="mt-1 border-t border-zinc-200 px-2 py-1 text-[11px] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          Tip: System follows your OS.
        </div>
      </div>
    </div>
  );
}

function ThemeMenuItem({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={
        "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs font-medium " +
        (active
          ? "bg-zinc-50 text-zinc-950 dark:bg-zinc-800/60 dark:text-zinc-50"
          : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800/60")
      }
    >
      <span className="inline-flex items-center gap-2">
        <span className="text-zinc-700 dark:text-zinc-200">{children}</span>
        {label}
      </span>
      {active ? (
        <span aria-hidden="true" className="text-emerald-600 dark:text-emerald-400">
          ✓
        </span>
      ) : null}
    </button>
  );
}

