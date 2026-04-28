import { env } from "@/backend/env";
import { getEmailFrom, getMailTransport } from "@/backend/email/transport";
import { renderWelcomeEmail } from "@/backend/email/templates/welcome";

export type SendWelcomeInput = {
  email: string;
  name: string;
  username: string;
};

export async function sendWelcomeEmail(input: SendWelcomeInput): Promise<void> {
  const transport = getMailTransport();
  if (!transport) {
    console.warn(
      "[email] SMTP not configured — skipping welcome email for",
      input.email
    );
    return;
  }

  const baseUrl = env.AUTH_URL ?? "http://localhost:3000";
  const { subject, html, text } = renderWelcomeEmail({
    name: input.name,
    username: input.username,
    dashboardUrl: `${baseUrl.replace(/\/+$/, "")}/dashboard`,
  });

  await transport.sendMail({
    from: getEmailFrom(),
    to: input.email,
    subject,
    html,
    text,
  });
}
