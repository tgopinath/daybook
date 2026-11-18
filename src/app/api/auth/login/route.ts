import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, body, route } from "@/lib/api";
import { createSession, throttle, verifyPassword } from "@/lib/auth";

const schema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) });

export const POST = route(
  async ({ req }) => {
    const input = await body(req, schema);
    const ip = req.headers.get("x-forwarded-for") ?? "local";
    if (!throttle(`login:${ip}:${input.email}`, 8)) throw new ApiError(429, "Too many attempts. Try again in 15 minutes.");
    const user = await db.user.findUnique({ where: { email: input.email } });
    // Same message for unknown email and wrong password.
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) throw new ApiError(401, "Incorrect email or password");
    await createSession(user.id);
    return { ok: true };
  },
  { auth: false },
);
