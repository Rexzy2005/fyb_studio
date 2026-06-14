/**
 * Local record of a checkout that has been initialized but may not have
 * returned through Paystack's popup callback yet. This covers bank-transfer
 * flows where the user copies account details, switches apps, and the page
 * reloads before the callback can verify.
 */

const STORAGE_KEY = "fyb:paymentAttempts";
const ATTEMPT_RETENTION_MS = 45 * 60 * 1000;

export type PaymentAttempt = {
  reference: string;
  accessCode?: string | null;
  publicKey?: string | null;
  amountKobo?: number | null;
  templateId: string;
  templateName: string;
  userDesignId: string | null;
  amountNgn: number;
  initializedAt: number;
};

function isPaymentAttempt(value: unknown): value is PaymentAttempt {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.reference === "string" &&
    (v.accessCode === undefined ||
      v.accessCode === null ||
      typeof v.accessCode === "string") &&
    (v.publicKey === undefined ||
      v.publicKey === null ||
      typeof v.publicKey === "string") &&
    (v.amountKobo === undefined ||
      v.amountKobo === null ||
      typeof v.amountKobo === "number") &&
    typeof v.templateId === "string" &&
    typeof v.templateName === "string" &&
    (v.userDesignId === null || typeof v.userDesignId === "string") &&
    typeof v.amountNgn === "number" &&
    typeof v.initializedAt === "number"
  );
}

function isFresh(entry: PaymentAttempt, now = Date.now()): boolean {
  return now - entry.initializedAt <= ATTEMPT_RETENTION_MS;
}

function readAll(): PaymentAttempt[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPaymentAttempt).filter((entry) => isFresh(entry));
  } catch {
    return [];
  }
}

function writeAll(list: PaymentAttempt[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list.filter((entry) => isFresh(entry))));
    window.dispatchEvent(new CustomEvent("fyb:payment-attempts:changed"));
  } catch {
    // Browser storage is best-effort; server verification remains authoritative.
  }
}

export function listPaymentAttempts(): PaymentAttempt[] {
  return readAll().sort((a, b) => b.initializedAt - a.initializedAt);
}

export function recordPaymentAttempt(entry: PaymentAttempt): void {
  const next = readAll().filter((item) => item.reference !== entry.reference);
  next.push(entry);
  writeAll(next);
}

export function clearPaymentAttempt(reference: string): void {
  writeAll(readAll().filter((entry) => entry.reference !== reference));
}

export function findPaymentAttemptForDesign(
  templateId: string,
  userDesignId: string | null
): PaymentAttempt | null {
  return (
    listPaymentAttempts().find(
      (entry) =>
        entry.templateId === templateId &&
        (entry.userDesignId ?? null) === (userDesignId ?? null)
    ) ?? null
  );
}
