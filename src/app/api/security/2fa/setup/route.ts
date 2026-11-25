import { z } from "zod";
import QRCode from "qrcode";
import { ApiError, body, route } from "@/lib/api";
import { startSetup } from "@/lib/two-factor";
import { formatSecret } from "@/lib/totp";
import { assertNotDemo, assertThrottle, confirmPassword } from "../../guard";

const schema = z.object({ password: z.string().max(200).optional() });

/**
 * Starts two-step verification setup: a new secret (stored encrypted, pending until confirmed with a code).
 * Accounts with a password confirm it first, so a borrowed session can't tie the account to someone else's phone.
 * The secret is returned only here, once, for the QR code and manual entry.
 */
export const POST = route(async ({ req, user }) => {
  assertNotDemo(user.email);
  assertThrottle(`2fa-setup:${user.id}`, 10);
  const input = await body(req, schema);
  await confirmPassword(user.id, input.password, { required: true });
  const setup = await startSetup(user.id, user.email);
  if (!setup) throw new ApiError(409, "Two-step verification is already on");
  const qr = await QRCode.toDataURL(setup.uri, { errorCorrectionLevel: "M", margin: 1, width: 240, color: { dark: "#000000", light: "#ffffff" } });
  return new Response(JSON.stringify({ uri: setup.uri, qr, secret: formatSecret(setup.secret) }), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
});
