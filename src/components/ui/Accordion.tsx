"use client";

import { useState, type ReactNode } from "react";
import { headline, bodyMd } from "@/lib/ui/typography";

export interface AccordionItem {
  id: string;
  question: ReactNode;
  answer: ReactNode;
}

interface AccordionProps {
  items: AccordionItem[];
  defaultOpen?: string;
  className?: string;
}

export function Accordion({ items, defaultOpen, className = "" }: AccordionProps) {
  const [openId, setOpenId] = useState<string | null>(defaultOpen ?? null);
  return (
    <div className={`flex flex-col ${className}`}>
      {items.map((item, idx) => {
        const open = openId === item.id;
        return (
          <div
            key={item.id}
            style={{
              borderTop: idx === 0 ? "1px solid var(--hairline)" : undefined,
              borderBottom: "1px solid var(--hairline)",
            }}
          >
            <button
              type="button"
              onClick={() => setOpenId(open ? null : item.id)}
              className="flex w-full items-center justify-between gap-6 text-left"
              style={{ padding: "20px 0", color: "var(--ink)" }}
            >
              <span style={{ ...headline, fontSize: 18 }}>{item.question}</span>
              <span
                aria-hidden
                style={{
                  fontFamily: "var(--font-geist-mono)",
                  color: "var(--ink-muted)",
                  fontSize: 16,
                  transition: "transform 160ms ease",
                  transform: open ? "rotate(45deg)" : "rotate(0deg)",
                  display: "inline-block",
                }}
              >
                +
              </span>
            </button>
            {open && (
              <div style={{ ...bodyMd, color: "var(--ink-muted)", padding: "0 0 20px", maxWidth: 720 }}>
                {item.answer}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
