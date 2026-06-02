import { NextResponse } from "next/server";

export const runtime = "nodejs";

const AUTH_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
  "authjs.csrf-token",
  "__Host-authjs.csrf-token",
  "next-auth.csrf-token",
  "__Host-next-auth.csrf-token",
  "authjs.callback-url",
  "__Secure-authjs.callback-url",
  "next-auth.callback-url",
  "__Secure-next-auth.callback-url",
];

function deleteCookieVariants(res: NextResponse, name: string): void {
  res.cookies.delete(name);
  for (let i = 0; i < 10; i += 1) {
    res.cookies.delete(`${name}.${i}`);
  }
}

export function POST() {
  const res = NextResponse.json({ ok: true });
  for (const name of AUTH_COOKIE_NAMES) {
    deleteCookieVariants(res, name);
  }
  return res;
}
