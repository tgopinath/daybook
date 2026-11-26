import { ApiError, route } from "@/lib/api";
import { throttle } from "@/lib/auth";
import { emailCodeRequired, issueEmailCode } from "@/lib/email-code";
import { sendMail } from "@/lib/mailer";

const mask = (email: string) => email.replace(/^(.)(.*)(.@.*)$/, (_, a, mid: string, b) => a + "•".repeat(Math.min(mid.length, 6)) + b);

export const GET = route(async ({ user }) => ({ required: emailCodeRequired(user.email), to: mask(user.email) }));

/** Emails a 6-digit code that confirms account deletion. Valid for 10 minutes; the latest code wins. */
export const POST = route(async ({ user }) => {
  if (!emailCodeRequired(user.email)) return { required: false };
  if (!throttle(`delete-code:${user.id}`, 4, 10 * 60_000)) throw new ApiError(429, "Too many codes sent. Wait a few minutes and try again.");
  const code = await issueEmailCode(user.id, "delete");
  await sendMail({
    to: user.email,
    subject: `${code} is your My Diary account deletion code`,
    text: `Someone (hopefully you) asked to permanently delete your My Diary account.\n\nYour code: ${code}\n\nIt expires in 10 minutes. If you didn't ask for this, ignore this email and consider changing your password — your account stays as it is.`,
    html: `<div style="font-family:Lato,Arial,sans-serif;color:#2b2723;max-width:480px"><p>Someone (hopefully you) asked to <b>permanently delete</b> your My Diary account.</p><p style="font-size:28px;letter-spacing:6px;font-weight:700;color:#993399;margin:20px 0">${code}</p><p>It expires in 10 minutes. If you didn't ask for this, ignore this email and consider changing your password — your account stays as it is.</p></div>`,
  }).catch(() => {
    throw new ApiError(502, "Couldn't send the code. Try again in a moment.");
  });
  return { required: true, to: mask(user.email) };
});
