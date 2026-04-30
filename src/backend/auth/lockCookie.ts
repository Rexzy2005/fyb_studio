import { createHmac, timingSafeEqual } from "node:crypto";

const LOCK_TOKEN_TTL_MS = 60 * 60 * 1000;

export const LOCK_COOKIE_PREFIX = "fyb-lock-";

export function lockCookieName(templateId: string): string {
  return `${LOCK_COOKIE_PREFIX}${templateId}`;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export type IssuedLockToken = {
  token: string;
  expiresAt: number;
  maxAge: number;
};

export function issueLockToken(
  templateId: string,
  departmentId: string,
  secret: string
): IssuedLockToken {
  const expiresAt = Date.now() + LOCK_TOKEN_TTL_MS;
  const payload = `${templateId}:${departmentId}:${expiresAt}`;
  const sig = sign(payload, secret);
  return {
    token: `${payload}.${sig}`,
    expiresAt,
    maxAge: Math.floor(LOCK_TOKEN_TTL_MS / 1000),
  };
}

export type VerifiedLockToken = {
  ok: true;
  templateId: string;
  departmentId: string;
  expiresAt: number;
};

export function verifyLockToken(
  token: string | undefined | null,
  expectedTemplateId: string,
  secret: string
): VerifiedLockToken | { ok: false } {
  if (!token) return { ok: false };

  const dot = token.lastIndexOf(".");
  if (dot < 0) return { ok: false };

  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const parts = payload.split(":");
  if (parts.length !== 3) return { ok: false };

  const [tid, did, expRaw] = parts;
  if (tid !== expectedTemplateId) return { ok: false };

  const expectedSig = sign(payload, secret);
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length) return { ok: false };
  if (!timingSafeEqual(sigBuf, expBuf)) return { ok: false };

  const expiresAt = Number(expRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return { ok: false };

  return { ok: true, templateId: tid, departmentId: did, expiresAt };
}
