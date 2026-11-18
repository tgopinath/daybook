import { z } from "zod";
import { body, route } from "@/lib/api";
import { softDeleteRecord } from "@/lib/ai/records";

export const dynamic = "force-dynamic";

const schema = z.object({ kind: z.enum(["task", "reminder", "event", "habit", "note"]), id: z.string().min(1).max(64) });

/** Undo for a just-captured item: soft delete (restorable from Trash). */
export const POST = route(async ({ req, user }) => {
  const { kind, id } = await body(req, schema);
  await softDeleteRecord(user.id, kind, id);
  return { ok: true };
});
