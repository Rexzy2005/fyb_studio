/**
 * Local-first record of "I paid for this design but haven't finished
 * downloading yet" — written immediately after Paystack verification, cleared
 * after a successful download recording.
 *
 * The server's DownloadGrant is the source of truth (it survives a wiped
 * browser, multi-device usage, etc.) — this localStorage layer is just a
 * fast UI hint so the dashboard can render the "Resume" tile instantly,
 * without waiting on `/api/payments/grants`.
 *
 * If the two ever disagree, server wins. The dashboard reconciles by
 * preferring server-returned grants over local hints.
 */

const STORAGE_KEY = "fyb:pendingDownloads";

export type PendingDownload = {
  /** Unique key — Paystack reference works perfectly. */
  reference: string;
  templateId: string;
  templateName: string;
  userDesignId: string | null;
  /** Millis since epoch when the user paid. */
  paidAt: number;
};

function readAll(): PendingDownload[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPendingDownload);
  } catch {
    return [];
  }
}

function writeAll(list: PendingDownload[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    // Notify same-tab listeners — `storage` only fires in OTHER tabs.
    window.dispatchEvent(new CustomEvent("fyb:pending-downloads:changed"));
  } catch {
    // out-of-quota or private mode — silently degrade. Server is source of truth.
  }
}

export function listPendingDownloads(): PendingDownload[] {
  return readAll().sort((a, b) => b.paidAt - a.paidAt);
}

/**
 * Record a paid-but-not-downloaded design. Idempotent on `reference` — if
 * the user re-pays for the same design (shouldn't happen but defensive),
 * the latest entry replaces the old.
 */
export function recordPendingDownload(entry: PendingDownload): void {
  const list = readAll().filter((p) => p.reference !== entry.reference);
  list.push(entry);
  writeAll(list);
}

export function clearPendingDownload(reference: string): void {
  const next = readAll().filter((p) => p.reference !== reference);
  writeAll(next);
}

/**
 * Drop any local entries whose reference doesn't match a server-returned
 * grant. Used by the dashboard to reconcile — if the server says a grant
 * is consumed/expired, we shouldn't keep showing it locally.
 */
export function reconcilePendingDownloads(activeReferences: Set<string>): void {
  const list = readAll();
  const filtered = list.filter((p) => activeReferences.has(p.reference));
  if (filtered.length !== list.length) writeAll(filtered);
}

function isPendingDownload(value: unknown): value is PendingDownload {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.reference === "string" &&
    typeof v.templateId === "string" &&
    typeof v.templateName === "string" &&
    (v.userDesignId === null || typeof v.userDesignId === "string") &&
    typeof v.paidAt === "number"
  );
}
