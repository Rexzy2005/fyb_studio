import { resolveBaseUrl } from "@/backend/email/baseUrl";
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
      "[email] SMTP not configured - skipping welcome email for",
      input.email
    );
    return;
  }

  const baseUrl = resolveBaseUrl();
  const { subject, html, text } = renderWelcomeEmail({
    name: input.name,
    username: input.username,
    dashboardUrl: `${baseUrl}/dashboard`,
    templatesUrl: `${baseUrl}/templates`,
  });

  console.log("[email] sending welcome email to", input.email, "via", baseUrl);
  const info = await transport.sendMail({
    from: getEmailFrom(),
    to: input.email,
    subject,
    html,
    text,
  });
  console.log(
    "[email] ✓ welcome email accepted:",
    info.accepted,
    "messageId:",
    info.messageId
  );
}
