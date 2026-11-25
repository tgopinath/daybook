import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, body, route } from "@/lib/api";
import { createSession, throttle, verifyPassword } from "@/lib/auth";
import { isDemo } from "@/lib/demo-mode";
import { hasPassword } from "@/lib/google";
import { issueTicket } from "@/lib/two-factor";

const schema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) });

export const POST = route(
  async ({ req }) => {
    if (isDemo()) throw new ApiError(503, "Sign-in is unavailable on this preview because it has no database. Explore the demo instead.");
    const input = await body(req, schema);
    const ip = req.headers.get("x-forwarded-for") ?? "local";
    if (!throttle(`login:${ip}:${input.email}`, 8)) throw new ApiError(429, "Too many attempts. Try again in 15 minutes.");
    const user = await db.user.findUnique({ where: { email: input.email } });
    if (user?.googleId && !hasPassword(user.passwordHash)) throw new ApiError(400, "This account signs in with Google. Use Continue with Google.");
    // Same message for unknown email and wrong password.
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) throw new ApiError(401, "Incorrect email or password");
    // Two-step verification: no session yet, only a short-lived ticket for POST /api/auth/2fa.
    if (user.totpEnabledAt) {
      const ticket = await issueTicket(user.id);
      if (!ticket) throw new ApiError(500, "Two-step verification couldn't start. Try again.");
      return { twoFactor: true, ticket };
    }
    await createSession(user.id);
    return { ok: true };
  },
  { auth: false },
);
