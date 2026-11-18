import { z } from "zod";
import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { body, query, route } from "@/lib/api";
import { NO_STORE, assertAllowed, categorySchema, fieldsSchema, readFields, redact, sealFields } from "./_lib";

export const GET = route(async ({ req, user }) => {
  const sp = query(req);
  const scope = sp.get("scope");
  // The vault has no archive state.
  if (scope === "archived") return NextResponse.json({ items: [] }, { headers: NO_STORE });
  const q = sp.get("q")?.trim();
  const where: Prisma.VaultItemWhereInput = { userId: user.id, deletedAt: scope === "trash" ? { not: null } : null };
  if (q) where.OR = [{ title: { contains: q, mode: "insensitive" } }, { category: { contains: q, mode: "insensitive" } }];
  const rows = await db.vaultItem.findMany({ where, orderBy: scope === "trash" ? [{ deletedAt: "desc" }] : [{ category: "asc" }, { title: "asc" }] });
  const items = rows.map(({ fieldsEnc, userId: _u, ...r }) => ({ ...r, fields: scope === "trash" ? [] : redact(readFields(fieldsEnc)) }));
  return NextResponse.json({ items }, { headers: NO_STORE });
});

const createSchema = z.object({
  category: categorySchema,
  title: z.string().trim().min(1, "Enter a title").max(120),
  fields: fieldsSchema,
});

export const POST = route(async ({ req, user }) => {
  const input = await body(req, createSchema);
  assertAllowed(input.title, input.fields);
  const row = await db.vaultItem.create({
    data: { userId: user.id, category: input.category, title: input.title, fieldsEnc: sealFields(input.fields) },
  });
  return NextResponse.json(
    { item: { id: row.id, category: row.category, title: row.title, deletedAt: null, isDemo: false, createdAt: row.createdAt, updatedAt: row.updatedAt, fields: redact(input.fields) } },
    { headers: NO_STORE },
  );
});
