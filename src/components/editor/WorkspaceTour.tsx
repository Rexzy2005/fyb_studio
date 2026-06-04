"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronLeft, Download, FilePenLine, X } from "lucide-react";

type TargetRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

type TourStep = {
  selector: string;
  title: string;
  body: string;
};

const MOBILE_STEPS: TourStep[] = [
  {
    selector: '[data-workspace-tour="mobile-details"]',
    title: "Add your details",
    body: "Tap Details and fill in each section before downloading.",
  },
  {
    selector: '[data-workspace-tour="mobile-download"]',
    title: "Pay and download",
    body: "When your details are ready, tap Download PNG to pay and export.",
  },
];

const DESKTOP_STEPS: TourStep[] = [
  {
    selector: '[data-workspace-tour="desktop-details"]',
    title: "Add your details",
    body: "Fill in each section in the panel before downloading.",
  },
  {
    selector: '[data-workspace-tour="desktop-download"]',
    title: "Pay and download",
    body: "When your details are ready, click Download PNG to pay and export.",
  },
];

export function WorkspaceTour() {
  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches,
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<TargetRect | null>(null);
  const nextButtonRef = useRef<HTMLButtonElement>(null);

  const steps = useMemo(() => (isMobile ? MOBILE_STEPS : DESKTOP_STEPS), [isMobile]);
  const step = steps[stepIndex] ?? steps[0];
  const isLastStep = stepIndex === steps.length - 1;

  useEffect(() => {
    const timer = window.setTimeout(() => setOpen(true), 1800);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const syncViewport = () => {
      setIsMobile(media.matches);
      setStepIndex(0);
    };

    media.addEventListener("change", syncViewport);
    return () => media.removeEventListener("change", syncViewport);
  }, []);

  const updateTargetRect = useCallback(() => {
    const target = document.querySelector<HTMLElement>(step.selector);
    if (!target) {
      setTargetRect(null);
      return;
    }

    const rect = target.getBoundingClientRect();
    const padding = 6;
    const left = Math.max(8, rect.left - padding);
    const top = Math.max(8, rect.top - padding);
    const right = Math.min(window.innerWidth - 8, rect.right + padding);
    const bottom = Math.min(window.innerHeight - 8, rect.bottom + padding);

    setTargetRect({
      top,
      left,
      width: Math.max(0, right - left),
      height: Math.max(0, bottom - top),
    });
  }, [step.selector]);

  useEffect(() => {
    if (!open) return;

    const frame = window.requestAnimationFrame(updateTargetRect);
    const refresh = () => window.requestAnimationFrame(updateTargetRect);
    window.addEventListener("resize", refresh);
    window.addEventListener("scroll", refresh, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", refresh);
      window.removeEventListener("scroll", refresh, true);
    };
  }, [open, updateTargetRect]);

  useEffect(() => {
    if (!open) return;
    nextButtonRef.current?.focus();

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key === "ArrowRight") {
        if (isLastStep) setOpen(false);
        else setStepIndex((current) => current + 1);
      }
      if (event.key === "ArrowLeft") {
        setStepIndex((current) => Math.max(0, current - 1));
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isLastStep, open]);

  if (!open) return null;

  const targetIsNearTop =
    !targetRect || targetRect.top + targetRect.height / 2 < window.innerHeight / 2;
  const cardPosition = isMobile
    ? targetIsNearTop
      ? { bottom: "92px", left: "16px", right: "16px" }
      : { top: "80px", left: "16px", right: "16px" }
    : targetIsNearTop
      ? { bottom: "32px", left: "50%", transform: "translateX(-50%)" }
      : { top: "32px", left: "50%", transform: "translateX(-50%)" };

  return createPortal(
    <div className="fixed inset-0" style={{ zIndex: 90 }} role="dialog" aria-modal="true" aria-label="Workspace guide">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        style={{ background: targetRect ? "transparent" : "rgba(0,0,0,0.76)" }}
        onClick={() => setOpen(false)}
        aria-label="Close workspace guide"
      />

      {targetRect ? (
        <div
          aria-hidden
          className="pointer-events-none absolute transition-all duration-200"
          style={{
            top: targetRect.top,
            left: targetRect.left,
            width: targetRect.width,
            height: targetRect.height,
            border: "2px solid #FFD700",
            borderRadius: 8,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.76), 0 0 0 5px rgba(255,215,0,0.16), 0 0 28px rgba(255,215,0,0.42)",
          }}
        />
      ) : null}

      <section
        className="fixed w-auto overflow-hidden"
        style={{
          ...cardPosition,
          width: isMobile ? undefined : "min(380px, calc(100vw - 32px))",
          maxWidth: "380px",
          borderRadius: 8,
          border: "1px solid rgba(255,215,0,0.28)",
          background: "linear-gradient(180deg, rgba(20,17,7,0.98), rgba(8,8,8,0.99))",
          boxShadow: "0 24px 70px rgba(0,0,0,0.65), 0 0 40px rgba(255,180,0,0.1)",
        }}
      >
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-0.5"
          style={{ background: "linear-gradient(90deg, #FFD700, #FF8C42)" }}
        />

        <div className="flex items-start gap-3 p-4">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center"
            style={{
              borderRadius: 8,
              background: "rgba(255,215,0,0.1)",
              border: "1px solid rgba(255,215,0,0.22)",
              color: "#FFD700",
            }}
          >
            {stepIndex === 0 ? <FilePenLine className="h-4 w-4" /> : <Download className="h-4 w-4" />}
          </span>

          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase text-[#FFD700]">
              Step {stepIndex + 1} of {steps.length}
            </div>
            <h2 className="mt-1 text-base font-semibold text-white">{step.title}</h2>
            <p className="mt-1 text-sm leading-5 text-white/65">{step.body}</p>
          </div>

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="grid h-8 w-8 shrink-0 place-items-center text-white/60 transition hover:bg-white/10 hover:text-white"
            style={{ borderRadius: 8 }}
            aria-label="Close workspace guide"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          className="flex items-center justify-between gap-3 px-4 py-3"
          style={{ borderTop: "1px solid rgba(255,215,0,0.12)", background: "rgba(255,215,0,0.025)" }}
        >
          <div className="h-9 w-9">
            {stepIndex > 0 ? (
              <button
                type="button"
                onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
                className="grid h-9 w-9 place-items-center text-white/70 transition hover:bg-white/10 hover:text-white"
                style={{ borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)" }}
                aria-label="Previous guide step"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <button
            ref={nextButtonRef}
            type="button"
            onClick={() => {
              if (isLastStep) setOpen(false);
              else setStepIndex((current) => current + 1);
            }}
            className="inline-flex h-9 items-center justify-center gap-2 px-4 text-xs font-bold uppercase text-black transition active:scale-95"
            style={{ borderRadius: 8, background: "#FFD700" }}
          >
            {isLastStep ? (
              <>
                <Check className="h-4 w-4" />
                Done
              </>
            ) : (
              "Next"
            )}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
