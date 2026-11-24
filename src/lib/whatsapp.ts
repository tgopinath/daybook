import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "crypto";
import { secret } from "./secrets";

// WhatsApp reminders through Meta's WhatsApp Cloud API (Graph API).
// Business-initiated messages must use templates that Meta has approved:
//   - WHATSAPP_REMINDER_TEMPLATE (Utility):  body with {{1}} = reminder title, {{2}} = time / details
//   - WHATSAPP_VERIFY_TEMPLATE (Authentication): one-time code with a "Copy code" button
// See README → "WhatsApp reminders" for the setup.

const GRAPH = "https://graph.facebook.com/v21.0";

export function whatsappConfig() {
  const token = process.env.WHATSAPP_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!token || !phoneNumberId) return null;
  return {
    token,
    phoneNumberId,
    reminderTemplate: process.env.WHATSAPP_REMINDER_TEMPLATE?.trim() || "mydiary_reminder",
    verifyTemplate: process.env.WHATSAPP_VERIFY_TEMPLATE?.trim() || "mydiary_verify",
    lang: process.env.WHATSAPP_TEMPLATE_LANG?.trim() || "en",
  };
}

export const whatsappConfigured = () => whatsappConfig() !== null;

/** Most WhatsApp messages a user can receive per rolling 24 hours (cost and spam guard). */
export const DAILY_CAP = 40;

/**
 * Normalises a phone number to E.164 digits without "+", or null.
 * Requires the country code: "+91 98765 43210" → "919876543210".
 */
export function normalizeNumber(input: string): string | null {
  const trimmed = input.trim();
  if (!/^(\+|00)/.test(trimmed)) return null;
  const digits = trimmed.replace(/^00/, "").replace(/\D/g, "");
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

/** "919876543210" → "+91 ••••• 43210" for display. */
export function maskNumber(digits: string) {
  return `+${digits.slice(0, Math.max(1, digits.length - 10))} ••••• ${digits.slice(-5)}`;
}

/** Template parameters can't contain newlines, tabs or more than 4 spaces in a row, and are capped in length. */
export function templateText(s: string, max = 200) {
  const clean = s.replace(/[\n\r\t]+/g, " ").replace(/ {2,}/g, " ").trim();
  return (clean || "-").slice(0, max);
}

export class WhatsAppError extends Error {
  constructor(
    message: string,
    public code?: number,
  ) {
    super(message);
  }
}

type Component = { type: "body" | "button"; sub_type?: "url"; index?: string; parameters: { type: "text"; text: string }[] };

async function sendTemplate(to: string, template: string, components: Component[]) {
  const cfg = whatsappConfig();
  if (!cfg) throw new WhatsAppError("WhatsApp isn't set up on this server");
  const res = await fetch(`${GRAPH}/${cfg.phoneNumberId}/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${cfg.token}`, "content-type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "template", template: { name: template, language: { code: cfg.lang }, components } }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string; code?: number } };
  if (!res.ok || !json.messages?.[0]) {
    const code = json.error?.code;
    console.error("[whatsapp] send failed", res.status, code, json.error?.message);
    // Friendly messages for the errors people actually hit.
    if (code === 131026) throw new WhatsAppError("That number can't receive WhatsApp messages. Check it's on WhatsApp.", code);
    if (code === 132001) throw new WhatsAppError("The WhatsApp message template isn't approved yet.", code);
    if (code === 190) throw new WhatsAppError("The WhatsApp access token has expired. Update WHATSAPP_TOKEN.", code);
    if (code === 131030) throw new WhatsAppError("This number isn't on the test recipient list in Meta yet.", code);
    throw new WhatsAppError("WhatsApp didn't accept the message. Try again later.", code);
  }
  return json.messages[0].id;
}

/** Sends a reminder: {{1}} title, {{2}} when/details. */
export function sendReminderMessage(to: string, title: string, detail: string) {
  const cfg = whatsappConfig();
  return sendTemplate(to, cfg?.reminderTemplate ?? "", [{ type: "body", parameters: [{ type: "text", text: templateText(title, 120) }, { type: "text", text: templateText(detail, 200) }] }]);
}

/** Sends a one-time code with Meta's authentication template ("Copy code" button). */
export function sendVerificationCode(to: string, code: string) {
  const cfg = whatsappConfig();
  return sendTemplate(to, cfg?.verifyTemplate ?? "", [
    { type: "body", parameters: [{ type: "text", text: code }] },
    { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] },
  ]);
}

export const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

/** HMAC of a code bound to the user and number, so a code can't be reused elsewhere. */
export function hashCode(userId: string, number: string, code: string) {
  const key = secret("AUTH_SECRET");
  if (!key) throw new Error("AUTH_SECRET is not set");
  return createHmac("sha256", key).update(`whatsapp:${userId}:${number}:${code}`).digest("hex");
}

export function codeMatches(expectedHash: string, userId: string, number: string, code: string) {
  const got = Buffer.from(hashCode(userId, number, code));
  const want = Buffer.from(expectedHash);
  return got.length === want.length && timingSafeEqual(got, want);
}
