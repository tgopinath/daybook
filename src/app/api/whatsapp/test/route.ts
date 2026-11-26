import { db } from "@/lib/db";
import { ApiError, route } from "@/lib/api";
import { throttle } from "@/lib/auth";
import { WhatsAppError, sendReminderMessage } from "@/lib/whatsapp";
import { assertWhatsAppAllowed } from "../_shared";

/** Sends a sample reminder to the verified number. */
export const POST = route(async ({ user }) => {
  assertWhatsAppAllowed(user);
  const s = await db.userSettings.findUnique({ where: { userId: user.id } });
  if (!s?.whatsappVerified || !s.whatsappNumber) throw new ApiError(400, "Verify your WhatsApp number first");
  if (!throttle(`wa-test:${user.id}`, 5, 60 * 60_000)) throw new ApiError(429, "Too many test messages. Try again later.");
  try {
    await sendReminderMessage(s.whatsappNumber, "Test reminder from My Diary", "WhatsApp reminders are working");
  } catch (err) {
    if (err instanceof WhatsAppError) throw new ApiError(502, err.message);
    throw err;
  }
  return { ok: true };
});
