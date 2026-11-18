import { PrismaClient, type Prisma } from "@prisma/client";
import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "pglite-prisma-adapter";
import { readdirSync, readFileSync } from "fs";
import path from "path";

/** The SQL of every migration in prisma/migrations, in order. */
export function migrationSql(dir = path.join(process.cwd(), "prisma", "migrations")) {
  return readdirSync(dir)
    .filter((d) => /^\d/.test(d))
    .sort()
    .map((d) => readFileSync(path.join(dir, d, "migration.sql"), "utf8"))
    .join("\n");
}

/**
 * Prisma client backed by an in-memory Postgres (PGlite) with the app's schema applied.
 * PGlite runs queries one at a time in call order, so the schema is in place before the first query.
 */
export function createDemoClient() {
  const pg = new PGlite();
  pg.exec(migrationSql()).catch((err) => console.error("[demo] schema setup failed", err));
  // pglite-prisma-adapter 0.6 is typed against an older @prisma/driver-adapter-utils; it passes values through
  // unchanged, which works with Prisma 6.19 (covered by demo-mode.test.ts).
  const adapter = new PrismaPGlite(pg) as unknown as NonNullable<Prisma.PrismaClientOptions["adapter"]>;
  return new PrismaClient({ adapter });
}
