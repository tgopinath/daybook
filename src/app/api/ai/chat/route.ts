import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { body, notFound, route, tzOf } from "@/lib/api";
import { db } from "@/lib/db";
import { requireAI } from "@/lib/ai/provider";
import { historyFromRows, runAssistant } from "@/lib/ai/assistant";
import { serializeMessage } from "@/lib/ai/serialize";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const schema = z.object({
  conversationId: z.string().max(64).nullish(),
  message: z.string().trim().min(1, "Type a message").max(4000),
});

function titleFrom(message: string) {
  const t = message.replace(/\s+/g, " ").trim();
  return t.length > 60 ? `${t.slice(0, 57)}…` : t;
}

export const POST = route(async ({ req, user }) => {
  const input = await body(req, schema);
  // Fail before persisting anything when no key is configured.
  requireAI(user.id);
  const tz = tzOf(req);

  let conversation = input.conversationId
    ? await db.aIConversation.findFirst({ where: { id: input.conversationId, userId: user.id } })
    : null;
  if (input.conversationId && !conversation) throw notFound("Conversation");
  const created = !conversation;
  if (!conversation) conversation = await db.aIConversation.create({ data: { userId: user.id, title: titleFrom(input.message) } });

  const userMessage = await db.aIMessage.create({ data: { conversationId: conversation.id, role: "USER", content: input.message } });
  const rows = await db.aIMessage.findMany({
    where: { conversationId: conversation.id },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { role: true, content: true, toolCalls: true },
  });

  try {
    const turn = await runAssistant({ userId: user.id, tz, history: historyFromRows(rows.reverse()) });
    const message = await db.aIMessage.create({
      data: {
        conversationId: conversation.id,
        role: "ASSISTANT",
        content: turn.text,
        toolCalls: turn.toolCalls.length ? (turn.toolCalls as unknown as Prisma.InputJsonValue) : undefined,
      },
    });
    await db.aIConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
    return { conversationId: conversation.id, conversation: { id: conversation.id, title: conversation.title }, userMessage: serializeMessage(userMessage), message: serializeMessage(message) };
  } catch (err) {
    // Don't leave a dangling question behind a failed provider call.
    await db.aIMessage.delete({ where: { id: userMessage.id } }).catch(() => {});
    if (created) await db.aIConversation.delete({ where: { id: conversation.id } }).catch(() => {});
    throw err;
  }
});
