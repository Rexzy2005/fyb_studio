import { z } from "zod";

const schema = z.object({
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  MONGODB_DB: z.string().default("fyb_studio"),

  AUTH_SECRET: z.string().min(1, "AUTH_SECRET is required"),
  AUTH_URL: z.string().url().optional(),

  GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),
  GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is required"),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  ADMIN_EMAILS: z.string().optional(),

  // Paystack (server-side; required to enable paid downloads)
  PAYSTACK_SECRET_KEY: z.string().min(1, "PAYSTACK_SECRET_KEY is required").optional(),
  // Public key is shipped to the browser via NEXT_PUBLIC_*; we mirror it
  // server-side so payment-init responses can return it without the client
  // needing to read process.env directly.
  NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY: z.string().optional(),
  PAYSTACK_WEBHOOK_SECRET: z.string().optional(),
  // Override the flat per-download price (in NGN, not kobo) when needed.
  // Defaults to 1000 NGN per the product spec.
  PAYMENT_DOWNLOAD_PRICE_NGN: z.coerce.number().int().positive().default(1000),
  // Hours after payment within which the user MUST come back and finish
  // their download. Grants are single-use - this is a safety net for
  // unredeemed grants, NOT a re-download window. Default 7 days.
  PAYMENT_GRANT_EXPIRY_HOURS: z.coerce.number().int().positive().default(168),

  // Storage quota (in MB) for the MongoDB cluster the app talks to. Used
  // by the admin dashboard's storage panel to render a % used / left bar.
  // Defaults to 512 (Atlas M0 / Free tier). Override per-environment when
  // you upgrade to a paid tier (e.g. 5120 for M10, 10240 for M20, etc.).
  MONGODB_STORAGE_QUOTA_MB: z.coerce.number().int().positive().default(512),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const fieldErrors = parsed.error.flatten().fieldErrors;
  const summary = Object.entries(fieldErrors)
    .map(([k, errs]) => `${k}: ${(errs ?? []).join(", ")}`)
    .join("; ");
  console.error("[env] Invalid environment variables:", fieldErrors);
  throw new Error(
    `Invalid environment variables - ${summary || "see server logs"}`
  );
}

export const env = parsed.data;
export type Env = z.infer<typeof schema>;
