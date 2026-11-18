import { z } from "zod";
import { body, notFound, route } from "@/lib/api";
import { db } from "@/lib/db";
import { serializeMessage } from "@/lib/ai/serialize";

export const dynamic = "force-dynamic";

type P = { id: string };

async function own(userId: string, id: string) {
  const c = await db.aIConversation.findFirst({ where: { id, userId } });
  if (!c) throw notFound("Conversation");
  return c;
}

export const GET = route<P>(async ({ user, params }) => {
  const c = await own(user.id, params.id);
  const messages = await db.aIMessage.findMany({ where: { conversationId: c.id }, orderBy: { createdAt: "asc" }, take: 500 });
  return {
    conversation: { id: c.id, title: c.title, createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString() },
    messages: messages.map(serializeMessage),
  };
});

export const PATCH = route<P>(async ({ req, user, params }) => {
  const { title } = await body(req, z.object({ title: z.string().trim().min(1, "Title is required").max(120) }));
  const c = await own(user.id, params.id);
  const updated = await db.aIConversation.update({ where: { id: c.id }, data: { title } });
  return { conversation: { id: updated.id, title: updated.title } };
});

export const DELETE = route<P>(async ({ user, params }) => {
  const c = await own(user.id, params.id);
  await db.aIConversation.delete({ where: { id: c.id } });
  return { ok: true };
});
