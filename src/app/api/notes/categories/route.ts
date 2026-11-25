import { z } from "zod";
import { db } from "@/lib/db";
import { body, route } from "@/lib/api";

const schema = z.object({ name: z.string().trim().min(1, "Enter a name").max(40), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional() });

/** Create (or reuse) a note category. */
export const POST = route(async ({ req, user }) => {
  const input = await body(req, schema);
  const item = await db.category.upsert({
    where: { userId_name_kind: { userId: user.id, name: input.name, kind: "note" } },
    update: {},
    create: { userId: user.id, name: input.name, kind: "note", color: input.color ?? "#993399" },
    select: { id: true, name: true, color: true, kind: true },
  });
  return { item };
});
