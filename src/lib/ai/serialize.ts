import type { AIMessage } from "@prisma/client";
import type { ToolCallRecord, WireAIMessage } from "./types";

export function serializeMessage(m: AIMessage): WireAIMessage {
  return {
    id: m.id,
    role: m.role,
    content: m.content,
    toolCalls: Array.isArray(m.toolCalls) ? (m.toolCalls as unknown as ToolCallRecord[]).map(stripResult) : null,
    createdAt: m.createdAt.toISOString(),
  };
}

/** Read-only tool results can be large; the client only needs the label. */
function stripResult(c: ToolCallRecord): ToolCallRecord {
  if (!c.readOnly) return c;
  const { result: _result, ...rest } = c;
  return rest;
}
