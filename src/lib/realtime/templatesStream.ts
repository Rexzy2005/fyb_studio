"use client";

import { useEffect } from "react";

export type TemplateChangePayload = {
  type: "published" | "updated" | "unpublished";
  templateId: string;
  at: string;
};

export function useTemplateChangeStream(onChange: (payload: TemplateChangePayload) => void) {
  useEffect(() => {
    let source: EventSource | null = null;
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (cancelled) return;
      try {
        source = new EventSource("/api/templates/stream");
      } catch {
        return;
      }

      source.addEventListener("changed", (ev: MessageEvent<string>) => {
        try {
          const payload = JSON.parse(ev.data) as TemplateChangePayload;
          onChange(payload);
        } catch {
          // Ignore malformed events.
        }
      });

      source.onerror = () => {
        if (!source) return;
        source.close();
        source = null;
        if (cancelled) return;
        reconnectTimer = setTimeout(connect, 3_000);
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (source) source.close();
    };
  }, [onChange]);
}
