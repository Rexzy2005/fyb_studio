"use client";

import { useState } from "react";
import { Share2, Check, Link as LinkIcon } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

export type ShareButtonProps = {
  /**
   * The template id. The shared URL is built from this so the recipient
   * lands on the workspace for the same design.
   */
  templateId: string;
  /** Human-readable name shown in the native share sheet. */
  templateName: string;
  /** Visual variant. "icon" = square icon button, "pill" = wider pill button with label. */
  variant?: "icon" | "pill";
  /** Size in px for the button (height). Defaults to 36. */
  size?: number;
};

/**
 * Builds a shareable URL for a template. Adds ?via=share so the recipient
 * page can render a "shared with you" affordance and so we can track shares.
 */
function buildShareUrl(templateId: string): string {
  if (typeof window === "undefined") return `/templates/${templateId}/use?via=share`;
  const url = new URL(`/templates/${templateId}/use`, window.location.origin);
  url.searchParams.set("via", "share");
  return url.toString();
}

export function ShareButton({
  templateId,
  templateName,
  variant = "pill",
  size = 36,
}: ShareButtonProps) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleShare() {
    if (busy) return;
    setBusy(true);
    const url = buildShareUrl(templateId);
    const shareData: ShareData = {
      title: `${templateName} · FYB Studio`,
      text: `Open this FYB Studio design - "${templateName}". Add your details and export your version.`,
      url,
    };

    try {
      // Prefer native share sheet when available (mobile + some desktops)
      if (typeof navigator !== "undefined" && typeof navigator.share === "function" && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
        toast.show({
          tone: "success",
          title: "Shared",
          body: "Link sent to your share sheet.",
          duration: 2400,
        });
        return;
      }

      // Fallback: copy to clipboard
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        toast.show({
          tone: "success",
          title: "Link copied",
          body: "Paste it anywhere to share this design.",
          duration: 2800,
        });
        setTimeout(() => setCopied(false), 2200);
        return;
      }

      // Hard fallback: legacy execCommand (older mobile browsers)
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      toast.show({
        tone: "success",
        title: "Link copied",
        body: "Paste it anywhere to share this design.",
        duration: 2800,
      });
      setTimeout(() => setCopied(false), 2200);
    } catch (err) {
      // User cancelled native share -> AbortError is OK, don't surface
      if (err instanceof Error && err.name === "AbortError") return;
      toast.show({
        tone: "error",
        title: "Couldn't share",
        body: "Try copying the URL from your browser instead.",
        duration: 3200,
      });
    } finally {
      setBusy(false);
    }
  }

  // ICON variant - square, just an icon (good for tight spaces)
  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={handleShare}
        disabled={busy}
        aria-label="Share this design"
        title="Share this design"
        className="inline-flex shrink-0 items-center justify-center rounded-xl transition active:scale-95 disabled:opacity-50"
        style={{
          height: size,
          width: size,
          background: copied ? "rgba(78,205,196,0.12)" : "rgba(255,215,0,0.06)",
          border: `1px solid ${copied ? "rgba(78,205,196,0.4)" : "rgba(255,215,0,0.22)"}`,
          color: copied ? "#4ECDC4" : "#FFD700",
        }}
      >
        {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
      </button>
    );
  }

  // PILL variant - wider with label
  return (
    <button
      type="button"
      onClick={handleShare}
      disabled={busy}
      aria-label="Share this design"
      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold uppercase transition active:scale-95 disabled:opacity-50"
      style={{
        height: size,
        background: copied ? "rgba(78,205,196,0.12)" : "rgba(255,215,0,0.06)",
        border: `1px solid ${copied ? "rgba(78,205,196,0.4)" : "rgba(255,215,0,0.22)"}`,
        color: copied ? "#4ECDC4" : "#FFD700",
        letterSpacing: "0.08em",
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
      <span>{copied ? "Copied" : "Share"}</span>
    </button>
  );
}

/** Small inline link-with-copy widget for embedding in panels (e.g. Reserve panel). */
export function ShareUrlInline({ templateId }: { templateId: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const url = buildShareUrl(templateId);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.show({ tone: "success", title: "Link copied", duration: 1800 });
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.show({ tone: "error", title: "Couldn't copy", duration: 2400 });
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition active:scale-[0.99]"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,215,0,0.18)",
        color: "rgba(255,255,255,0.7)",
      }}
    >
      <LinkIcon className="h-3.5 w-3.5 shrink-0" style={{ color: "#FFD700" }} />
      <span
        className="min-w-0 flex-1 truncate"
        style={{ fontFamily: "var(--font-geist-mono), monospace", fontSize: 11 }}
      >
        {url.replace(/^https?:\/\//, "")}
      </span>
      <span
        className="shrink-0 text-[9px] font-semibold uppercase"
        style={{
          color: copied ? "#4ECDC4" : "rgba(255,215,0,0.7)",
          letterSpacing: "0.14em",
          fontFamily: "var(--font-geist-mono), monospace",
        }}
      >
        {copied ? "Copied" : "Copy"}
      </span>
    </button>
  );
}
