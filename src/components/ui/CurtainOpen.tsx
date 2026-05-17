"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Lightweight cinematic curtain-open overlay.
 *
 * Used as a brand transition when entering /templates and the workspace,
 * matching the heavier landing-page curtain but without the countdown.
 * A confetti puff fires from the seam the instant the curtains start to
 * part, revealed as they pull apart.
 *
 * Use it as the first child of a page. When mounted it holds the
 * curtains closed for a beat, then slides them open while firing the
 * puff and finally unmounts itself.
 */
export function CurtainOpen({
  brand = "FYB STUDIO",
  durationMs = 1500,
}: {
  brand?: string;
  durationMs?: number;
}) {
  const [phase, setPhase] = useState<"closed" | "opening" | "gone">("closed");
  const puffCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const openAt = Math.max(180, Math.round(durationMs * 0.22));
    const removeAt = Math.max(openAt + 1000, durationMs);

    const t1 = window.setTimeout(() => setPhase("opening"), openAt);
    const t2 = window.setTimeout(() => setPhase("gone"), removeAt);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [durationMs]);

  // Fire the confetti puff the instant the curtains start parting.
  useEffect(() => {
    if (phase !== "opening") return;
    const t = window.setTimeout(() => firePuff(puffCanvasRef.current), 80);
    return () => window.clearTimeout(t);
  }, [phase]);

  // Lock body scroll while the curtain is visible so users can't scroll
  // behind it. Released the instant we go to the "gone" phase.
  useEffect(() => {
    if (phase === "gone") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [phase]);

  if (phase === "gone") return null;

  const opening = phase === "opening";

  return (
    <div
      aria-hidden
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        pointerEvents: opening ? "none" : "auto",
        opacity: opening ? 0 : 1,
        transition: "opacity 600ms cubic-bezier(0.4,0,0.2,1) 800ms",
        overflow: "hidden",
      }}
    >
      {/* Backdrop — gold radial behind the curtains */}
      <div
        style={{
          position: "absolute", inset: 0,
          background:
            "radial-gradient(ellipse 60% 45% at 50% 50%, rgba(255,180,0,0.18), rgba(8,6,2,1) 70%), #050505",
        }}
      />

      {/* Confetti puff canvas — sits behind the curtains so it's
          REVEALED as they pull apart. */}
      <canvas
        ref={puffCanvasRef}
        style={{
          position: "absolute", inset: 0,
          width: "100%", height: "100%",
          pointerEvents: "none",
          zIndex: 5,
        }}
      />

      {/* Brand mark — fades out as curtains open */}
      <div
        style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          zIndex: 9,
          opacity: opening ? 0 : 1,
          transition: "opacity 300ms cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span
            aria-hidden
            style={{
              position: "relative",
              display: "inline-flex",
              width: 40, height: 40,
              borderRadius: 9,
              overflow: "hidden",
              boxShadow: "0 6px 18px rgba(255,180,0,0.35)",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.jpg"
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </span>
          <span
            style={{
              fontFamily: "var(--font-geist-mono), monospace",
              fontSize: 12, fontWeight: 800,
              letterSpacing: "0.32em",
              color: "rgba(255,255,255,0.9)",
              textTransform: "uppercase",
            }}
          >
            {brand}
          </span>
        </div>
      </div>

      {/* LEFT curtain */}
      <div
        style={{
          position: "absolute", top: 0, bottom: 0, left: 0,
          width: "50%",
          background: "linear-gradient(90deg, #050505 0%, #0c0904 100%)",
          borderRight: opening ? "1px solid rgba(255,215,0,0.35)" : "none",
          transform: opening ? "translateX(-100%)" : "translateX(0)",
          transition: "transform 1100ms cubic-bezier(0.76, 0, 0.24, 1)",
          zIndex: 10,
          boxShadow: opening ? "10px 0 40px rgba(255,180,0,0.18)" : "none",
        }}
      />
      {/* RIGHT curtain */}
      <div
        style={{
          position: "absolute", top: 0, bottom: 0, right: 0,
          width: "50%",
          background: "linear-gradient(270deg, #050505 0%, #0c0904 100%)",
          borderLeft: opening ? "1px solid rgba(255,215,0,0.35)" : "none",
          transform: opening ? "translateX(100%)" : "translateX(0)",
          transition: "transform 1100ms cubic-bezier(0.76, 0, 0.24, 1)",
          zIndex: 10,
          boxShadow: opening ? "-10px 0 40px rgba(255,180,0,0.18)" : "none",
        }}
      />

      {/* Gold rim light along the seam — flashes on as curtains begin to part */}
      <div
        style={{
          position: "absolute", top: 0, left: 0, right: 0,
          height: 2,
          background: "linear-gradient(90deg, transparent, #FFD700 50%, transparent)",
          opacity: opening ? 1 : 0,
          transition: "opacity 500ms 150ms cubic-bezier(0.4,0,0.2,1)",
          zIndex: 11,
          filter: "drop-shadow(0 0 12px #FFD700)",
        }}
      />
    </div>
  );
}

/* ─── Confetti puff ─────────────────────────────────────────
   Pre-computed deterministic particles so React 19 stays happy (no
   Math.random in render). Each particle has stable velocity, colour,
   size and shape derived from an index seed. */
const PUFF_COLORS = ["#FFD700", "#FFED4A", "#FF8C42", "#FF6B6B", "#4ECDC4", "#A855F7", "#84CC16", "#06B6D4", "#EC4899"];
const PUFF_SEEDS = Array.from({ length: 90 }).map((_, i) => {
  const a = Math.sin(i * 12.9898) * 43758.5453;
  const b = Math.sin(i * 78.233) * 43758.5453;
  const c = Math.sin(i * 39.346) * 43758.5453;
  const ra = a - Math.floor(a);
  const rb = b - Math.floor(b);
  const rc = c - Math.floor(c);
  const angle = ra * Math.PI * 2;
  const speed = 5 + rb * 16;
  return {
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed - 3.5,
    rotV: (rc - 0.5) * 0.4,
    color: PUFF_COLORS[i % PUFF_COLORS.length],
    w: 4 + rb * 7,
    h: 5 + ra * 9,
    shape: (["rect", "rect", "circle", "ribbon"] as const)[i % 4],
  };
});

function firePuff(canvas: HTMLCanvasElement | null) {
  if (!canvas) return;
  const W = canvas.clientWidth || window.innerWidth;
  const H = canvas.clientHeight || window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);

  const cx = W / 2;
  const cy = H / 2;
  const particles = PUFF_SEEDS.map((p) => ({
    x: cx, y: cy,
    vx: p.vx, vy: p.vy,
    rot: 0, rotV: p.rotV,
    w: p.w, h: p.h,
    color: p.color,
    shape: p.shape,
    opacity: 1,
  }));

  let lastTime = performance.now();
  let raf = 0;
  const draw = (now: number) => {
    const dt = now - lastTime;
    lastTime = now;
    ctx.clearRect(0, 0, W, H);
    let alive = false;
    for (const p of particles) {
      if (p.opacity <= 0) continue;
      alive = true;
      const f = dt / 16;
      p.x += p.vx * f;
      p.y += p.vy * f;
      p.vy += 0.35 * f;
      p.vx *= Math.pow(0.985, f);
      p.rot += p.rotV * f;
      if (p.y > H * 0.6) p.opacity = Math.max(0, p.opacity - 0.02 * f);

      ctx.save();
      ctx.globalAlpha = p.opacity;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      if (p.shape === "circle") {
        ctx.beginPath();
        ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === "ribbon") {
        ctx.beginPath();
        ctx.moveTo(-p.w / 2, -p.h / 5);
        ctx.quadraticCurveTo(0, -p.h * 0.6, p.w / 2, -p.h / 5);
        ctx.quadraticCurveTo(0, p.h * 0.6, -p.w / 2, p.h / 5);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
      ctx.restore();
    }
    if (alive) raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);
  return () => cancelAnimationFrame(raf);
}
