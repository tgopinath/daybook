import { createHmac, randomInt, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { secret as envSecret } from "@/lib/secrets";
import { isDemoEmail } from "@/lib/demo-mode";
import { mailConfigured } from "@/lib/mailer";

// One-time email codes for sensitive actions (account deletion). The code itself is only emailed;
// a signed, httpOnly cookie holds its HMAC and expiry, so nothing is stored in the database.

const TTL_MS = 10 * 60_000;
const cookieName = (purpose: string) => `md_code_${purpose}`;

function sign(data: string) {
  const s = envSecret("AUTH_SECRET");
  if (!s) throw new Error("AUTH_SECRET is not set");
  return createHmac("sha256", s).update(`email-code\u0000${data}`).digest("hex");
}

/** Creates a 6-digit code for this user and purpose, sets its cookie and returns the code to email. */
export async function issueEmailCode(userId: string, purpose: string) {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const exp = Date.now() + TTL_MS;
  const mac = sign(`${purpose}:${userId}:${exp}:${code}`);
  (await cookies()).set(cookieName(purpose), `${exp}.${mac}`, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/account", maxAge: TTL_MS / 1000 });
  return code;
}

/** True when `code` matches the latest code sent for this purpose and hasn't expired. Clears it on success. */
export async function checkEmailCode(userId: string, purpose: string, code: string) {
  const jar = await cookies();
  const raw = jar.get(cookieName(purpose))?.value ?? "";
  const [expStr, mac] = raw.split(".");
  const exp = Number(expStr);
  if (!mac || !Number.isFinite(exp) || exp < Date.now() || !/^\d{6}$/.test(code)) return false;
  const want = Buffer.from(sign(`${purpose}:${userId}:${exp}:${code}`));
  const got = Buffer.from(mac);
  const ok = want.length === got.length && timingSafeEqual(want, got);
  if (ok) jar.delete({ name: cookieName(purpose), path: "/api/account" });
  return ok;
}

/** Whether a sensitive action needs an emailed code: email is set up (always in development) and it isn't a demo account. */
export const emailCodeRequired = (email: string) => (mailConfigured() || process.env.NODE_ENV !== "production") && !isDemoEmail(email);
