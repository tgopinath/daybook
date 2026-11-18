// Creates a local demo account with sample data: `npm run db:seed`.
// Credentials are for local development only.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

export const DEMO_EMAIL = "demo@daybook.test";
export const DEMO_PASSWORD = "daybook-demo-2026";

async function main() {
  const db = new PrismaClient();
  const existing = await db.user.findUnique({ where: { email: DEMO_EMAIL } });
  if (existing) {
    console.log(`Demo user already exists: ${DEMO_EMAIL}`);
    return;
  }
  const tz = process.env.SEED_TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const user = await db.user.create({
    data: { email: DEMO_EMAIL, name: "Alex Rivera", passwordHash: await bcrypt.hash(DEMO_PASSWORD, 12), settings: { create: { timezone: tz } } },
  });
  // demo.ts imports "server-only", which throws outside Next — stub it for the seed.
  const Module = await import("module");
  const orig = (Module.default as unknown as { _load: (...a: unknown[]) => unknown })._load;
  (Module.default as unknown as { _load: (...a: unknown[]) => unknown })._load = function (req: unknown, ...rest: unknown[]) {
    if (req === "server-only") return {};
    return orig.call(this, req, ...rest);
  };
  const { seedDemoData } = await import("../src/lib/demo");
  await seedDemoData(user.id, tz);
  console.log(`Created ${DEMO_EMAIL} / ${DEMO_PASSWORD} with sample data (timezone ${tz}).`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
