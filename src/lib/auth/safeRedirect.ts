/**
 * Returns the input path only if it is a safe in-app relative path.
 * Rejects: missing values, absolute URLs (`https://...`), protocol-relative
 * URLs (`//evil.com`), and backslash variants. Otherwise returns the fallback.
 */
export function safeReturnPath(
  input: string | null | undefined,
  fallback: string
): string {
  if (typeof input !== "string") return fallback;
  if (input.length === 0) return fallback;
  if (!input.startsWith("/")) return fallback;
  if (input.startsWith("//") || input.startsWith("/\\")) return fallback;
  return input;
}
