import nodemailer, { type Transporter } from "nodemailer";
import { env } from "@/backend/env";

let cached: Transporter | null = null;

export function getMailTransport(): Transporter | null {
  if (!env.SMTP_HOST || !env.SMTP_PORT || !env.SMTP_USER || !env.SMTP_PASS) {
    return null;
  }
  if (cached) return cached;

  cached = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  return cached;
}

export function getEmailFrom(): string {
  return env.EMAIL_FROM ?? "FYB Studio <noreply@fyb.studio>";
}
