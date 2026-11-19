import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { ApiError, query, route } from "@/lib/api";
import { storagePath } from "@/lib/tasks";
import { isDemo } from "@/lib/demo-mode";

export const runtime = "nodejs";
const MAX_BYTES = 10 * 1024 * 1024;

/** GET /api/attachments?taskId= → metadata only. */
export const GET = route(async ({ req, user }) => {
  const taskId = query(req).get("taskId");
  const items = await db.attachment.findMany({
    where: { userId: user.id, ...(taskId ? { taskId } : {}) },
    select: { id: true, taskId: true, fileName: true, mimeType: true, size: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  return { items };
});

/** POST multipart/form-data: file, taskId? → { item } */
export const POST = route(async ({ req, user }) => {
  if (isDemo()) throw new ApiError(403, "Attachments are off in the demo");
  // Serverless hosts (Vercel) have a read-only, throwaway file system: refuse clearly instead of failing.
  if (process.env.VERCEL && !process.env.STORAGE_DIR) throw new ApiError(503, "File attachments need persistent storage, which isn't set up on this server yet.");
  const declared = Number(req.headers.get("content-length") || 0);
  if (declared > MAX_BYTES + 64 * 1024) throw new ApiError(413, "File is larger than 10 MB");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new ApiError(400, "Expected multipart/form-data");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw new ApiError(400, "file is required");
  if (file.size === 0) throw new ApiError(400, "File is empty");
  if (file.size > MAX_BYTES) throw new ApiError(413, "File is larger than 10 MB");
  const taskId = (form.get("taskId") as string | null) || null;
  if (taskId && !(await db.task.findFirst({ where: { id: taskId, userId: user.id }, select: { id: true } })))
    throw new ApiError(404, "Task not found");

  const storageKey = `${user.id}/${randomUUID()}`;
  const dest = storagePath(storageKey);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new ApiError(413, "File is larger than 10 MB");
  await fs.writeFile(dest, buf, { mode: 0o600 });

  const fileName = (file.name || "file").replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 200);
  const mimeType = (file.type || "application/octet-stream").slice(0, 120);
  const item = await db.attachment.create({
    data: { userId: user.id, taskId, fileName, mimeType, size: buf.length, storageKey },
    select: { id: true, taskId: true, fileName: true, mimeType: true, size: true, createdAt: true },
  });
  return { item };
});
