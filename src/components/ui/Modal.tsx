"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { displayMd, caption } from "@/lib/ui/typography";

export type ModalSize = "sm" | "md" | "lg" | "fullscreen";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  size?: ModalSize;
  /** When true, hides the built-in close button. */
  hideClose?: boolean;
  /** Disable closing by ESC or backdrop click. */
  preventDismiss?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  /** Lift content edge-to-edge (no padding). Useful for full-bleed previews. */
  flush?: boolean;
  zIndex?: number;
  className?: string;
  panelStyle?: CSSProperties;
}

const SIZE_WIDTH: Record<ModalSize, string> = {
  sm: "min(420px, calc(100vw - 32px))",
  md: "min(560px, calc(100vw - 32px))",
  lg: "min(820px, calc(100vw - 32px))",
  fullscreen: "100vw",
};

export function Modal({
  open,
  onClose,
  title,
  description,
  size = "md",
  hideClose = false,
  preventDismiss = false,
  children,
  footer,
  flush = false,
  zIndex = 70,
  className = "",
  panelStyle,
}: ModalProps) {
  const [mounted, setMounted] = useState(false);
  const [phase, setPhase] = useState<"idle" | "in" | "out">("idle");
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (open) {
      setPhase("in");
      const original = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = original;
      };
    }
    if (phase === "in") setPhase("out");
  }, [open, phase]);

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape" && !preventDismiss) onClose();
    },
    [onClose, preventDismiss],
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, handleKey]);

  if (!mounted) return null;
  if (!open && phase !== "out") return null;

  const fullscreen = size === "fullscreen";

  const overlay = (
    <div
      ref={overlayRef}
      className={`fyb-modal-overlay ${open ? "fyb-modal-overlay-in" : "fyb-modal-overlay-out"}`}
      style={{ zIndex }}
      onMouseDown={(e) => {
        if (preventDismiss) return;
        if (e.target === overlayRef.current) onClose();
      }}
      onAnimationEnd={() => {
        if (!open) setPhase("idle");
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex h-full w-full items-center justify-center p-4"
        style={fullscreen ? { padding: 0 } : undefined}
      >
        <div
          ref={panelRef}
          className={`fyb-modal-shell ${open ? "fyb-modal-card-in" : "fyb-modal-card-out"} ${className}`}
          style={{
            width: SIZE_WIDTH[size],
            maxHeight: fullscreen ? "100vh" : "min(86vh, 880px)",
            height: fullscreen ? "100vh" : undefined,
            borderRadius: fullscreen ? 0 : 20,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            ...panelStyle,
          }}
        >
          {(title || !hideClose) && (
            <div
              className="flex items-start justify-between gap-4"
              style={{
                padding: "20px 24px 0",
                borderBottom: "none",
              }}
            >
              <div className="flex flex-col gap-1.5">
                {title && (
                  <h2 style={{ ...displayMd, fontSize: 22, lineHeight: 1.18 }}>{title}</h2>
                )}
                {description && (
                  <p style={{ ...caption, color: "var(--ink-muted)", maxWidth: 480 }}>
                    {description}
                  </p>
                )}
              </div>
              {!hideClose && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="grid h-8 w-8 place-items-center rounded-full transition"
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--hairline)",
                    color: "var(--ink-muted)",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M6 6 18 18" />
                    <path d="M18 6 6 18" />
                  </svg>
                </button>
              )}
            </div>
          )}

          <div
            className="flex-1 overflow-y-auto"
            style={{
              padding: flush ? 0 : "20px 24px 24px",
            }}
          >
            {children}
          </div>

          {footer && (
            <div
              className="flex items-center justify-end gap-2"
              style={{
                padding: "16px 24px",
                borderTop: "1px solid var(--hairline)",
                background: "var(--surface-1)",
              }}
            >
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
