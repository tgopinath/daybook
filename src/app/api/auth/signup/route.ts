import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError, body, route } from "@/lib/api";
import { createSession, hashPassword, throttle } from "@/lib/auth";
import { seedDemoData } from "@/lib/demo";
import { isValidTz } from "@/lib/time";

const schema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(8, "Use at least 8 characters").max(200),
  timezone: z.string().optional(),
  withDemo: z.boolean().default(true),
});

export const POST = route(
  async ({ req }) => {
    const ip = req.headers.get("x-forwarded-for") ?? "local";
    if (!throttle(`signup:${ip}`, 10)) throw new ApiError(429, "Too many attempts. Try again later.");
    const input = await body(req, schema);
    const exists = await db.user.findUnique({ where: { email: input.email } });
    if (exists) throw new ApiError(409, "An account with this email already exists");
    const user = await db.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash: await hashPassword(input.password),
        settings: { create: { timezone: input.timezone && isValidTz(input.timezone) ? input.timezone : "UTC" } },
      },
    });
    if (input.withDemo) await seedDemoData(user.id, input.timezone && isValidTz(input.timezone) ? input.timezone : "UTC");
    await createSession(user.id);
    return { ok: true };
  },
  { auth: false },
);
