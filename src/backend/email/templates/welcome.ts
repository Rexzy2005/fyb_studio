export type WelcomeTemplateInput = {
  name: string;
  username: string;
  dashboardUrl: string;
  templatesUrl: string;
};

export function renderWelcomeEmail(input: WelcomeTemplateInput): {
  subject: string;
  html: string;
  text: string;
} {
  const firstName = input.name.split(/\s+/)[0] || input.name;
  const subject = `Welcome to FYB Studio, @${input.username}`;
  const preheader = "Your FYB week, designed like a brand. Pick a template and export a sharp PNG.";

  const text = [
    `Hi ${firstName},`,
    ``,
    `Welcome to FYB Studio — your FYB week, designed like a brand.`,
    ``,
    `Your username is @${input.username}.`,
    ``,
    `Open your dashboard:`,
    input.dashboardUrl,
    ``,
    `Browse templates:`,
    input.templatesUrl,
    ``,
    `What's next:`,
    `1. Pick a template — sign-out tee, face cap, poster, or banner.`,
    `2. Add your name, department, and details.`,
    `3. Export a high-quality PNG you can print or share.`,
    ``,
    `— The FYB Studio team`,
  ].join("\n");

  const safeName = escapeHtml(firstName);
  const safeFullName = escapeHtml(input.name);
  const safeUsername = escapeHtml(input.username);
  const safeDashboardUrl = escapeAttr(input.dashboardUrl);
  const safeTemplatesUrl = escapeAttr(input.templatesUrl);

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
  <title>Welcome to FYB Studio</title>
</head>
<body style="margin:0;padding:0;background:#fafafa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#0a0a0a;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#fafafa;">
    ${escapeHtml(preheader)}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fafafa;">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e4e4e7;border-radius:24px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,0.04);">

          <tr>
            <td style="padding:28px 32px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="middle" style="width:48px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="width:40px;height:40px;background:#0a0a0a;border-radius:14px;text-align:center;vertical-align:middle;">
                          <div style="width:14px;height:14px;background:#10b981;border-radius:999px;display:inline-block;margin-top:13px;"></div>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td valign="middle" style="padding-left:12px;">
                    <div style="font-size:14px;font-weight:700;letter-spacing:-0.01em;color:#0a0a0a;">FYB Studio</div>
                    <div style="font-size:11px;color:#71717a;margin-top:2px;">Design your sign-out. Print it. Post it.</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:32px 32px 8px;">
              <span style="display:inline-block;background:#ecfdf5;color:#047857;font-size:11px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;padding:6px 12px;border-radius:999px;border:1px solid #a7f3d0;">
                Account ready
              </span>
              <h1 style="margin:18px 0 10px;font-size:28px;line-height:34px;font-weight:700;letter-spacing:-0.02em;color:#0a0a0a;">
                Welcome, ${safeName}.
              </h1>
              <p style="margin:0;color:#52525b;font-size:15px;line-height:24px;">
                You're set up as <strong style="color:#0a0a0a;font-weight:600;">@${safeUsername}</strong>.
                Pick a template, personalize your details, and export a sharp PNG that's ready to print or post.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:24px 32px 8px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:#0a0a0a;border-radius:14px;">
                    <a href="${safeDashboardUrl}" target="_blank" rel="noopener"
                       style="display:inline-block;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:14px;line-height:1;">
                      Open my dashboard →
                    </a>
                  </td>
                  <td style="width:10px;"></td>
                  <td style="background:#ffffff;border:1px solid #e4e4e7;border-radius:14px;">
                    <a href="${safeTemplatesUrl}" target="_blank" rel="noopener"
                       style="display:inline-block;font-size:14px;font-weight:600;color:#0a0a0a;text-decoration:none;padding:14px 22px;border-radius:14px;line-height:1;">
                      Browse templates
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:32px;">
              <div style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#71717a;margin-bottom:12px;">
                What's next
              </div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${stepRow("1", "Pick a vibe", "Sign-out tees, face caps, “Face of the Finalist” posters, department banners.")}
                <tr><td style="height:8px;line-height:8px;font-size:8px;">&nbsp;</td></tr>
                ${stepRow("2", "Add your details", "Name, department, shout-outs, photos. Live preview as you type.")}
                <tr><td style="height:8px;line-height:8px;font-size:8px;">&nbsp;</td></tr>
                ${stepRow("3", "Export PNG", "Print-ready or social-ready. Yours to keep on your dashboard for 24 hours.")}
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:0 32px 28px;">
              <div style="border-top:1px solid #e4e4e7;padding-top:18px;font-size:12px;color:#71717a;line-height:18px;">
                You're getting this because you just signed up to FYB Studio as
                <strong style="color:#52525b;font-weight:600;">${safeFullName}</strong>.
                If this wasn't you, you can ignore this email — your account won't be activated for sign-in without your Google login.
              </div>
            </td>
          </tr>
        </table>

        <div style="margin-top:18px;font-size:11px;color:#a1a1aa;line-height:16px;">
          FYB Studio · Designed for Nigerian final-year students
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}

function stepRow(num: string, title: string, body: string): string {
  return `<tr>
    <td>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fafafa;border:1px solid #e4e4e7;border-radius:14px;">
        <tr>
          <td valign="top" style="padding:14px 16px;width:36px;">
            <div style="width:28px;height:28px;border-radius:10px;background:#0a0a0a;color:#ffffff;font-size:12px;font-weight:700;text-align:center;line-height:28px;">${escapeHtml(num)}</div>
          </td>
          <td valign="top" style="padding:14px 16px 14px 0;">
            <div style="font-size:14px;font-weight:600;color:#0a0a0a;line-height:20px;">${escapeHtml(title)}</div>
            <div style="font-size:12px;color:#52525b;line-height:18px;margin-top:2px;">${escapeHtml(body)}</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}
