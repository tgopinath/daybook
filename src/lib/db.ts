import { PrismaClient } from "@prisma/client";
import { isDemo } from "./demo-mode";
import { createDemoClient } from "./demo-db";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Without DATABASE_URL the app runs in demo mode on an in-memory database (see demo-mode.ts).
// The demo client is kept on globalThis in production too, so there is one database per server process.
export const db =
  globalForPrisma.prisma ??
  (isDemo()
    ? createDemoClient()
    : new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"] }));

if (process.env.NODE_ENV !== "production" || isDemo()) globalForPrisma.prisma = db;
