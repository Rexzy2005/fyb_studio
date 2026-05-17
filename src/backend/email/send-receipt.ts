import { resolveBaseUrl } from "@/backend/email/baseUrl";
import { renderReceiptEmail } from "@/backend/email/templates/receipt";
import { getEmailFrom, getMailTransport } from "@/backend/email/transport";

export type SendReceiptInput = {
  email: string;
  name: string;
  templateName: string;
  amountNgn: number;
  paystackReference: string;
  paidAt: Date;
};

/**
 * Fire-and-forget receipt email. SMTP failures log but never throw - we
 * don't want a flaky transport to break the payment confirmation flow.
 */
export async function sendReceiptEmail(input: SendReceiptInput): Promise<void> {
  const transport = getMailTransport();
  if (!transport) {
    console.warn(
      "[email] SMTP not configured - skipping receipt email for",
      input.email
    );
    return;
  }

  const baseUrl = resolveBaseUrl();
  const { subject, html, text } = renderReceiptEmail({
    name: input.name,
    templateName: input.templateName,
    amountNgn: input.amountNgn,
    paystackReference: input.paystackReference,
    paidAt: input.paidAt,
    dashboardUrl: `${baseUrl}/dashboard`,
  });

  try {
    const info = await transport.sendMail({
      from: getEmailFrom(),
      to: input.email,
      subject,
      html,
      text,
    });
    console.log(
      "[email] ✓ receipt email accepted:",
      info.accepted,
      "messageId:",
      info.messageId
    );
  } catch (err) {
    console.error("[email] receipt email failed:", err);
  }
}
