/**
 * Browser-side Paystack helpers + thin wrappers over our payment API.
 * Keeps the editor pages free of fetch boilerplate and centralises the
 * popup-open dance with our verify roundtrip.
 */

export type PaymentInitResponse = {
  reference: string;
  accessCode: string | null;
  authorizationUrl: string | null;
  amountKobo: number;
  amountNgn: number;
  currency: "NGN";
  publicKey: string;
  customerEmail: string | null;
};

export type ActiveGrantInfo = {
  grant: {
    grantId: string;
    expiresAt: string;
    paymentId: string;
  } | null;
  price: {
    amountKobo: number;
    amountNgn: number;
    currency: "NGN";
  };
};

const DEFAULT_REQUEST_TIMEOUT_MS = 6000;
const PAYMENT_INIT_TIMEOUT_MS = 10000;
const PAYMENT_VERIFY_TIMEOUT_MS = 12000;
const PAYSTACK_SCRIPT_TIMEOUT_MS = 10000;

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: { message?: string } };
    return data?.error?.message ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

function createTimeoutSignal(timeoutMs: number): {
  signal: AbortSignal;
  clear: () => void;
} {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => window.clearTimeout(timer),
  };
}

export async function fetchActiveGrant(
  opts: {
    templateId: string;
    userDesignId: string | null;
  },
  options: { timeoutMs?: number } = {}
): Promise<ActiveGrantInfo> {
  const params = new URLSearchParams({ templateId: opts.templateId });
  if (opts.userDesignId) params.set("userDesignId", opts.userDesignId);
  const timeout = createTimeoutSignal(
    options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
  );
  try {
    const res = await fetch(`/api/payments/grant?${params.toString()}`, {
      cache: "no-store",
      signal: timeout.signal,
    });
    if (!res.ok) throw new Error(await readError(res));
    return (await res.json()) as ActiveGrantInfo;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Payment check timed out");
    }
    throw err;
  } finally {
    timeout.clear();
  }
}

export async function initializePayment(opts: {
  templateId: string;
  userDesignId: string | null;
}): Promise<PaymentInitResponse> {
  const timeout = createTimeoutSignal(PAYMENT_INIT_TIMEOUT_MS);
  try {
    const res = await fetch("/api/payments/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts),
      signal: timeout.signal,
    });
    if (!res.ok) throw new Error(await readError(res));
    return (await res.json()) as PaymentInitResponse;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Payment initialization timed out. Please try again.");
    }
    throw err;
  } finally {
    timeout.clear();
  }
}

export type VerifyResult = {
  status: "success";
  grant: {
    id: string;
    templateId: string;
    userDesignId: string | null;
    expiresAt: string;
    paystackReference: string;
  };
};

export async function verifyPayment(reference: string): Promise<VerifyResult> {
  const timeout = createTimeoutSignal(PAYMENT_VERIFY_TIMEOUT_MS);
  try {
    const res = await fetch("/api/payments/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference }),
      signal: timeout.signal,
    });
    if (!res.ok) throw new Error(await readError(res));
    return (await res.json()) as VerifyResult;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Payment confirmation timed out. Please refresh and retry.");
    }
    throw err;
  } finally {
    timeout.clear();
  }
}

export async function recordPaymentEvent(opts: {
  reference: string;
  event: "cancelled";
}): Promise<void> {
  const res = await fetch("/api/payments/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  if (!res.ok) throw new Error(await readError(res));
}

export type PendingGrant = {
  grantId: string;
  paymentId: string;
  templateId: string;
  templateName: string | null;
  userDesignId: string | null;
  issuedAt: string;
  expiresAt: string;
};

export async function fetchPendingGrants(): Promise<PendingGrant[]> {
  const res = await fetch("/api/payments/grants", { cache: "no-store" });
  if (!res.ok) throw new Error(await readError(res));
  const body = (await res.json()) as { grants: PendingGrant[] };
  return body.grants;
}

export async function recordDownload(opts: {
  templateId: string;
  userDesignId: string | null;
  scale: number | null;
}): Promise<void> {
  const res = await fetch("/api/downloads/record", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  if (!res.ok) throw new Error(await readError(res));
}

/**
 * Lazy-load the Paystack inline JS (idempotent). The script is small enough
 * to fetch on demand, and we don't want to load it for non-paying flows.
 */
let paystackScriptPromise: Promise<void> | null = null;
export function loadPaystackScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("browser only"));
  if (paystackScriptPromise) return paystackScriptPromise;

  paystackScriptPromise = new Promise<void>((resolve, reject) => {
    const paystackWindow = window as {
      Paystack?: unknown;
      PaystackPop?: unknown;
    };
    if (paystackWindow.Paystack || paystackWindow.PaystackPop) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-fyb-paystack="1"]'
    );
    if (existing) {
      const timer = window.setTimeout(() => {
        paystackScriptPromise = null;
        reject(new Error("Paystack checkout took too long to load. Please try again."));
      }, PAYSTACK_SCRIPT_TIMEOUT_MS);
      existing.addEventListener("load", () => {
        window.clearTimeout(timer);
        resolve();
      });
      existing.addEventListener("error", () => {
        window.clearTimeout(timer);
        paystackScriptPromise = null;
        reject(new Error("Failed to load Paystack JS"));
      });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://js.paystack.co/v2/inline.js";
    script.async = true;
    script.setAttribute("data-fyb-paystack", "1");
    const timer = window.setTimeout(() => {
      paystackScriptPromise = null;
      script.remove();
      reject(new Error("Paystack checkout took too long to load. Please try again."));
    }, PAYSTACK_SCRIPT_TIMEOUT_MS);
    script.onload = () => {
      window.clearTimeout(timer);
      resolve();
    };
    script.onerror = () => {
      window.clearTimeout(timer);
      paystackScriptPromise = null;
      reject(new Error("Failed to load Paystack JS"));
    };
    document.head.appendChild(script);
  });
  return paystackScriptPromise;
}

type PaystackPopupArgs = {
  publicKey: string;
  reference: string;
  accessCode?: string | null;
  amountKobo: number;
  email: string;
  onSuccess: (reference: string) => void;
  onCancel: () => void;
  timeoutMs?: number;
};

type PaystackPopHandle = {
  newTransaction: (args: {
    key: string;
    email: string;
    amount: number;
    currency?: "NGN";
    reference: string;
    access_code?: string;
    onSuccess: (tx: { reference?: string; trxref?: string }) => void;
    onCancel: () => void;
    onError?: (error: { message?: string }) => void;
  }) => void;
  resumeTransaction?: (
    accessCode: string,
    args?: {
      onSuccess: (tx: { reference?: string; trxref?: string }) => void;
      onCancel: () => void;
      onError?: (error: { message?: string }) => void;
    }
  ) => void;
};

type PaystackPopCtor = (new () => PaystackPopHandle) & {
  resumeTransaction?: PaystackPopHandle["resumeTransaction"];
};
type PaystackTransaction = { reference?: string; trxref?: string };
type PaystackPopupCallbacks = {
  onSuccess: (tx: PaystackTransaction) => void;
  onCancel: () => void;
  onError?: (error: { message?: string }) => void;
};

const FLOATING_PAYSTACK_STYLE_ID = "fyb-floating-paystack-style";

function installFloatingPaystackFrame(): () => void {
  const taggedHosts = new Set<HTMLElement>();
  const taggedFrames = new Set<HTMLIFrameElement>();
  const backdrop = document.createElement("div");
  backdrop.className = "fyb-paystack-floating-backdrop";
  const style = document.createElement("style");
  style.id = FLOATING_PAYSTACK_STYLE_ID;
  style.textContent = `
    .fyb-paystack-floating-backdrop {
      position: fixed !important;
      inset: 0 !important;
      z-index: 2147483645 !important;
      pointer-events: none !important;
      background:
        radial-gradient(circle at 50% 42%, rgba(255, 215, 0, 0.18), transparent 32%),
        radial-gradient(circle at 50% 78%, rgba(255, 140, 66, 0.1), transparent 28%),
        rgba(0, 0, 0, 0.34) !important;
      backdrop-filter: blur(10px) saturate(1.08) !important;
      -webkit-backdrop-filter: blur(10px) saturate(1.08) !important;
    }

    .fyb-paystack-floating-host {
      position: fixed !important;
      inset: 0 !important;
      z-index: 2147483647 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      box-sizing: border-box !important;
      padding: 18px !important;
      pointer-events: none !important;
      background:
        radial-gradient(circle at 50% 42%, rgba(255, 215, 0, 0.16), transparent 34%),
        rgba(0, 0, 0, 0.18) !important;
      backdrop-filter: blur(8px) saturate(1.08) !important;
      -webkit-backdrop-filter: blur(8px) saturate(1.08) !important;
    }

    .fyb-paystack-floating-host > :not(iframe) {
      background: transparent !important;
    }

    .fyb-paystack-floating-host iframe,
    iframe.fyb-paystack-floating-frame {
      width: min(96vw, 520px) !important;
      height: min(92dvh, 760px) !important;
      max-width: 520px !important;
      max-height: 760px !important;
      min-width: 320px !important;
      min-height: 520px !important;
      scrollbar-width: none !important;
      -ms-overflow-style: none !important;
      pointer-events: auto !important;
      touch-action: auto !important;
      border: 1px solid rgba(255, 215, 0, 0.34) !important;
      border-radius: 22px !important;
      background: transparent !important;
      box-shadow:
        0 0 0 1px rgba(255, 255, 255, 0.08),
        0 22px 80px rgba(0, 0, 0, 0.42),
        0 0 44px rgba(255, 215, 0, 0.22) !important;
      overflow: hidden !important;
    }

    .fyb-paystack-floating-host iframe::-webkit-scrollbar,
    iframe.fyb-paystack-floating-frame::-webkit-scrollbar {
      width: 0 !important;
      height: 0 !important;
      display: none !important;
    }

    iframe.fyb-paystack-floating-frame {
      position: fixed !important;
      top: 50% !important;
      left: 50% !important;
      z-index: 2147483646 !important;
      transform: translate(-50%, -50%) !important;
      background: transparent !important;
    }

    @media (max-width: 480px) {
      .fyb-paystack-floating-host {
        padding: 12px !important;
      }

      .fyb-paystack-floating-host iframe,
      iframe.fyb-paystack-floating-frame {
        width: calc(100vw - 24px) !important;
        height: min(90dvh, 720px) !important;
        min-width: 0 !important;
        min-height: 500px !important;
        border-radius: 18px !important;
      }
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(backdrop);

  const isPaystackFrame = (frame: HTMLIFrameElement) => {
    const rect = frame.getBoundingClientRect();
    const style = window.getComputedStyle(frame);
    const viewportLike =
      rect.width >= window.innerWidth * 0.72 &&
      rect.height >= window.innerHeight * 0.72;
    const fixedOrAbsolute =
      style.position === "fixed" || style.position === "absolute";
    const haystack = [
      frame.src,
      frame.name,
      frame.id,
      frame.title,
      frame.getAttribute("data-testid"),
      frame.getAttribute("allow"),
      frame.className,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return (
      haystack.includes("paystack") ||
      haystack.includes("checkout") ||
      (fixedOrAbsolute && viewportLike)
    );
  };

  const findHost = (frame: HTMLIFrameElement): HTMLElement | null => {
    let node = frame.parentElement;
    while (node && node !== document.body) {
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      const viewportLike =
        rect.width >= window.innerWidth * 0.78 &&
        rect.height >= window.innerHeight * 0.78;
      if (style.position === "fixed" || viewportLike) return node;
      node = node.parentElement;
    }
    return null;
  };

  let rafId = 0;
  const apply = () => {
    rafId = 0;
    document.querySelectorAll<HTMLIFrameElement>("iframe").forEach((frame) => {
      if (!isPaystackFrame(frame)) return;
      const host = findHost(frame);
      if (host) {
        if (!host.classList.contains("fyb-paystack-floating-host")) {
          host.classList.add("fyb-paystack-floating-host");
        }
        taggedHosts.add(host);
        return;
      }
      if (!frame.classList.contains("fyb-paystack-floating-frame")) {
        frame.classList.add("fyb-paystack-floating-frame");
      }
      taggedFrames.add(frame);
    });
  };
  const scheduleApply = () => {
    if (rafId) return;
    rafId = window.requestAnimationFrame(apply);
  };

  scheduleApply();
  const observer = new MutationObserver(apply);
  observer.observe(document.body, { childList: true, subtree: true });
  const intervalStartedAt = Date.now();
  const interval = window.setInterval(() => {
    scheduleApply();
    if (Date.now() - intervalStartedAt > 8000) {
      window.clearInterval(interval);
    }
  }, 250);

  return () => {
    observer.disconnect();
    window.clearInterval(interval);
    if (rafId) window.cancelAnimationFrame(rafId);
    taggedHosts.forEach((host) =>
      host.classList.remove("fyb-paystack-floating-host")
    );
    taggedFrames.forEach((frame) =>
      frame.classList.remove("fyb-paystack-floating-frame")
    );
    backdrop.remove();
    style.remove();
  };
}

/**
 * Opens the Paystack popup. Resolves when the user pays (with the reference
 * Paystack handed back), rejects when they cancel.
 *
 * Uses Paystack's current v2 constructor (`new Paystack()`), with the older
 * `PaystackPop` global kept as a fallback for compatibility.
 */
export async function openPaystackPopup(args: PaystackPopupArgs): Promise<string> {
  await loadPaystackScript();
  const paystackWindow = window as unknown as {
    Paystack?: PaystackPopCtor;
    PaystackPop?: PaystackPopCtor;
  };
  const PaystackCtor = paystackWindow.Paystack ?? paystackWindow.PaystackPop;
  if (typeof PaystackCtor !== "function") {
    throw new Error("Paystack JS did not initialise");
  }
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const cleanupFloatingFrame = installFloatingPaystackFrame();
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanupFloatingFrame();
      reject(new Error("Payment session expired. Please start again."));
      args.onCancel();
    }, args.timeoutMs ?? 30 * 60 * 1000);
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      cleanupFloatingFrame();
      fn();
    };
    const popup = new PaystackCtor();
    const callbacks: PaystackPopupCallbacks = {
      onSuccess: (tx) => {
        settle(() => {
          const reference = tx.reference ?? tx.trxref ?? args.reference;
          resolve(reference);
          args.onSuccess(reference);
        });
      },
      onCancel: () => {
        settle(() => {
          reject(new Error("Payment was cancelled"));
          args.onCancel();
        });
      },
      onError: (error) => {
        settle(() => {
          reject(new Error(error?.message ?? "Paystack checkout failed to load"));
        });
      },
    };

    if (args.accessCode) {
      const resumeTransaction =
        typeof popup.resumeTransaction === "function"
          ? popup.resumeTransaction.bind(popup)
          : typeof PaystackCtor.resumeTransaction === "function"
            ? PaystackCtor.resumeTransaction.bind(PaystackCtor)
            : null;

      if (!resumeTransaction) {
        settle(() => {
          reject(
            new Error(
              "Payment is still processing. We will keep checking this transaction."
            )
          );
        });
        return;
      }

      try {
        resumeTransaction(args.accessCode, callbacks);
      } catch (error) {
        console.warn("[payment] Paystack resumeTransaction failed", error);
        settle(() => {
          reject(
            new Error(
              "Payment is still processing. We will keep checking this transaction."
            )
          );
        });
      }
      return;
    }

    popup.newTransaction({
      key: args.publicKey,
      email: args.email,
      amount: args.amountKobo,
      currency: "NGN",
      reference: args.reference,
      ...callbacks,
    });
  });
}
