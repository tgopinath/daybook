import { z } from "zod";
import { db } from "@/lib/db";
import { body, route } from "@/lib/api";

// Avatars are resized client-side to 256px; allow a generous ceiling for the data URL.
const avatar = z
  .string()
  .max(400_000, "Image is too large")
  .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, "Upload a PNG, JPEG or WebP image");

const schema = z.object({ name: z.string().trim().min(1, "Enter your name").max(80).optional(), avatarUrl: avatar.nullable().optional() }).strict();

export const PATCH = route(async ({ req, user }) => {
  const input = await body(req, schema);
  const updated = await db.user.update({ where: { id: user.id }, data: input, select: { id: true, email: true, name: true, avatarUrl: true, createdAt: true } });
  return { user: updated };
});
