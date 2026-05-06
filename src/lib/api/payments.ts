/**
 * Browser-side Paystack helpers + thin wrappers over our payment API.
 * Keeps the editor pages free of fetch boilerplate and centralises the
 * popup-open dance with our verify roundtrip.
 */

export type PaymentInitResponse = {
  reference: string;
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

async function readError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: { message?: string } };
    return data?.error?.message ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export async function fetchActiveGrant(opts: {
  templateId: string;
  userDesignId: string | null;
}): Promise<ActiveGrantInfo> {
  const params = new URLSearchParams({ templateId: opts.templateId });
  if (opts.userDesignId) params.set("userDesignId", opts.userDesignId);
  const res = await fetch(`/api/payments/grant?${params.toString()}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as ActiveGrantInfo;
}

export async function initializePayment(opts: {
  templateId: string;
  userDesignId: string | null;
}): Promise<PaymentInitResponse> {
  const res = await fetch("/api/payments/init", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as PaymentInitResponse;
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
  const res = await fetch("/api/payments/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reference }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as VerifyResult;
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
    if ((window as { PaystackPop?: unknown }).PaystackPop) {
      resolve();
      return;
    }
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-fyb-paystack="1"]'
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Failed to load Paystack JS"))
      );
      return;
    }
    const script = document.createElement("script");
    script.src = "https://js.paystack.co/v2/inline.js";
    script.async = true;
    script.setAttribute("data-fyb-paystack", "1");
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Paystack JS"));
    document.head.appendChild(script);
  });
  return paystackScriptPromise;
}

type PaystackPopupArgs = {
  publicKey: string;
  reference: string;
  amountKobo: number;
  email: string;
  onSuccess: (reference: string) => void;
  onCancel: () => void;
};

type PaystackPopHandle = {
  newTransaction: (args: {
    key: string;
    email: string;
    amount: number;
    reference: string;
    onSuccess: (tx: { reference: string }) => void;
    onCancel: () => void;
  }) => void;
};

type PaystackPopCtor = new () => PaystackPopHandle;

/**
 * Opens the Paystack popup. Resolves when the user pays (with the reference
 * Paystack handed back), rejects when they cancel.
 *
 * Uses the v2 constructor (`new PaystackPop()`) — the older `.setup({})`
 * helper still works but logs a deprecation warning in the browser console.
 */
export async function openPaystackPopup(args: PaystackPopupArgs): Promise<string> {
  await loadPaystackScript();
  const PaystackPop = (window as unknown as { PaystackPop?: PaystackPopCtor })
    .PaystackPop;
  if (typeof PaystackPop !== "function") {
    throw new Error("Paystack JS did not initialise");
  }
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const popup = new PaystackPop();
    popup.newTransaction({
      key: args.publicKey,
      email: args.email,
      amount: args.amountKobo,
      reference: args.reference,
      onSuccess: (tx) => {
        if (settled) return;
        settled = true;
        resolve(tx.reference);
        args.onSuccess(tx.reference);
      },
      onCancel: () => {
        if (settled) return;
        settled = true;
        reject(new Error("Payment was cancelled"));
        args.onCancel();
      },
    });
  });
}
