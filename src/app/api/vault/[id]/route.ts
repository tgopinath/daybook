import { z } from "zod";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { body, notFound, query, route } from "@/lib/api";
import { NO_STORE, assertAllowed, categorySchema, fieldsSchema, readFields, sealFields } from "../_lib";

/** Full, decrypted item. Only fetched on reveal / edit and never cached. */
export const GET = route<{ id: string }>(async ({ user, params }) => {
  const row = await db.vaultItem.findFirst({ where: { id: params.id, userId: user.id } });
  if (!row) throw notFound("Item");
  const { fieldsEnc, userId: _u, ...rest } = row;
  return NextResponse.json({ item: { ...rest, fields: readFields(fieldsEnc) } }, { headers: NO_STORE });
});

const patchSchema = z.object({
  category: categorySchema.optional(),
  title: z.string().trim().min(1, "Enter a title").max(120).optional(),
  fields: fieldsSchema.optional(),
  deletedAt: z.null().optional(),
  archived: z.boolean().optional(), // accepted for contract parity; the vault has no archive
});

export const PATCH = route<{ id: string }>(async ({ req, user, params }) => {
  const input = await body(req, patchSchema);
  const row = await db.vaultItem.findFirst({ where: { id: params.id, userId: user.id } });
  if (!row) throw notFound("Item");
  const title = input.title ?? row.title;
  const fields = input.fields ?? readFields(row.fieldsEnc);
  if (input.title !== undefined || input.fields !== undefined) assertAllowed(title, fields);
  const updated = await db.vaultItem.update({
    where: { id: row.id },
    data: {
      ...(input.category ? { category: input.category } : {}),
      ...(input.title !== undefined ? { title } : {}),
      ...(input.fields !== undefined ? { fieldsEnc: sealFields(fields) } : {}),
      ...(input.deletedAt === null ? { deletedAt: null } : {}),
    },
  });
  const { fieldsEnc: _f, userId: _u, ...rest } = updated;
  return NextResponse.json({ item: rest }, { headers: NO_STORE });
});

export const DELETE = route<{ id: string }>(async ({ req, user, params }) => {
  const permanent = query(req).get("permanent") === "1";
  const where = { id: params.id, userId: user.id };
  const res = permanent ? await db.vaultItem.deleteMany({ where }) : await db.vaultItem.updateMany({ where, data: { deletedAt: new Date() } });
  if (!res.count) throw notFound("Item");
  return { ok: true };
});
