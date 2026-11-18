import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { route } from "@/lib/api";
import { NO_STORE, readFields } from "../_lib";

/** Decrypted vault export, downloaded through an authenticated fetch (never a link with data in it). */
export const GET = route(async ({ user }) => {
  const rows = await db.vaultItem.findMany({ where: { userId: user.id, deletedAt: null }, orderBy: [{ category: "asc" }, { title: "asc" }] });
  const data = {
    app: "daybook",
    kind: "vault-export",
    exportedAt: new Date().toISOString(),
    items: rows.map((r) => ({ category: r.category, title: r.title, fields: readFields(r.fieldsEnc), createdAt: r.createdAt, updatedAt: r.updatedAt })),
  };
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: { ...NO_STORE, "content-type": "application/json", "content-disposition": `attachment; filename="daybook-vault-${stamp}.json"` },
  });
});
