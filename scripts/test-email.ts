import { getEmailFrom, getMailTransport } from "@/backend/email/transport";
import { renderWelcomeEmail } from "@/backend/email/templates/welcome";

async function main() {
  const to = process.argv[2];
  if (!to || !to.includes("@")) {
    console.error("Usage: tsx scripts/test-email.ts <recipient-email>");
    process.exit(2);
  }

  const pass = process.env.SMTP_PASS ?? "";
  const passNoSpaces = pass.replace(/\s+/g, "");
  const passFingerprint = pass.length >= 4
    ? `${pass.slice(0, 2)}…${pass.slice(-2)}`
    : "(too short)";

  console.log("[test-email] env summary:");
  console.log("  SMTP_HOST:", process.env.SMTP_HOST);
  console.log("  SMTP_PORT:", process.env.SMTP_PORT);
  console.log("  SMTP_USER:", process.env.SMTP_USER);
  console.log("  SMTP_PASS length:", pass.length, "(no spaces:", passNoSpaces.length + ")");
  console.log("  SMTP_PASS fingerprint:", passFingerprint);
  console.log("  EMAIL_FROM:", process.env.EMAIL_FROM);
  console.log("");

  const transport = getMailTransport();
  if (!transport) {
    console.error(
      "[test-email] transport is null - one of SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS is missing or env failed to load."
    );
    process.exit(1);
  }

  console.log("[test-email] verifying SMTP connection…");
  try {
    await transport.verify();
    console.log("[test-email] ✓ SMTP connection + auth succeeded");
  } catch (err) {
    console.error("[test-email] ✗ SMTP verify failed:");
    console.error(err);
    process.exit(1);
  }

  const { subject, html, text } = renderWelcomeEmail({
    name: "Test User",
    username: "testuser",
    dashboardUrl: "http://localhost:3000/dashboard",
    templatesUrl: "http://localhost:3000/templates",
  });

  console.log("[test-email] sending test email to", to, "…");
  try {
    const info = await transport.sendMail({
      from: getEmailFrom(),
      to,
      subject: `[TEST] ${subject}`,
      html,
      text,
    });
    console.log("[test-email] ✓ sent:");
    console.log("  messageId:", info.messageId);
    console.log("  accepted:", info.accepted);
    console.log("  rejected:", info.rejected);
    console.log("  response:", info.response);
  } catch (err) {
    console.error("[test-email] ✗ sendMail failed:");
    console.error(err);
    process.exit(1);
  }

  process.exit(0);
}

main();
