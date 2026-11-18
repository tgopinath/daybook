import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { ApiError, body, notFound, route, tzOf } from "@/lib/api";
import { db } from "@/lib/db";
import { executeWriteTool, validateToolInput } from "@/lib/ai/tools";
import { serializeMessage } from "@/lib/ai/serialize";
import { describeToolCall } from "@/lib/ai/describe";
import type { ToolCallRecord } from "@/lib/ai/types";

export const dynamic = "force-dynamic";

const schema = z.object({
  messageId: z.string().min(1).max(64),
  toolCallId: z.string().min(1).max(128),
  decision: z.enum(["confirm", "reject"]),
  input: z.record(z.unknown()).optional(),
});

export const POST = route(async ({ req, user }) => {
  const { messageId, toolCallId, decision, input } = await body(req, schema);
  const tz = tzOf(req);
  const message = await db.aIMessage.findFirst({ where: { id: messageId, conversation: { userId: user.id } } });
  if (!message) throw notFound("Message");
  const calls = (Array.isArray(message.toolCalls) ? message.toolCalls : []) as unknown as ToolCallRecord[];
  const call = calls.find((c) => c.id === toolCallId);
  if (!call) throw notFound("Proposed action");
  if (call.readOnly) throw new ApiError(400, "That action doesn't need confirmation");
  if (call.status !== "pending") throw new ApiError(409, `This action was already ${call.status === "done" ? "applied" : call.status}`);

  let followUp: string;
  if (decision === "reject") {
    call.status = "rejected";
    const d = describeToolCall(call.name, call.input, call.context);
    followUp = `Dismissed: ${d.label.toLowerCase()} “${d.primary}”.`;
  } else {
    // Edited fields from the card override the model's proposal, then everything is re-validated.
    const finalInput = input ? { ...call.input, ...input } : call.input;
    validateToolInput(call.name, finalInput);
    // Errors (e.g. a time in the past) leave the card pending so the user can edit and retry.
    const outcome = await executeWriteTool(call.name, finalInput, { userId: user.id, tz });
    call.input = finalInput;
    call.status = "done";
    call.result = outcome.result;
    call.summary = outcome.summary;
    call.link = outcome.link;
    followUp = `${outcome.summary ?? "Done"}.`;
  }

  const [updated, note] = await db.$transaction([
    db.aIMessage.update({ where: { id: message.id }, data: { toolCalls: calls as unknown as Prisma.InputJsonValue } }),
    db.aIMessage.create({ data: { conversationId: message.conversationId, role: "TOOL", content: followUp } }),
    db.aIConversation.update({ where: { id: message.conversationId }, data: { updatedAt: new Date() } }),
  ]);
  return { message: serializeMessage(updated), followUp: serializeMessage(note), toolCall: call };
});
