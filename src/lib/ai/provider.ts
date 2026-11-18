import "server-only";
import Anthropic, { APIError as AnthropicAPIError } from "@anthropic-ai/sdk";
import { ApiError } from "@/lib/api";
import { NOT_CONFIGURED_MESSAGE, type AIStatus } from "./types";

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

export type ProviderName = "anthropic" | "openai";

const DEFAULT_MODELS: Record<ProviderName, string> = { anthropic: "claude-sonnet-5", openai: "gpt-4.1" };

interface ProviderConfig {
  provider: ProviderName;
  model: string;
  apiKey: string | null;
}

export function aiConfig(): ProviderConfig {
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim() || null;
  const openaiKey = process.env.OPENAI_API_KEY?.trim() || null;
  const wanted = (process.env.AI_PROVIDER?.trim().toLowerCase() || "") as ProviderName | "";
  let provider: ProviderName = wanted === "openai" ? "openai" : "anthropic";
  // If the preferred provider has no key but the other one does, use the one that works.
  if (provider === "anthropic" && !anthropicKey && openaiKey) provider = "openai";
  else if (provider === "openai" && !openaiKey && anthropicKey) provider = "anthropic";
  const override = process.env.AI_MODEL?.trim();
  // Ignore an override meant for the other provider (e.g. AI_MODEL=claude-… with OpenAI).
  const overrideFits = override && (provider === "anthropic" ? /^claude/i.test(override) : !/^claude/i.test(override));
  const model = overrideFits ? override! : DEFAULT_MODELS[provider];
  return { provider, model, apiKey: provider === "anthropic" ? anthropicKey : openaiKey };
}

export function aiStatus(): AIStatus {
  const c = aiConfig();
  return { configured: !!c.apiKey, provider: c.provider, model: c.model, ...(c.apiKey ? {} : { message: NOT_CONFIGURED_MESSAGE }) };
}

/*
 * Rate limits for model calls, so a public deployment can't run up the key's bill.
 * Per user: AI_RATE_LIMIT_PER_HOUR (default 30). Per server instance: AI_DAILY_LIMIT (default 500).
 * In-memory per process, like the auth throttle; use a shared store (Redis) across many instances.
 */
const PER_USER_PER_HOUR = Number(process.env.AI_RATE_LIMIT_PER_HOUR) || 30;
const PER_INSTANCE_PER_DAY = Number(process.env.AI_DAILY_LIMIT) || 500;
const userCalls = new Map<string, { count: number; resetAt: number }>();
let instanceCalls = { count: 0, resetAt: 0 };

function spend(bucket: { count: number; resetAt: number } | undefined, windowMs: number, limit: number) {
  const now = Date.now();
  const b = !bucket || bucket.resetAt < now ? { count: 0, resetAt: now + windowMs } : bucket;
  b.count++;
  return { bucket: b, ok: b.count <= limit };
}

/**
 * Throws a 503 with the honest setup message when no key is configured, and a 429 when the
 * user (or this server) has used up its AI allowance. Pass the user's id from every AI route.
 */
export function requireAI(userId?: string): ProviderConfig & { apiKey: string } {
  const c = aiConfig();
  if (!c.apiKey) throw new ApiError(503, NOT_CONFIGURED_MESSAGE);
  if (userId) {
    const u = spend(userCalls.get(userId), 60 * 60_000, PER_USER_PER_HOUR);
    userCalls.set(userId, u.bucket);
    if (!u.ok) throw new ApiError(429, "You've reached this hour's limit for the AI assistant. Try again a little later.");
    const g = spend(instanceCalls, 24 * 60 * 60_000, PER_INSTANCE_PER_DAY);
    instanceCalls = g.bucket;
    if (!g.ok) throw new ApiError(429, "The AI assistant has reached today's limit on this server. Try again tomorrow.");
  }
  return c as ProviderConfig & { apiKey: string };
}

/* ------------------------------------------------------------------ */
/* Normalised chat interface                                           */
/* ------------------------------------------------------------------ */

export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema (type: object)
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type ChatMessage =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; toolCalls?: ToolCall[] }
  | { role: "tool"; results: { id: string; name: string; content: string; isError?: boolean }[] };

export interface ChatRequest {
  system: string;
  messages: ChatMessage[];
  tools?: ToolSpec[];
  maxTokens?: number;
  temperature?: number;
}

export interface ChatResponse {
  text: string;
  toolCalls: ToolCall[];
  stopReason: string | null;
}

/** Provider errors surfaced to the user verbatim-ish (status kept truthful). */
export class AIProviderError extends ApiError {}

export async function chat(req: ChatRequest): Promise<ChatResponse> {
  const cfg = requireAI();
  return cfg.provider === "anthropic" ? chatAnthropic(cfg, req) : chatOpenAI(cfg, req);
}

/* ------------------------------------------------------------------ */
/* Anthropic                                                           */
/* ------------------------------------------------------------------ */

let anthropicClient: { key: string; client: Anthropic } | null = null;
function anthropic(key: string) {
  if (!anthropicClient || anthropicClient.key !== key) anthropicClient = { key, client: new Anthropic({ apiKey: key, maxRetries: 1, timeout: 90_000 }) };
  return anthropicClient.client;
}

function toAnthropicMessages(messages: ChatMessage[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  const push = (role: "user" | "assistant", blocks: Anthropic.ContentBlockParam[]) => {
    if (!blocks.length) return;
    const last = out[out.length - 1];
    if (last && last.role === role && Array.isArray(last.content)) (last.content as Anthropic.ContentBlockParam[]).push(...blocks);
    else out.push({ role, content: blocks });
  };
  for (const m of messages) {
    if (m.role === "user") push("user", m.text.trim() ? [{ type: "text", text: m.text }] : []);
    else if (m.role === "assistant") {
      const blocks: Anthropic.ContentBlockParam[] = [];
      if (m.text.trim()) blocks.push({ type: "text", text: m.text });
      for (const c of m.toolCalls ?? []) blocks.push({ type: "tool_use", id: c.id, name: c.name, input: c.input });
      push("assistant", blocks);
    } else {
      push(
        "user",
        m.results.map((r) => ({ type: "tool_result" as const, tool_use_id: r.id, content: r.content, ...(r.isError ? { is_error: true } : {}) })),
      );
    }
  }
  // The conversation must start with a user turn.
  while (out[0] && out[0].role !== "user") out.shift();
  return out;
}

async function chatAnthropic(cfg: ProviderConfig & { apiKey: string }, req: ChatRequest): Promise<ChatResponse> {
  try {
    const res = await anthropic(cfg.apiKey).messages.create({
      model: cfg.model,
      max_tokens: req.maxTokens ?? 2048,
      system: req.system,
      messages: toAnthropicMessages(req.messages),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      ...(req.tools?.length
        ? { tools: req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters as Anthropic.Tool.InputSchema })) }
        : {}),
    });
    let text = "";
    const toolCalls: ToolCall[] = [];
    for (const block of res.content) {
      if (block.type === "text") text += block.text;
      else if (block.type === "tool_use") toolCalls.push({ id: block.id, name: block.name, input: (block.input ?? {}) as Record<string, unknown> });
    }
    return { text, toolCalls, stopReason: res.stop_reason ?? null };
  } catch (err) {
    throw mapProviderError("Anthropic", err);
  }
}

/* ------------------------------------------------------------------ */
/* OpenAI (plain fetch, Chat Completions with function tools)          */
/* ------------------------------------------------------------------ */

type OpenAIMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[] }
  | { role: "tool"; tool_call_id: string; content: string };

function toOpenAIMessages(system: string, messages: ChatMessage[]): OpenAIMessage[] {
  const out: OpenAIMessage[] = [{ role: "system", content: system }];
  for (const m of messages) {
    if (m.role === "user") out.push({ role: "user", content: m.text });
    else if (m.role === "assistant") {
      out.push({
        role: "assistant",
        content: m.text || null,
        ...(m.toolCalls?.length
          ? { tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: "function" as const, function: { name: c.name, arguments: JSON.stringify(c.input) } })) }
          : {}),
      });
    } else for (const r of m.results) out.push({ role: "tool", tool_call_id: r.id, content: r.content });
  }
  return out;
}

async function chatOpenAI(cfg: ProviderConfig & { apiKey: string }, req: ChatRequest): Promise<ChatResponse> {
  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: req.maxTokens ?? 2048,
        messages: toOpenAIMessages(req.system, req.messages),
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(req.tools?.length
          ? { tools: req.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } })) }
          : {}),
      }),
      signal: AbortSignal.timeout(90_000),
    });
  } catch (err) {
    throw new AIProviderError(502, `Couldn't reach OpenAI: ${err instanceof Error ? err.message : "network error"}`);
  }
  const json = (await res.json().catch(() => null)) as {
    error?: { message?: string };
    choices?: { message?: { content?: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[] }; finish_reason?: string }[];
  } | null;
  if (!res.ok) throw httpError("OpenAI", res.status, json?.error?.message);
  const choice = json?.choices?.[0];
  const toolCalls: ToolCall[] = (choice?.message?.tool_calls ?? []).map((c) => {
    let input: Record<string, unknown> = {};
    try {
      input = JSON.parse(c.function.arguments || "{}");
    } catch {
      /* malformed arguments: leave empty, validation will report it */
    }
    return { id: c.id, name: c.function.name, input };
  });
  return { text: choice?.message?.content ?? "", toolCalls, stopReason: choice?.finish_reason ?? null };
}

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

function httpError(provider: string, status: number, detail?: string): AIProviderError {
  const d = detail ? ` (${detail})` : "";
  if (status === 401) return new AIProviderError(502, `${provider} rejected the API key — check the key in .env${d}`);
  if (status === 403) return new AIProviderError(502, `${provider} denied access for this key or model${d}`);
  if (status === 404) return new AIProviderError(502, `${provider} couldn't find the model — check AI_MODEL${d}`);
  if (status === 429) return new AIProviderError(429, `${provider} rate limit or quota reached — try again shortly${d}`);
  if (status === 400) return new AIProviderError(502, `${provider} rejected the request${d}`);
  if (status >= 500) return new AIProviderError(502, `${provider} is having problems right now (HTTP ${status})${d}`);
  return new AIProviderError(502, `${provider} request failed (HTTP ${status})${d}`);
}

function mapProviderError(provider: string, err: unknown): AIProviderError {
  if (err instanceof AIProviderError) return err;
  if (err instanceof AnthropicAPIError) {
    const body = err.error as { error?: { message?: string } } | undefined;
    const detail = body?.error?.message ?? err.message;
    if (err.status === undefined || err.status === null) return new AIProviderError(502, `Couldn't reach ${provider}: ${detail}`);
    return httpError(provider, err.status, detail);
  }
  return new AIProviderError(502, `${provider} request failed: ${err instanceof Error ? err.message : "unknown error"}`);
}

/* ------------------------------------------------------------------ */
/* JSON helper                                                         */
/* ------------------------------------------------------------------ */

/** Extracts the first JSON object/array from a model reply (tolerates ```json fences). */
export function extractJSON<T = unknown>(text: string): T | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced ? fenced[1]! : text;
  const start = candidate.search(/[[{]/);
  if (start < 0) return null;
  const open = candidate[start];
  const close = open === "{" ? "}" : "]";
  const end = candidate.lastIndexOf(close);
  if (end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
