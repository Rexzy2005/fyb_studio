export type WelcomeTemplateInput = {
  name: string;
  username: string;
  dashboardUrl: string;
};

export function renderWelcomeEmail(input: WelcomeTemplateInput): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Welcome to FYB Studio, @${input.username}`;

  const text = [
    `Hi ${input.name},`,
    ``,
    `Welcome to FYB Studio — your FYB week, designed like a brand.`,
    ``,
    `Your username is @${input.username}.`,
    `Open your dashboard: ${input.dashboardUrl}`,
    ``,
    `— The FYB Studio team`,
  ].join("\n");

  const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#fafafa;font-family:Inter,system-ui,sans-serif;color:#18181b;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0"
                 style="max-width:560px;background:#fff;border:1px solid #e4e4e7;border-radius:18px;padding:32px;">
            <tr>
              <td>
                <div style="font-size:13px;font-weight:600;color:#18181b;letter-spacing:-0.01em;">FYB Studio</div>
                <h1 style="margin:18px 0 8px;font-size:22px;font-weight:600;letter-spacing:-0.02em;">
                  Welcome, ${escapeHtml(input.name)}.
                </h1>
                <p style="margin:0;color:#52525b;font-size:14px;line-height:22px;">
                  You're in. Your username is
                  <strong style="color:#18181b;">@${escapeHtml(input.username)}</strong>.
                  Pick a template, add your details, export a sharp PNG.
                </p>
                <div style="margin-top:24px;">
                  <a href="${input.dashboardUrl}"
                     style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;
                            font-size:13px;font-weight:600;padding:12px 18px;border-radius:12px;">
                    Open dashboard
                  </a>
                </div>
                <p style="margin-top:28px;color:#71717a;font-size:12px;line-height:18px;">
                  Designed for your FYB week — sign-out tees, face caps, banners, and more.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim();

  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
