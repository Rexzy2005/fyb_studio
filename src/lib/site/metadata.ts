export const SITE_NAME = "FYB Studio";

export const SITE_DESCRIPTION =
  "Design-led final-year templates you can personalize, preview live, and export as polished PNGs.";

export function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.AUTH_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercelProd) return `https://${vercelProd.replace(/\/+$/, "")}`;

  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl.replace(/\/+$/, "")}`;

  if (process.env.NODE_ENV === "development") return "http://localhost:3000";
  return "https://fybstudio.art";
}

export function absoluteSiteUrl(path: string): string {
  const base = resolveSiteUrl();
  return new URL(path, `${base}/`).toString();
}

export function cloudinarySocialImage(url: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith("cloudinary.com")) return url;
    return url.replace(
      "/image/upload/",
      "/image/upload/c_pad,w_1200,h_630,b_rgb:090909,q_auto:good,f_jpg/"
    );
  } catch {
    return url;
  }
}
