export type ReceiptTemplateInput = {
  name: string;
  templateName: string;
  amountNgn: number;
  paystackReference: string;
  paidAt: Date;
  dashboardUrl: string;
};

/**
 * Plain, professional receipt - minimal HTML so it survives every mail client
 * including the dark-mode-aggressive ones (Outlook, Gmail mobile).
 */
export function renderReceiptEmail(input: ReceiptTemplateInput): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = input.name.split(/\s+/)[0] || input.name;
  const formattedAmount = `₦${input.amountNgn.toLocaleString()}`;
  const formattedDate = input.paidAt.toLocaleString("en-NG", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const subject = `Receipt - ${input.templateName} (${formattedAmount})`;

  const text = [
    `Hi ${firstName},`,
    ``,
    `Thanks for your payment. Your download is unlocked for the next 24 hours.`,
    ``,
    `Receipt`,
    `--------`,
    `Design:    ${input.templateName}`,
    `Amount:    ${formattedAmount}`,
    `Date:      ${formattedDate}`,
    `Reference: ${input.paystackReference}`,
    ``,
    `Re-download or pick a new design at:`,
    input.dashboardUrl,
    ``,
    `- FYB Studio`,
  ].join("\n");

  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e4e4e7;">
            <tr>
              <td style="padding:24px 28px 16px 28px;">
                <div style="font-size:13px;color:#71717a;text-transform:uppercase;letter-spacing:0.08em;font-weight:600;">FYB Studio receipt</div>
                <div style="font-size:22px;font-weight:600;color:#09090b;margin-top:8px;">Thanks, ${escapeHtml(firstName)}.</div>
                <div style="font-size:14px;color:#52525b;margin-top:6px;line-height:1.6;">
                  Your payment is confirmed and the download for
                  <strong style="color:#09090b;">${escapeHtml(input.templateName)}</strong>
                  is unlocked for the next 24 hours.
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e4e4e7;border-bottom:1px solid #e4e4e7;">
                  ${row("Design", input.templateName)}
                  ${row("Amount", formattedAmount)}
                  ${row("Date", formattedDate)}
                  ${row("Reference", input.paystackReference, true)}
                </table>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:24px 28px 28px 28px;">
                <a href="${input.dashboardUrl}" style="display:inline-block;background:#09090b;color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:10px;font-weight:600;font-size:14px;">Open your dashboard</a>
                <div style="margin-top:14px;font-size:12px;color:#71717a;">Re-downloads of this design are free for the next 24 hours.</div>
              </td>
            </tr>
          </table>
          <div style="font-size:11px;color:#a1a1aa;margin-top:14px;">FYB Studio - design by fybstudio.art</div>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}

function row(label: string, value: string, mono = false): string {
  return `
    <tr>
      <td style="padding:12px 0;font-size:13px;color:#71717a;">${escapeHtml(label)}</td>
      <td align="right" style="padding:12px 0;font-size:13px;color:#09090b;font-weight:600;${mono ? "font-family:'SFMono-Regular',Menlo,Consolas,monospace;" : ""}">${escapeHtml(value)}</td>
    </tr>`;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
