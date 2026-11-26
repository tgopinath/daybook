import { z } from "zod";
import { db } from "@/lib/db";
import { body, route, tzOf } from "@/lib/api";
import { dayKey } from "@/lib/time";

const input = z.object({ content: z.string().trim().min(1, "Write a few words first").max(20000) });

type Node = { type: string; text?: string; content?: Node[] };

/** Plain text → TipTap doc: blank lines split paragraphs, single newlines become hard breaks. */
function toDoc(text: string) {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const content: Node[] = paragraphs.map((p) => {
    const parts: Node[] = [];
    p.split("\n").forEach((line, i) => {
      if (i > 0) parts.push({ type: "hardBreak" });
      if (line) parts.push({ type: "text", text: line });
    });
    return { type: "paragraph", content: parts };
  });
  return { type: "doc", content };
}

/** Quick journal entry from the My space Journal widget: a finished (non-draft) entry dated today. */
export const POST = route(async ({ req, user }) => {
  const { content } = await body(req, input);
  const text = content.replace(/\r\n/g, "\n");
  const entry = await db.journalEntry.create({
    data: {
      userId: user.id,
      title: "",
      content: toDoc(text),
      plainText: text,
      entryDate: dayKey(new Date(), tzOf(req)),
      isDraft: false,
      wordCount: text.split(/\s+/).filter(Boolean).length,
    },
    select: { id: true, entryDate: true },
  });
  return { entry };
});
