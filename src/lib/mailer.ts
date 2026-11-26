// Transactional email (verification codes). Sends through Resend's HTTP API when RESEND_API_KEY is set;
// MAIL_FROM picks the sender (defaults to Resend's shared onboarding address, which can only mail the
// Resend account's own email until a domain is verified there).

export const mailConfigured = () => !!process.env.RESEND_API_KEY;

export async function sendMail({ to, subject, text, html }: { to: string; subject: string; text: string; html?: string }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[mail] (not configured, dev only) to=${to} subject=${subject}\n${text}`);
      return;
    }
    throw new Error("Email isn't set up");
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from: process.env.MAIL_FROM || "My Diary <onboarding@resend.dev>", to: [to], subject, text, html }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    console.error("[mail] send failed", res.status, await res.text().catch(() => ""));
    throw new Error("Couldn't send the email");
  }
}
