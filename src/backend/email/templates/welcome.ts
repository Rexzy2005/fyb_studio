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
  const preheader =
    "Your sign-out week, designed like a brand. Pick a template, drop your details, export a print-ready PNG in five minutes.";

  // Derive the logo URL from whichever absolute URL we already have. Email
  // clients can only load images served from public HTTPS hosts, so we
  // can't ship a base64 inline image at this size without bloating the
  // payload — pointing at /logo.jpg on our own origin is the cleanest
  // option, and it matches what users see on the rest of the site.
  const logoUrl = deriveOrigin(input.dashboardUrl) + "/logo.jpg";

  const text = [
    `Hi ${firstName},`,
    ``,
    `Welcome to FYB Studio. Your sign-out week, designed like a brand.`,
    ``,
    `Your username is @${input.username}.`,
    ``,
    `Open your dashboard:`,
    input.dashboardUrl,
    ``,
    `Browse templates:`,
    input.templatesUrl,
    ``,
    `Sign-out week 2026:`,
    `Mon - Corporate Day. Suit and tie.`,
    `Tue - Costume Day. Pick a character.`,
    `Wed - Old School Day. Throwback fits.`,
    `Thu - Cultural Day. Heritage on.`,
    `Fri - Jersey Day. Squad colours.`,
    `Sat - Party Night. Headline event.`,
    ``,
    `What's next:`,
    `1. Pick a template - sign-out flyer, FYB-week poster, or banner.`,
    `2. Drop your name, department, and details into the live preview.`,
    `3. Export a print-ready PNG. Yours to keep.`,
    ``,
    `- The FYB Studio team`,
  ].join("\n");

  const safeName = escapeHtml(firstName);
  const safeFullName = escapeHtml(input.name);
  const safeUsername = escapeHtml(input.username);
  const safeDashboardUrl = escapeAttr(input.dashboardUrl);
  const safeTemplatesUrl = escapeAttr(input.templatesUrl);
  const safeLogoUrl = escapeAttr(logoUrl);

  // Brand tokens — locked to inline values because email clients strip
  // <style>/<head> CSS aggressively. Picked to match the dark canvas +
  // gold accent palette the rest of the product uses.
  const C_CANVAS = "#050505";
  const C_SURFACE = "#0c0904";
  const C_SURFACE_2 = "#141004";
  const C_HAIRLINE = "rgba(255,215,0,0.18)";
  const C_HAIRLINE_SOFT = "rgba(255,255,255,0.06)";
  const C_INK = "#ffffff";
  const C_INK_MUTED = "rgba(255,255,255,0.62)";
  const C_INK_FAINT = "rgba(255,255,255,0.42)";
  const C_GOLD = "#FFD700";
  const C_GOLD_SOFT = "rgba(255,215,0,0.10)";
  const C_GOLD_BORDER = "rgba(255,215,0,0.35)";

  const FONT_STACK =
    "'Plus Jakarta Sans','Helvetica Neue',Arial,'Segoe UI',Roboto,sans-serif";
  const MONO_STACK = "'JetBrains Mono','SF Mono',Menlo,Consolas,monospace";

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="color-scheme" content="dark only">
  <meta name="supported-color-schemes" content="dark only">
  <title>Welcome to FYB Studio</title>
</head>
<body style="margin:0;padding:0;background:${C_CANVAS};font-family:${FONT_STACK};color:${C_INK};-webkit-font-smoothing:antialiased;">
  <!-- Hidden preheader for inbox snippet -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${C_CANVAS};">
    ${escapeHtml(preheader)}
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C_CANVAS};">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <!-- Card -->
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:linear-gradient(180deg,${C_SURFACE_2},${C_SURFACE});border:1px solid ${C_HAIRLINE};border-radius:24px;overflow:hidden;">

          <!-- Gold top accent stripe -->
          <tr>
            <td style="height:2px;background:linear-gradient(90deg,transparent,${C_GOLD},transparent);line-height:2px;font-size:0;">&nbsp;</td>
          </tr>

          <!-- Header: logo + wordmark -->
          <tr>
            <td style="padding:28px 32px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td valign="middle" style="width:44px;">
                    <img src="${safeLogoUrl}" width="40" height="40" alt="FYB"
                         style="display:block;width:40px;height:40px;border-radius:9px;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;" />
                  </td>
                  <td valign="middle" style="padding-left:12px;">
                    <div style="font-family:${FONT_STACK};font-size:18px;font-weight:700;letter-spacing:-0.02em;color:${C_INK};line-height:1;">studio</div>
                    <div style="font-family:${MONO_STACK};font-size:9px;letter-spacing:0.24em;text-transform:uppercase;color:${C_GOLD};margin-top:4px;font-weight:700;">Class of 2026 · Live</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Eyebrow + headline + intro -->
          <tr>
            <td style="padding:32px 32px 8px;">
              <span style="display:inline-block;background:${C_GOLD_SOFT};color:${C_GOLD};font-family:${MONO_STACK};font-size:10px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;padding:6px 12px;border-radius:999px;border:1px solid ${C_GOLD_BORDER};">
                The studio is open
              </span>
              <h1 style="margin:18px 0 12px;font-family:${FONT_STACK};font-size:30px;line-height:1.1;font-weight:800;letter-spacing:-0.025em;color:${C_INK};">
                Welcome, ${safeName}.
              </h1>
              <p style="margin:0;color:${C_INK_MUTED};font-family:${FONT_STACK};font-size:15px;line-height:1.6;">
                You're set up as <strong style="color:${C_GOLD};font-weight:600;">@${safeUsername}</strong>. Designer-built FYB templates - pick one, drop your details, walk away with a
                <span style="color:${C_GOLD};font-weight:600;">print-ready PNG in five minutes</span>
                for &#8358;1,000 flat.
              </p>
            </td>
          </tr>

          <!-- CTAs -->
          <tr>
            <td style="padding:24px 32px 8px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:${C_GOLD};border-radius:12px;box-shadow:0 8px 22px rgba(255,180,0,0.35);">
                    <a href="${safeDashboardUrl}" target="_blank" rel="noopener"
                       style="display:inline-block;font-family:${MONO_STACK};font-size:12px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#000;text-decoration:none;padding:16px 26px;border-radius:12px;line-height:1;">
                      Open my dashboard
                    </a>
                  </td>
                  <td style="width:10px;line-height:10px;font-size:0;">&nbsp;</td>
                  <td style="background:transparent;border:1px solid ${C_GOLD_BORDER};border-radius:12px;">
                    <a href="${safeTemplatesUrl}" target="_blank" rel="noopener"
                       style="display:inline-block;font-family:${MONO_STACK};font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${C_GOLD};text-decoration:none;padding:16px 22px;border-radius:12px;line-height:1;">
                      Browse templates
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- What's next -->
          <tr>
            <td style="padding:36px 32px 8px;">
              <div style="font-family:${MONO_STACK};font-size:10px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:${C_GOLD};margin-bottom:14px;">
                <span style="display:inline-block;width:18px;height:1px;background:${C_GOLD};vertical-align:middle;opacity:0.6;"></span>
                &nbsp;Three steps in
              </div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                ${stepRow("01", "Pick a vibe", "Sign-out flyers, FYB-week posters, dept banners. Designer-built so you don't have to start from scratch.")}
                <tr><td style="height:8px;line-height:8px;font-size:8px;">&nbsp;</td></tr>
                ${stepRow("02", "Drop your details", "Name, department, shout-outs, photo. Live preview as you type - no surprises.")}
                <tr><td style="height:8px;line-height:8px;font-size:8px;">&nbsp;</td></tr>
                ${stepRow("03", "Export print-ready PNG", "5-minute export. Yours to keep on your dashboard, free to re-download for 24 hours.")}
              </table>
            </td>
          </tr>

          <!-- Sign-out week teaser -->
          <tr>
            <td style="padding:24px 32px 32px;">
              <div style="font-family:${MONO_STACK};font-size:10px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:${C_GOLD};margin-bottom:14px;">
                <span style="display:inline-block;width:18px;height:1px;background:${C_GOLD};vertical-align:middle;opacity:0.6;"></span>
                &nbsp;Seven days, one ceremony
              </div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(140deg,rgba(255,215,0,0.10),rgba(255,140,66,0.04));border:1px solid ${C_GOLD_BORDER};border-radius:14px;">
                <tr>
                  <td style="padding:18px 20px;">
                    <div style="font-family:${FONT_STACK};font-size:16px;font-weight:800;color:${C_INK};letter-spacing:-0.02em;margin-bottom:10px;">
                      Sign-out week 2026
                    </div>
                    ${weekRow("Mon", "Corporate Day", "Suit &amp; tie")}
                    ${weekRow("Tue", "Costume Day", "Pick a character")}
                    ${weekRow("Wed", "Old School Day", "Throwback fits")}
                    ${weekRow("Thu", "Cultural Day", "Heritage on")}
                    ${weekRow("Fri", "Jersey Day", "Squad colours")}
                    ${weekRow("Sat", "Party Night", "Headline event")}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer / trust -->
          <tr>
            <td style="padding:0 32px 28px;">
              <div style="border-top:1px solid ${C_HAIRLINE_SOFT};padding-top:18px;font-family:${FONT_STACK};font-size:12px;color:${C_INK_FAINT};line-height:1.6;">
                You're getting this because you just signed up to FYB Studio as
                <strong style="color:${C_INK_MUTED};font-weight:600;">${safeFullName}</strong>.
                If this wasn't you, ignore this email - your account stays inert until you sign in with Google.
              </div>
            </td>
          </tr>
        </table>

        <!-- Outer footer -->
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
          <tr>
            <td align="center" style="padding:18px 12px 4px;">
              <div style="font-family:${MONO_STACK};font-size:9px;letter-spacing:0.24em;text-transform:uppercase;color:${C_GOLD};opacity:0.85;font-weight:700;">
                FYB Studio
              </div>
              <div style="font-family:${FONT_STACK};font-size:11px;color:${C_INK_FAINT};line-height:1.5;margin-top:6px;">
                Designer-built templates for Nigerian final-year students.
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html, text };
}

function stepRow(num: string, title: string, body: string): string {
  // Brand tokens are duplicated inline because the surrounding HTML uses
  // them too — keeping them in one place per row keeps the diff small.
  const C_SURFACE_2 = "#141004";
  const C_HAIRLINE = "rgba(255,215,0,0.14)";
  const C_INK = "#ffffff";
  const C_INK_MUTED = "rgba(255,255,255,0.62)";
  const C_GOLD = "#FFD700";
  const FONT_STACK =
    "'Plus Jakarta Sans','Helvetica Neue',Arial,'Segoe UI',Roboto,sans-serif";
  const MONO_STACK = "'JetBrains Mono','SF Mono',Menlo,Consolas,monospace";
  return `<tr>
    <td>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C_SURFACE_2};border:1px solid ${C_HAIRLINE};border-radius:14px;">
        <tr>
          <td valign="top" style="padding:16px 18px;width:48px;">
            <div style="width:34px;height:34px;border-radius:10px;background:radial-gradient(circle at 30% 30%,${C_GOLD},#FFB400);color:#0a0a0a;font-family:${MONO_STACK};font-size:13px;font-weight:800;text-align:center;line-height:34px;letter-spacing:0.04em;">${escapeHtml(num)}</div>
          </td>
          <td valign="top" style="padding:16px 18px 16px 0;">
            <div style="font-family:${FONT_STACK};font-size:15px;font-weight:700;color:${C_INK};line-height:1.3;letter-spacing:-0.01em;">${escapeHtml(title)}</div>
            <div style="font-family:${FONT_STACK};font-size:13px;color:${C_INK_MUTED};line-height:1.55;margin-top:4px;">${escapeHtml(body)}</div>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

function weekRow(day: string, title: string, vibe: string): string {
  const C_INK = "#ffffff";
  const C_INK_MUTED = "rgba(255,255,255,0.6)";
  const C_GOLD = "#FFD700";
  const FONT_STACK =
    "'Plus Jakarta Sans','Helvetica Neue',Arial,'Segoe UI',Roboto,sans-serif";
  const MONO_STACK = "'JetBrains Mono','SF Mono',Menlo,Consolas,monospace";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px;">
    <tr>
      <td style="width:54px;font-family:${MONO_STACK};font-size:10px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:${C_GOLD};vertical-align:middle;">
        ${escapeHtml(day)}
      </td>
      <td style="font-family:${FONT_STACK};font-size:13px;font-weight:600;color:${C_INK};vertical-align:middle;">
        ${escapeHtml(title)}
      </td>
      <td align="right" style="font-family:${FONT_STACK};font-size:11px;color:${C_INK_MUTED};vertical-align:middle;">
        ${vibe}
      </td>
    </tr>
  </table>`;
}

/**
 * Pull just the protocol + host from a full URL. Used to build the logo
 * URL so it lives on the same origin as the dashboard link. Falls back
 * to a sensible default if the input can't be parsed (e.g. local testing
 * with non-URL placeholders).
 */
function deriveOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "https://fybstudio.art";
  }
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
