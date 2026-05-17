"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ToastTone = "info" | "success" | "warning" | "error";

interface ToastEntry {
  id: string;
  tone: ToastTone;
  title?: string;
  body?: string;
  duration: number;
}

interface ToastContextValue {
  show: (input: Omit<ToastEntry, "id" | "duration"> & { duration?: number }) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      show: () => "",
      dismiss: () => {},
    } as ToastContextValue;
  }
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastEntry[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback<ToastContextValue["show"]>(
    ({ tone, title, body, duration = 4000 }) => {
      const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setItems((prev) => [...prev, { id, tone, title, body, duration }]);
      const handle = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, handle);
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach(clearTimeout);
      map.clear();
    };
  }, []);

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fyb-toast-stack" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="fyb-toast" data-tone={t.tone} role="status">
            {t.title && <div style={{ fontWeight: 600, marginBottom: t.body ? 2 : 0 }}>{t.title}</div>}
            {t.body && <div style={{ color: "var(--ink-muted)", fontSize: 13 }}>{t.body}</div>}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
