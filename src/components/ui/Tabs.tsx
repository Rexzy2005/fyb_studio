"use client";

import { useState, type ReactNode } from "react";
import { caption } from "@/lib/ui/typography";

export interface TabItem {
  id: string;
  label: ReactNode;
  badge?: ReactNode;
  panel: ReactNode;
}

interface TabsProps {
  items: TabItem[];
  initial?: string;
  onChange?: (id: string) => void;
  align?: "start" | "center";
  className?: string;
}

export function Tabs({ items, initial, onChange, align = "start", className = "" }: TabsProps) {
  const [active, setActive] = useState(initial ?? items[0]?.id);
  const current = items.find((i) => i.id === active) ?? items[0];

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      <div
        className="flex items-center gap-1 overflow-x-auto"
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--hairline)",
          borderRadius: 999,
          padding: 4,
          width: "fit-content",
          alignSelf: align === "center" ? "center" : "flex-start",
        }}
      >
        {items.map((item) => {
          const isActive = item.id === active;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setActive(item.id);
                onChange?.(item.id);
              }}
              className="transition"
              style={{
                ...caption,
                padding: "7px 14px",
                borderRadius: 999,
                background: isActive ? "var(--ink)" : "transparent",
                color: isActive ? "#000" : "var(--ink-muted)",
                whiteSpace: "nowrap",
              }}
            >
              {item.label}
              {item.badge ? (
                <span style={{ marginLeft: 6, opacity: 0.7 }}>{item.badge}</span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div>{current?.panel}</div>
    </div>
  );
}
