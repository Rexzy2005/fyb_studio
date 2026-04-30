import { env } from "@/backend/env";

/**
 * Resolves the canonical base URL for outbound links in emails.
 * Order: AUTH_URL env (set on Vercel + locally), Vercel-injected URL, localhost dev fallback.
 * Always returns a value with no trailing slash.
 */
export function resolveBaseUrl(): string {
  if (env.AUTH_URL) return env.AUTH_URL.replace(/\/+$/, "");

  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercelProd) return `https://${vercelProd.replace(/\/+$/, "")}`;

  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl.replace(/\/+$/, "")}`;

  return "http://localhost:3000";
}
