"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { DepartmentListItem } from "@/backend/services/department.service";
import { FieldShell } from "@/components/ui/Input";
import { micro } from "@/lib/ui/typography";

export function DepartmentSelect({
  departments,
  value,
  onChange,
  loading,
}: {
  departments: DepartmentListItem[];
  value: string;
  onChange: (id: string) => void;
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selected = departments.find((dept) => dept.id === value);
  const disabled = loading || departments.length === 0;

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const items = useMemo(
    () =>
      departments.map((dept) => ({
        id: dept.id,
        label: dept.name,
        meta: dept.hasHead ? "Head taken" : "Head open",
        disabled: false,
      })),
    [departments],
  );
  const hint = loading
    ? "Fetching departments…"
    : selected
      ? selected.hasHead
        ? "Head already assigned. You can still continue without claiming it."
        : "Heads can reserve designs for their department."
      : "Choose your department to personalize your templates.";

  return (
    <FieldShell label="Department" hint={hint}>
      <div ref={containerRef} className="relative">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="flex w-full items-center justify-between rounded-xl border border-[rgba(255,215,0,0.35)] px-4 text-left transition"
          style={{
            height: 52,
            background:
              "linear-gradient(180deg, rgba(255,215,0,0.08), rgba(255,140,66,0.06))",
            color: "#fff",
            boxShadow: open
              ? "0 0 0 3px rgba(255,215,0,0.18), 0 12px 28px rgba(0,0,0,0.28)"
              : "0 12px 28px rgba(0,0,0,0.28)",
            opacity: disabled ? 0.6 : 1,
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          <span className="truncate text-sm font-semibold">
            {loading
              ? "Loading departments…"
              : selected
                ? selected.name
                : "Select your department"}
          </span>
          <span
            aria-hidden
            className={`ml-3 inline-flex h-6 w-6 items-center justify-center rounded-full border border-[rgba(255,215,0,0.35)] ${open ? "rotate-180" : "rotate-0"} transition-transform`}
            style={{ color: "#FFD700" }}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </button>

        {open ? (
          <div
            role="listbox"
            aria-label="Departments"
            className="absolute z-30 mt-2 w-full overflow-hidden rounded-xl border border-[rgba(255,215,0,0.25)] bg-[rgba(10,10,10,0.98)] shadow-[0_20px_40px_rgba(0,0,0,0.45)]"
            style={{ backdropFilter: "blur(14px)" }}
          >
            <div className="max-h-72 overflow-y-auto">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={item.id === value}
                  onClick={() => {
                    onChange(item.id);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-sm transition hover:bg-[rgba(255,215,0,0.08)]"
                  style={{
                    color: item.id === value ? "#FFD700" : "#fff",
                    background:
                      item.id === value ? "rgba(255,215,0,0.12)" : "transparent",
                  }}
                >
                  <span className="truncate font-medium">{item.label}</span>
                  <span style={{ ...micro, color: "rgba(255,255,255,0.45)" }}>{item.meta}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </FieldShell>
  );
}
