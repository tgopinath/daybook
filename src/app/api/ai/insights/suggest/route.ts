import { ApiError, route, tzOf } from "@/lib/api";
import { chat, extractJSON, requireAI } from "@/lib/ai/provider";
import { buildSnapshot, snapshotToText } from "@/lib/ai/context";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = route(async ({ req, user }) => {
  requireAI(user.id);
  const tz = tzOf(req);
  const snapshot = await buildSnapshot(user.id, tz);
  const res = await chat({
    system:
      "You are a concise productivity coach. From the user's data, give exactly 3 short, specific, actionable recommendations for today. Reference real task/goal names. Reply with JSON only: {\"suggestions\":[{\"title\":\"max 8 words\",\"detail\":\"one sentence, max 25 words\"}]}",
    messages: [{ role: "user", text: `My data:\n${snapshotToText(snapshot)}` }],
    maxTokens: 600,
  });
  const json = extractJSON<{ suggestions?: { title?: unknown; detail?: unknown }[] }>(res.text);
  const suggestions = (json?.suggestions ?? [])
    .filter((s) => typeof s.title === "string" && s.title)
    .slice(0, 3)
    .map((s) => ({ title: String(s.title).slice(0, 120), detail: typeof s.detail === "string" ? s.detail.slice(0, 300) : "" }));
  if (!suggestions.length) throw new ApiError(502, "The AI reply couldn't be read as suggestions — try again");
  return { suggestions, generatedAt: new Date().toISOString() };
});
